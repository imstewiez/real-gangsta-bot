'use strict';
const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const { safeReply, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { successEmbed, stockEmbed, brandEmbed } = require('../shared/embedBuilders');
const { recordDelivery, adjustStock, getCurrentStock } = require('./inventoryEngine');
const { buildItemSelectMenu, buildStockAdjustmentModal } = require('./inventoryMenus');
const { inventoryRepo, memberRepo } = require('../repositories');
const { isChefia } = require('../permissions/permissionEngine');
const MESSAGES = require('../shared/errorMessages');

const pendingItemSelections = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// REGISTAR MATERIAL — fluxo unificado: Entrega ou Venda
// ═══════════════════════════════════════════════════════════════════════════

// Step 1: Morador clica "Registar Material" → escolhe Entrega ou Venda
async function handleRegistarMaterialButton(interaction) {
  const options = [
    { label: 'Entrega (dar material ao grupo)', description: 'Material entregue sem pagamento', value: 'entrega' },
    { label: 'Venda (vender material ao grupo)', description: 'Material vendido — valor calculado automaticamente', value: 'venda' },
  ];

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('inv::select_tipo_registo')
      .setPlaceholder('Entrega ou Venda?')
      .addOptions(options)
  );

  await safeReply(interaction, {
    content: 'Queres **entregar** (dar) ou **vender** material ao grupo?',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

// Step 2: Escolheu entrega ou venda → mostra dropdown de materiais
async function handleTipoRegistoSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const tipo = interaction.values[0]; // 'entrega' ou 'venda'
  pendingItemSelections.set(interaction.user.id, { tipo });

  const prefix = tipo === 'venda' ? 'inv::select_item_venda' : 'inv::select_item_entrega';
  const menu = await buildItemSelectMenu(prefix, 'Seleciona o material');
  await safeReply(interaction, {
    content: tipo === 'venda'
      ? 'Que material queres **vender**? O valor será calculado automaticamente.'
      : 'Que material queres **entregar**?',
    components: [menu],
    flags: MessageFlags.Ephemeral,
  });
}

// Step 3: Escolheu o item → mostra modal com quantidade
async function handleItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;

  const itemId = interaction.values[0];
  if (itemId === 'none') {
    return safeReply(interaction, { content: 'Sem itens disponíveis.', flags: MessageFlags.Ephemeral });
  }

  const item = await inventoryRepo.getItemById(parseInt(itemId));
  if (!item) {
    return safeReply(interaction, { content: MESSAGES.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral });
  }

  const customId = interaction.customId;
  const isVenda = customId.includes('venda');
  const pending = pendingItemSelections.get(interaction.user.id) || {};
  pending.itemId = parseInt(itemId);
  pending.itemName = item.name;
  pending.itemPrice = parseFloat(item.estimated_value) || 0;
  pending.movementType = isVenda ? 'venda_morador' : 'entrega_morador';
  pendingItemSelections.set(interaction.user.id, pending);

  const priceInfo = isVenda && pending.itemPrice > 0
    ? `\nPreço unitário: ${pending.itemPrice}\u20AC`
    : '';

  const modal = new ModalBuilder()
    .setCustomId(isVenda ? 'inv::modal_venda_morador' : 'inv::modal_entrega_morador')
    .setTitle(isVenda ? `Vender ${item.name}` : `Entregar ${item.name}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(`Quantidade de ${item.name}${isVenda && pending.itemPrice ? ` (${pending.itemPrice}\u20AC cada)` : ''}`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 10')
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Observações (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Notas adicionais...')
          .setRequired(false)
          .setMaxLength(500)
      ),
    );

  await safeShowModal(interaction, modal);
}

// Step 4: Modal submetido → regista o movimento
async function handleQuantityModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending) {
    return interaction.editReply({ content: 'Sessão expirada. Tenta novamente.' });
  }

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr);

  if (isNaN(quantity) || quantity <= 0) {
    return interaction.editReply({ content: MESSAGES.INVALID_QUANTITY() });
  }

  try {
    const member = await memberRepo.findByDiscordId(interaction.user.id);
    let movementType = pending.movementType;
    if (member?.role === 'oficial' && movementType === 'entrega_morador') {
      movementType = 'entrega_oficial';
    }

    const result = await recordDelivery({
      discordId: interaction.user.id,
      itemId: pending.itemId,
      quantity,
      movementType,
      notes,
      createdBy: interaction.user.id,
    });

    pendingItemSelections.delete(interaction.user.id);

    const isVenda = movementType === 'venda_morador';
    const totalValue = isVenda ? quantity * (pending.itemPrice || 0) : 0;

    let description = `**${quantity}x** ${pending.itemName}`;
    if (isVenda && totalValue > 0) {
      description += `\nPreço unitário: **${pending.itemPrice}\u20AC**`;
      description += `\nTotal: **${totalValue.toLocaleString('pt-PT')}\u20AC**`;
    }
    description += `\nRegistado por <@${interaction.user.id}>`;
    if (notes) description += `\nNotas: ${notes}`;

    const typeLabel = isVenda ? 'Venda Registada' : 'Entrega Registada';
    const embed = successEmbed(typeLabel, description);

    return interaction.editReply({ embeds: [embed] });
  } catch (e) {
    return interaction.editReply({ content: `Erro: ${e.message}` });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STOCK
// ═══════════════════════════════════════════════════════════════════════════

async function handleStockCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const stock = await getCurrentStock();
  const embed = stockEmbed(stock);
  return interaction.editReply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════════════════
// AJUSTE MANUAL DE STOCK (Chefia)
// ═══════════════════════════════════════════════════════════════════════════

async function handleAdjustStockButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('ajustar stock'), flags: MessageFlags.Ephemeral });
  }
  const menu = await buildItemSelectMenu('inv::select_ajuste', 'Seleciona o item para ajustar');
  await safeReply(interaction, { content: 'Que item queres ajustar?', components: [menu], flags: MessageFlags.Ephemeral });
}

async function handleAdjustSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = interaction.values[0];
  pendingItemSelections.set(interaction.user.id, { itemId: parseInt(itemId), movementType: 'ajuste_manual' });
  const modal = buildStockAdjustmentModal('inv::modal_ajuste_manual');
  await safeShowModal(interaction, modal);
}

async function handleAdjustModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending) return interaction.editReply({ content: 'Sessão expirada.' });

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr);
  if (isNaN(quantity)) return interaction.editReply({ content: 'Quantidade inválida.' });

  try {
    await adjustStock({ itemId: pending.itemId, quantity, notes, createdBy: interaction.user.id });
    pendingItemSelections.delete(interaction.user.id);
    const embed = successEmbed('Stock Ajustado', `Ajuste de **${quantity}** aplicado.\nRazão: ${notes}`);
    return interaction.editReply({ embeds: [embed] });
  } catch (e) {
    return interaction.editReply({ content: `Erro: ${e.message}` });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GESTÃO DE MATERIAIS (Chefia) — adicionar, editar preço, remover
// ═══════════════════════════════════════════════════════════════════════════

async function handleGerirMateriaisButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('gerir materiais'), flags: MessageFlags.Ephemeral });
  }

  const options = [
    { label: 'Adicionar Material', description: 'Criar novo item no catálogo', value: 'add' },
    { label: 'Editar Preço', description: 'Alterar preço de um material existente', value: 'edit_price' },
    { label: 'Desativar Material', description: 'Remover material do catálogo', value: 'deactivate' },
    { label: 'Reativar Material', description: 'Reativar material desativado', value: 'reactivate' },
    { label: 'Ver Catálogo Completo', description: 'Lista todos os materiais com preços', value: 'list' },
  ];

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('inv::select_gerir_action')
      .setPlaceholder('O que queres fazer?')
      .addOptions(options)
  );

  await safeReply(interaction, { content: 'Gestão de Materiais — escolhe uma ação:', components: [row], flags: MessageFlags.Ephemeral });
}

async function handleGerirActionSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const action = interaction.values[0];

  if (action === 'list') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const items = await inventoryRepo.getItems(false); // include inactive
    if (!items.length) return interaction.editReply({ content: 'Catálogo vazio.' });

    const grouped = {};
    for (const item of items) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    }

    const lines = [];
    for (const [cat, catItems] of Object.entries(grouped)) {
      lines.push(`**\u2500\u2500 ${cat.toUpperCase()} \u2500\u2500**`);
      for (const item of catItems) {
        const status = item.active ? '' : ' \u274C *desativado*';
        const price = item.estimated_value ? `**${parseFloat(item.estimated_value).toLocaleString('pt-PT')}\u20AC**` : '*sem preço*';
        lines.push(`  ${item.name} \u2014 ${price}${status}`);
      }
    }

    const embed = brandEmbed().setTitle('Catálogo de Materiais').setDescription(lines.join('\n'));
    return interaction.editReply({ embeds: [embed] });
  }

  if (action === 'add') {
    const modal = new ModalBuilder()
      .setCustomId('inv::modal_add_item')
      .setTitle('Adicionar Material')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Nome do material')
            .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('category').setLabel('Categoria (madeiras/metais/quimicos/reciclagem/texteis/componentes/outros)')
            .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30).setPlaceholder('outros')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('price').setLabel('Preço de venda (em \u20AC)')
            .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder('Ex: 100')
        ),
      );
    return safeShowModal(interaction, modal);
  }

  if (action === 'edit_price') {
    pendingItemSelections.set(interaction.user.id, { action: 'edit_price' });
    const menu = await buildItemSelectMenu('inv::select_edit_item', 'Seleciona o material');
    return safeReply(interaction, { content: 'Que material queres editar?', components: [menu], flags: MessageFlags.Ephemeral });
  }

  if (action === 'deactivate') {
    pendingItemSelections.set(interaction.user.id, { action: 'deactivate' });
    const menu = await buildItemSelectMenu('inv::select_deactivate_item', 'Seleciona o material a desativar');
    return safeReply(interaction, { content: 'Que material queres desativar?', components: [menu], flags: MessageFlags.Ephemeral });
  }

  if (action === 'reactivate') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const items = await inventoryRepo.getItems(false);
    const inactive = items.filter(i => !i.active);
    if (!inactive.length) return interaction.editReply({ content: 'Sem materiais desativados.' });

    const options = inactive.slice(0, 25).map(i => ({
      label: i.name,
      description: `${i.category} \u2014 ${i.estimated_value || 0}\u20AC`,
      value: String(i.id),
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('inv::select_reactivate_item')
        .setPlaceholder('Seleciona o material a reativar')
        .addOptions(options)
    );

    return interaction.editReply({ content: 'Que material queres reativar?', components: [row] });
  }
}

async function handleAddItemModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = getModalField(interaction, 'name').trim();
  const category = getModalField(interaction, 'category').toLowerCase().trim();
  const priceStr = getModalField(interaction, 'price');
  const price = parseFloat(priceStr.replace(',', '.'));

  if (!name) return interaction.editReply({ content: 'Nome obrigatório.' });
  if (isNaN(price) || price < 0) return interaction.editReply({ content: 'Preço inválido.' });

  const existing = await inventoryRepo.getItemByName(name);
  if (existing) return interaction.editReply({ content: `Material "${name}" já existe.` });

  await inventoryRepo.createItem({ name, category, unit: 'unidade', estimatedValue: price });

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'item_created', entityType: 'item', entityId: name,
    actorId: interaction.user.id, afterState: { name, category, price },
  });

  const embed = successEmbed('Material Adicionado', `**${name}**\nCategoria: ${category}\nPreço: **${price}\u20AC**`);
  return interaction.editReply({ embeds: [embed] });
}

async function handleEditItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) return safeReply(interaction, { content: MESSAGES.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral });

  pendingItemSelections.set(interaction.user.id, { action: 'edit_price', itemId, itemName: item.name });

  const modal = new ModalBuilder()
    .setCustomId('inv::modal_edit_price')
    .setTitle(`Editar ${item.name}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('price').setLabel(`Novo preço (atual: ${item.estimated_value || 0}\u20AC)`)
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
          .setPlaceholder(String(item.estimated_value || 0))
      ),
    );

  await safeShowModal(interaction, modal);
}

async function handleEditPriceModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending || pending.action !== 'edit_price') return interaction.editReply({ content: 'Sessão expirada.' });

  const priceStr = getModalField(interaction, 'price');
  const price = parseFloat(priceStr.replace(',', '.'));
  if (isNaN(price) || price < 0) return interaction.editReply({ content: 'Preço inválido.' });

  const oldItem = await inventoryRepo.getItemById(pending.itemId);
  await inventoryRepo.updateItem(pending.itemId, { estimated_value: price });
  pendingItemSelections.delete(interaction.user.id);

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'item_price_updated', entityType: 'item', entityId: pending.itemName,
    actorId: interaction.user.id,
    beforeState: { price: oldItem?.estimated_value },
    afterState: { price },
  });

  const embed = successEmbed('Preço Atualizado', `**${pending.itemName}**\nPreço anterior: ${oldItem?.estimated_value || 0}\u20AC\nNovo preço: **${price}\u20AC**`);
  return interaction.editReply({ embeds: [embed] });
}

async function handleDeactivateItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) return interaction.editReply({ content: MESSAGES.ITEM_NOT_FOUND() });

  await inventoryRepo.updateItem(itemId, { active: false });

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'item_deactivated', entityType: 'item', entityId: item.name,
    actorId: interaction.user.id,
  });

  const embed = successEmbed('Material Desativado', `**${item.name}** foi removido do catálogo.\nPodes reativá-lo a qualquer momento.`);
  return interaction.editReply({ embeds: [embed] });
}

async function handleReactivateItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) return interaction.editReply({ content: MESSAGES.ITEM_NOT_FOUND() });

  await inventoryRepo.updateItem(itemId, { active: true });

  const embed = successEmbed('Material Reativado', `**${item.name}** está novamente disponível no catálogo.`);
  return interaction.editReply({ embeds: [embed] });
}

module.exports = {
  handleRegistarMaterialButton,
  handleTipoRegistoSelect,
  handleItemSelect,
  handleQuantityModal,
  handleStockCommand,
  handleAdjustStockButton,
  handleAdjustSelect,
  handleAdjustModal,
  handleGerirMateriaisButton,
  handleGerirActionSelect,
  handleAddItemModal,
  handleEditItemSelect,
  handleEditPriceModal,
  handleDeactivateItemSelect,
  handleReactivateItemSelect,
  pendingItemSelections,
};
