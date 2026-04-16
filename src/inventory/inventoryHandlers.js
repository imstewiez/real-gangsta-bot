'use strict';
const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const {
  safeReply, safeUpdate, safeShowModal,
  getModalField, isDuplicate,
} = require('../shared/interactionHelpers');
const { successEmbed, stockEmbed, brandEmbed, progressBar } = require('../shared/embedBuilders');
const { recordDelivery, adjustStock, getCurrentStock } = require('./inventoryEngine');
const { buildItemSelectMenu, buildStockAdjustmentModal } = require('./inventoryMenus');
const { inventoryRepo, memberRepo } = require('../repositories');
const { isChefia } = require('../permissions/permissionEngine');
const { EMOJI, ERRORS, MODALS, INVENTORY } = require('../content');

const pendingItemSelections = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// REGISTAR MATERIAL — fluxo unificado: Entrega ou Venda
// ═══════════════════════════════════════════════════════════════════════════

// Step 1: Morador clica "Registar Material" → escolhe Entrega ou Venda
async function handleRegistarMaterialButton(interaction) {
  const options = [
    { label: 'Entrega (dar material)', description: 'Material entregue à casa sem pagamento', value: 'entrega', emoji: '📥' },
    { label: 'Venda (vender material)', description: 'Material vendido — valor calculado automaticamente', value: 'venda', emoji: '💰' },
  ];

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('inv::select_tipo_registo')
      .setPlaceholder(INVENTORY.SELECTS.TIPO_REGISTO)
      .setMinValues(1).setMaxValues(1)
      .addOptions(options)
  );

  await safeReply(interaction, {
    content: INVENTORY.PROMPTS.ENTREGA_OU_VENDA,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

// Step 2: Escolheu entrega ou venda → mostra dropdown de materiais (in-place)
async function handleTipoRegistoSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const tipo = interaction.values[0]; // 'entrega' ou 'venda'
  pendingItemSelections.set(interaction.user.id, { tipo });

  const prefix = tipo === 'venda' ? 'inv::select_item_venda' : 'inv::select_item_entrega';
  const menu = await buildItemSelectMenu(prefix, 'Seleciona o material');
  await safeUpdate(interaction, {
    content: tipo === 'venda'
      ? INVENTORY.PROMPTS.QUE_MATERIAL_VENDA
      : INVENTORY.PROMPTS.QUE_MATERIAL_ENTREGA,
    components: [menu],
  });
}

// Step 3: Escolheu o item → mostra modal com quantidade
async function handleItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;

  const itemId = interaction.values[0];
  if (itemId === 'none') {
    return safeReply(interaction, { content: 'Sem itens disponíveis.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const item = await inventoryRepo.getItemById(parseInt(itemId));
  if (!item) {
    return safeReply(interaction, { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const customId = interaction.customId;
  const isVenda = customId.includes('venda');
  const pending = pendingItemSelections.get(interaction.user.id) || {};
  pending.itemId = parseInt(itemId);
  pending.itemName = item.name;
  pending.itemPrice = parseFloat(item.estimated_value) || 0;
  pending.movementType = isVenda ? 'venda_bairrista' : 'entrega_bairrista';
  pendingItemSelections.set(interaction.user.id, pending);

  const modal = new ModalBuilder()
    .setCustomId(isVenda ? 'inv::modal_venda_bairrista' : 'inv::modal_entrega_bairrista')
    .setTitle(isVenda ? `Vender ${item.name}` : `Entregar ${item.name}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(`Quantidade${isVenda && pending.itemPrice ? ` (${pending.itemPrice}\u20AC cada)` : ''}`)
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
    return safeReply(interaction, { content: 'Sessão expirada. Tenta novamente.' }, { dismissible: true });
  }

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr);

  if (isNaN(quantity) || quantity <= 0) {
    return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { dismissible: true });
  }

  try {
    const member = await memberRepo.findByDiscordId(interaction.user.id);
    let movementType = pending.movementType;
    if (member?.role === 'oficial' && (movementType === 'entrega_bairrista' || movementType === 'entrega_morador')) {
      movementType = 'entrega_oficial';
    }

    await recordDelivery({
      discordId: interaction.user.id,
      itemId: pending.itemId,
      quantity,
      movementType,
      notes,
      createdBy: interaction.user.id,
    });

    pendingItemSelections.delete(interaction.user.id);

    const isVenda = movementType === 'venda_bairrista' || movementType === 'venda_morador';
    const movValue = quantity * (pending.itemPrice || 0);

    // ── Auto-promoção ──────────────────────────────────────────────────────
    const { checkAndPromote, getPromotionProgress, formatTierName } =
      require('../members/autoPromotionEngine');
    const promoResult = await checkAndPromote(
      interaction.user.id, interaction.guild, interaction.client,
    ).catch(() => null);

    const title = isVenda
      ? `${EMOJI.LUCRO} Venda guardada`
      : `${EMOJI.MATERIAL} Entrega guardada`;

    const embed = brandEmbed('MOVEMENT').setTitle(title);
    const fields = [
      { name: 'Item',       value: `**${pending.itemName}**`, inline: true },
      { name: 'Quantidade', value: `**${quantity}**`,         inline: true },
    ];
    if (movValue > 0) {
      fields.push({
        name: 'Valor',
        value: `**${movValue.toLocaleString('pt-PT')} €**\n*${pending.itemPrice}€/un.*`,
        inline: true,
      });
    }
    if (notes) {
      fields.push({ name: 'Notas', value: notes, inline: false });
    }
    embed.addFields(fields);

    // Progresso / promoção
    if (promoResult?.promoted) {
      embed.addFields({
        name: `${EMOJI.LIDER} Subida automática`,
        value: `Parabéns — subiste para **${formatTierName(promoResult.to)}**.`,
        inline: false,
      });
    } else {
      const progress = await getPromotionProgress(interaction.user.id).catch(() => null);
      if (progress && !progress.maxedOut && progress.threshold) {
        const bar = progressBar(parseFloat(progress.progress), 100, { width: 12 });
        embed.addFields({
          name: `${EMOJI.TOPO} Progresso → ${progress.nextTierName}`,
          value:
            `${bar} **${progress.progress}%**\n` +
            `**${(progress.totalQty || 0).toLocaleString('pt-PT')}** / ${progress.threshold.toLocaleString('pt-PT')}` +
            ` · falta **${progress.remaining.toLocaleString('pt-PT')}**`,
          inline: false,
        });
      }
    }

    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STOCK
// ═══════════════════════════════════════════════════════════════════════════

async function handleStockCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const stock = await getCurrentStock();
  const embed = stockEmbed(stock);
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// AJUSTE MANUAL DE STOCK (Chefia)
// ═══════════════════════════════════════════════════════════════════════════

async function handleAdjustStockButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: ERRORS.NO_PERMISSION('ajustar stock'), flags: MessageFlags.Ephemeral }, { dismissible: true });
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
  if (!pending) return safeReply(interaction, { content: 'Sessão expirada.' }, { dismissible: true });

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr);
  if (isNaN(quantity)) return safeReply(interaction, { content: 'Quantidade inválida.' }, { dismissible: true });

  try {
    await adjustStock({ itemId: pending.itemId, quantity, notes, createdBy: interaction.user.id });
    pendingItemSelections.delete(interaction.user.id);
    const embed = successEmbed('Stock Ajustado', `Ajuste de **${quantity}** aplicado.\nRazão: ${notes}`);
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GESTÃO DE MATERIAIS (Chefia) — adicionar, editar preço, remover
// ═══════════════════════════════════════════════════════════════════════════

async function handleGerirMateriaisButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: ERRORS.NO_PERMISSION('gerir materiais'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const options = [
    { label: 'Adicionar Material', description: 'Criar novo item no catálogo', value: 'add', emoji: '➕' },
    { label: 'Editar Preço', description: 'Alterar preço de um material existente', value: 'edit_price', emoji: '✏️' },
    { label: 'Desativar Material', description: 'Remover material do catálogo', value: 'deactivate', emoji: '🗑️' },
    { label: 'Reativar Material', description: 'Reativar material desativado', value: 'reactivate', emoji: '🔄' },
    { label: 'Ver Catálogo Completo', description: 'Lista todos os materiais com preços', value: 'list', emoji: '📋' },
  ];

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('inv::select_gerir_action')
      .setPlaceholder(INVENTORY.SELECTS.GERIR_ACTION)
      .setMinValues(1).setMaxValues(1)
      .addOptions(options)
  );

  await safeReply(interaction, { content: `${EMOJI.EDITAR} Gestão de Materiais — escolhe uma ação:`, components: [row], flags: MessageFlags.Ephemeral });
}

async function handleGerirActionSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const action = interaction.values[0];

  if (action === 'list') {
    await interaction.deferUpdate().catch(() => {});
    const items = await inventoryRepo.getItems(false); // include inactive
    if (!items.length) {
      return safeReply(interaction, { content: 'Catálogo vazio.', flags: MessageFlags.Ephemeral }, { dismissible: true });
    }

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
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { dismissible: true });
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
          new TextInputBuilder().setCustomId('category').setLabel('Categoria')
            .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30)
            .setPlaceholder('madeiras / metais / quimicos / reciclagem / texteis / componentes / outros')
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
    return safeUpdate(interaction, { content: 'Que material queres editar?', components: [menu] });
  }

  if (action === 'deactivate') {
    pendingItemSelections.set(interaction.user.id, { action: 'deactivate' });
    const menu = await buildItemSelectMenu('inv::select_deactivate_item', 'Seleciona o material a desativar');
    return safeUpdate(interaction, { content: 'Que material queres desativar?', components: [menu] });
  }

  if (action === 'reactivate') {
    const items = await inventoryRepo.getItems(false);
    const inactive = items.filter(i => !i.active);
    if (!inactive.length) {
      return safeUpdate(interaction, { content: 'Sem materiais desativados.', components: [] }, { dismissible: true });
    }

    const options = inactive.slice(0, 25).map(i => ({
      label: i.name,
      description: `${i.category} \u2014 ${i.estimated_value || 0}\u20AC`,
      value: String(i.id),
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('inv::select_reactivate_item')
        .setPlaceholder('Seleciona o material a reativar')
        .setMinValues(1).setMaxValues(1)
        .addOptions(options)
    );

    return safeUpdate(interaction, { content: 'Que material queres reativar?', components: [row] });
  }
}

async function handleAddItemModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = getModalField(interaction, 'name').trim();
  const category = getModalField(interaction, 'category').toLowerCase().trim();
  const priceStr = getModalField(interaction, 'price');
  const price = parseFloat(priceStr.replace(',', '.'));

  if (!name) return safeReply(interaction, { content: 'Nome obrigatório.' }, { dismissible: true });
  if (isNaN(price) || price < 0) return safeReply(interaction, { content: 'Preço inválido.' }, { dismissible: true });

  const existing = await inventoryRepo.getItemByName(name);
  if (existing) return safeReply(interaction, { content: `Material "${name}" já existe.` }, { dismissible: true });

  await inventoryRepo.createItem({ name, category, unit: 'unidade', estimatedValue: price });

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'item_created', entityType: 'item', entityId: name,
    actorId: interaction.user.id, afterState: { name, category, price },
  });

  const embed = successEmbed('Material Adicionado', `**${name}**\nCategoria: ${category}\nPreço: **${price}\u20AC**`);
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

async function handleEditItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) return safeReply(interaction, { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral }, { dismissible: true });

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
  if (!pending || pending.action !== 'edit_price') return safeReply(interaction, { content: 'Sessão expirada.' }, { dismissible: true });

  const priceStr = getModalField(interaction, 'price');
  const price = parseFloat(priceStr.replace(',', '.'));
  if (isNaN(price) || price < 0) return safeReply(interaction, { content: 'Preço inválido.' }, { dismissible: true });

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
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

async function handleDeactivateItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});

  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) return safeReply(interaction, { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral }, { dismissible: true });

  await inventoryRepo.updateItem(itemId, { active: false });

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'item_deactivated', entityType: 'item', entityId: item.name,
    actorId: interaction.user.id,
  });

  const embed = successEmbed('Material Desativado', `**${item.name}** foi removido do catálogo.\nPodes reativá-lo a qualquer momento.`);
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { dismissible: true });
}

async function handleReactivateItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});

  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) return safeReply(interaction, { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral }, { dismissible: true });

  await inventoryRepo.updateItem(itemId, { active: true });

  const embed = successEmbed('Material Reativado', `**${item.name}** está novamente disponível no catálogo.`);
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCOMENDAS (orders)
// ═══════════════════════════════════════════════════════════════════════════

async function handleEncomendasButton(interaction) {
  const menu = await buildItemSelectMenu('inv::select_encomenda', 'Que material queres encomendar?');
  await safeReply(interaction, { content: 'Seleciona o material que queres encomendar:', components: [menu], flags: MessageFlags.Ephemeral });
}

async function handleEncomendaSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  if (!itemId || itemId === 'none') return;

  const item = await inventoryRepo.getItemById(itemId);
  if (!item) return safeReply(interaction, { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral }, { dismissible: true });

  pendingItemSelections.set(interaction.user.id, { itemId, itemName: item.name, action: 'order' });

  const modal = new ModalBuilder()
    .setCustomId('inv::modal_encomenda')
    .setTitle(`Encomendar ${item.name}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('quantity').setLabel('Quantidade')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder('Ex: 5')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes').setLabel('Notas (opcional)')
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)
      ),
    );

  await safeShowModal(interaction, modal);
}

async function handleEncomendaModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending || pending.action !== 'order') return safeReply(interaction, { content: 'Sessão expirada.' }, { dismissible: true });

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr);

  if (isNaN(quantity) || quantity <= 0) return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { dismissible: true });

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) return safeReply(interaction, { content: 'Não estás registado no sistema.' }, { dismissible: true });

  const { query } = require('../db');
  await query(
    `INSERT INTO orders (member_id, item_id, quantity, notes) VALUES ($1, $2, $3, $4)`,
    [member.id, pending.itemId, quantity, notes]
  );

  pendingItemSelections.delete(interaction.user.id);

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'order_created', entityType: 'order', entityId: String(member.id),
    actorId: interaction.user.id,
    afterState: { item: pending.itemName, quantity, notes },
  });

  const embed = successEmbed('Encomenda Registada',
    `**${quantity}x** ${pending.itemName}\nEstado: Pendente\n${notes ? `Notas: ${notes}` : ''}\n\nA chefia será notificada.`
  );

  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
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
  handleEncomendasButton,
  handleEncomendaSelect,
  handleEncomendaModal,
  pendingItemSelections,
};
