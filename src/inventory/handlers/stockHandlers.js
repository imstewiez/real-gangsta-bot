'use strict';
const {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { safeReply, safeUpdate, safeShowModal, getModalField } = require('../../shared/interactionHelpers');
const { replySafe } = require('../../shared/safeEmbed');
const { successEmbed, errorEmbed, stockEmbed, brandEmbed, applyLogo, COLOR } = require('../../shared/embedBuilders');
const { adjustStock, getCurrentStock } = require('../inventoryEngine');
const {
  buildCategorySelectMenu,
  buildItemSelectMenuForCategory,
  buildStockAdjustmentModal,
} = require('../inventoryMenus');
const { inventoryRepo, memberRepo } = require('../../repositories');
const { isChefia } = require('../../permissions/permissionEngine');
const { requirePermission } = require('../../shared/requirePermission');
const { EMOJI, ERRORS, INVENTORY } = require('../../content');

// Context efémero por user para fluxos multi-step de inventário.
// TTL de 15 minutos — limpa entradas abandonadas automaticamente.
const { createSessionStore } = require('../../shared/sessionStore');
const pendingItemSelections = createSessionStore('inventory', { ttlMs: 15 * 60 * 1000 });

function _setItemCtx(userId, ctx) {
  pendingItemSelections.set(userId, ctx);
}

// ═══════════════════════════════════════════════════════════════════════════
// STOCK
// ═══════════════════════════════════════════════════════════════════════════

async function handleStockCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const stock = await getCurrentStock();
  const embed = stockEmbed(stock);
  return replySafe(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

// ═══════════════════════════════════════════════════════════════════════════
// AJUSTE MANUAL DE STOCK (Chefia)
// ═══════════════════════════════════════════════════════════════════════════

async function handleAdjustStockButton(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const rows = await buildCategorySelectMenu('inv::cat_ajuste', 'Seleciona a categoria', {
    searchKey: `ajuste::${interaction.user.id}`,
    modalTitle: 'Pesquisar categoria',
  });
  await safeReply(interaction, {
    content: 'Que categoria de item queres ajustar?',
    components: rows,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleAdjustSelect(interaction) {
  const itemId = parseInt(interaction.values[0], 10);
  if (Number.isNaN(itemId)) {
    return safeReply(
      interaction,
      { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
  _setItemCtx(interaction.user.id, { itemId, movementType: 'ajuste_manual' });
  const modal = buildStockAdjustmentModal('inv::modal_ajuste_manual');
  await safeShowModal(interaction, modal);
}

async function handleAdjustModal(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending) return safeReply(interaction, { content: 'Sessão expirada.' }, { messageClass: 'BANAL' });

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr, 10);
  const MAX_ADJUSTMENT = 999999;

  if (Number.isNaN(quantity) || quantity === 0) {
    const embed = errorEmbed('Quantidade inválida', 'A quantidade tem de ser um número inteiro diferente de zero.');
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'ERROR' });
  }
  if (Math.abs(quantity) > MAX_ADJUSTMENT) {
    const embed = errorEmbed(
      'Quantidade excede o limite',
      `O ajuste máximo permitido é **${MAX_ADJUSTMENT.toLocaleString('pt-PT')}** unidades.`
    );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'ERROR' });
  }

  const currentStock = await inventoryRepo.getStockForItem(pending.itemId).catch(() => 0);
  if (currentStock + quantity < 0) {
    const embed = errorEmbed(
      'Stock insuficiente',
      `Saldo actual: **${currentStock}**. Não podes descontar **${Math.abs(quantity)}** unidades.`
    );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'ERROR' });
  }

  try {
    await adjustStock({ itemId: pending.itemId, quantity, notes, createdBy: interaction.user.id });
    pendingItemSelections.delete(interaction.user.id);
    const embed = successEmbed('Stock Ajustado', `Ajuste de **${quantity}** aplicado.\nRazão: ${notes}`);
    return replySafe(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  } catch (e) {
    return safeReply(interaction, { content: ERRORS.WITH_DETAIL(e.message) }, { messageClass: 'ERROR' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GESTÃO DE MATERIAIS (Chefia) — adicionar, editar preço, remover
// ═══════════════════════════════════════════════════════════════════════════

async function handleGerirMateriaisButton(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;

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
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );

  await safeReply(interaction, {
    content: `${EMOJI.EDITAR} Gestão de Materiais — escolhe uma ação:`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleGerirActionSelect(interaction) {
  const action = interaction.values[0];

  if (action === 'list') {
    await interaction.deferUpdate().catch(() => {});
    const items = await inventoryRepo.getItems(false); // include inactive
    if (!items.length) {
      return safeReply(
        interaction,
        { content: 'Catálogo vazio.', flags: MessageFlags.Ephemeral },
        { messageClass: 'BANAL' }
      );
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
        const price = item.estimated_value
          ? `**${Math.round(parseFloat(item.estimated_value)).toLocaleString('pt-PT')}€**`
          : '*sem preço*';
        lines.push(`  ${item.name} \u2014 ${price}${status}`);
      }
    }

    const embed = brandEmbed().setTitle('Catálogo de Materiais').setDescription(lines.join('\n'));
    return replySafe(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { messageClass: 'BANAL' });
  }

  if (action === 'add') {
    const modal = new ModalBuilder()
      .setCustomId('inv::modal_add_item')
      .setTitle('Adicionar Material')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Nome do material')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('category')
            .setLabel('Categoria')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(30)
            .setPlaceholder('madeiras / metais / quimicos / reciclagem / texteis / componentes / outros')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('price')
            .setLabel('Preço de venda (em \u20AC)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10)
            .setPlaceholder('Ex: 100')
        )
      );
    return safeShowModal(interaction, modal);
  }

  if (action === 'edit_price') {
    _setItemCtx(interaction.user.id, { action: 'edit_price' });
    const rows = await buildCategorySelectMenu('inv::cat_edit', 'Seleciona a categoria', {
      searchKey: `edit::${interaction.user.id}`,
      modalTitle: 'Pesquisar categoria',
    });
    return safeUpdate(interaction, { content: 'Que categoria de material queres editar?', components: rows });
  }

  if (action === 'deactivate') {
    _setItemCtx(interaction.user.id, { action: 'deactivate' });
    const rows = await buildCategorySelectMenu('inv::cat_deactivate', 'Seleciona a categoria', {
      searchKey: `deactivate::${interaction.user.id}`,
      modalTitle: 'Pesquisar categoria',
    });
    return safeUpdate(interaction, { content: 'Que categoria de material queres desativar?', components: rows });
  }

  if (action === 'reactivate') {
    const items = await inventoryRepo.getItems(false);
    const inactive = items.filter(i => !i.active);
    if (!inactive.length) {
      return safeUpdate(
        interaction,
        { content: 'Sem materiais desativados.', components: [] },
        { messageClass: 'BANAL' }
      );
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
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options)
    );

    return safeUpdate(interaction, { content: 'Que material queres reativar?', components: [row] });
  }
}

// Step 2b: Escolheu categoria → mostra items dessa categoria.
// Usado pelos fluxos staff (ajuste / edit / deactivate / encomenda) — o
// fluxo bairrista entrega/venda migrou para bairristaCart + itemSearch.
async function handleCategorySelect(interaction) {
  const category = interaction.values[0];
  if (category === 'none') return;

  const customId = interaction.customId;
  let itemPrefix;
  if (customId.includes('cat_ajuste')) itemPrefix = 'inv::select_ajuste';
  else if (customId.includes('cat_edit')) itemPrefix = 'inv::select_edit_item';
  else if (customId.includes('cat_deactivate')) itemPrefix = 'inv::select_deactivate_item';
  else if (customId.includes('cat_encomenda')) itemPrefix = 'inv::select_encomenda';
  else itemPrefix = 'inv::select_item';

  const rows = await buildItemSelectMenuForCategory(itemPrefix, 'Seleciona o item', category, {
    searchKey: `item::${interaction.user.id}::${itemPrefix}`,
    modalTitle: 'Pesquisar item',
  });
  await safeUpdate(interaction, {
    content: INVENTORY.PROMPTS.CATEGORY_ITEM(category),
    components: rows,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCOMENDAS (orders)
// ═══════════════════════════════════════════════════════════════════════════

async function handleEncomendasButton(interaction) {
  const rows = await buildCategorySelectMenu('inv::cat_encomenda', 'Seleciona a categoria', {
    searchKey: `encomenda::${interaction.user.id}`,
    modalTitle: 'Pesquisar categoria',
  });
  await safeReply(interaction, {
    content: 'Seleciona a categoria do material que queres encomendar:',
    components: rows,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleEncomendaSelect(interaction) {
  const itemId = parseInt(interaction.values[0]);
  if (!itemId || itemId === 'none') return;

  const item = await inventoryRepo.getItemById(itemId);
  if (!item)
    return safeReply(
      interaction,
      { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) return safeReply(interaction, { content: 'Não estás registado no sistema.' }, { messageClass: 'BANAL' });

  // Calculate preview pricing for 1 unit
  const { calculateOrderPricing } = require('../../orders/orderPricingEngine');
  const preview = await calculateOrderPricing({
    itemId,
    quantity: 1,
    memberRole: member.role,
    memberTier: member.tier,
    paymentMode: 'materials_money',
  });

  _setItemCtx(interaction.user.id, {
    itemId,
    itemName: item.name,
    action: 'order',
    role: member.role,
  });

  // Build preview embed
  const embed = applyLogo(
    new EmbedBuilder()
      .setTitle(`📦 Encomendar: ${item.name}`)
      .setColor(COLOR.PRIMARY)
      .setDescription(`Preço base: **${Math.round(preview.unitPrice).toLocaleString('pt-PT')}€**`)
  );

  if (preview.hasRecipe) {
    const ingLines = preview.ingredients.map(
      ing => `• ${ing.name}: ${ing.qty}x (~${Math.round(ing.subtotal).toLocaleString('pt-PT')}€)`
    );
    const materialCost = preview.ingredients.reduce((sum, ing) => sum + ing.subtotal, 0);
    embed.addFields({
      name: '🛠️ Fórmula de Craft',
      value: ingLines.join('\n'),
      inline: false,
    });
    embed.addFields({
      name: '💰 Custo dos Materiais',
      value: `${Math.round(materialCost).toLocaleString('pt-PT')}€`,
      inline: true,
    });
  }

  embed.addFields(
    {
      name: '💳 Preço Final (com rank)',
      value: `${Math.round(preview.finalPrice).toLocaleString('pt-PT')}€ (${member.role})`,
      inline: true,
    },
    {
      name: '💵 Pagamento',
      value: 'Dinheiro sujo + materiais',
      inline: true,
    },
    {
      name: 'ℹ️ Multiplicador',
      value: `${(preview.multiplier * 100).toFixed(0)}%`,
      inline: true,
    }
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`inv::encomenda_mode::materials_money::${itemId}`)
      .setLabel('📦 Encomendar')
      .setStyle(ButtonStyle.Primary)
  );

  await safeReply(
    interaction,
    {
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'FLOW' }
  );
}

async function handleEncomendaModeSelect(interaction) {
  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending || pending.action !== 'order') {
    return safeReply(interaction, { content: 'Sessão expirada.' }, { messageClass: 'BANAL' });
  }

  pending.paymentMode = 'materials_money';
  pendingItemSelections.set(interaction.user.id, pending);

  const modal = new ModalBuilder()
    .setCustomId('inv::modal_encomenda')
    .setTitle(`Encomendar ${pending.itemName}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel('Quantidade')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder('Ex: 5')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Notas (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(300)
      )
    );

  await safeShowModal(interaction, modal);
}

async function handleEncomendaModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending || pending.action !== 'order')
    return safeReply(interaction, { content: 'Sessão expirada.' }, { messageClass: 'BANAL' });

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr, 10);

  const { SANITY_MAX_QTY } = require('../../shared/constants');
  if (isNaN(quantity) || quantity <= 0 || quantity > SANITY_MAX_QTY)
    return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { messageClass: 'BANAL' });

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) return safeReply(interaction, { content: 'Não estás registado no sistema.' }, { messageClass: 'BANAL' });

  // Calculate pricing
  const { calculateOrderPricing } = require('../../orders/orderPricingEngine');
  const pricing = await calculateOrderPricing({
    itemId: pending.itemId,
    quantity,
    memberRole: member.role,
    memberTier: member.tier,
  });

  const ordersRepo = require('../../repositories/orders');
  const order = await ordersRepo.create({
    memberId: member.id,
    itemId: pending.itemId,
    quantity,
    unitPrice: pricing.unitPrice,
    totalPrice: pricing.finalPrice,
    notes,
    paymentMode: 'materials_money',
    materialCost: null,
    moneyCost: pricing.finalPrice,
    ingredientsJson: pricing.ingredients ? JSON.stringify(pricing.ingredients) : null,
  });

  pendingItemSelections.delete(interaction.user.id);

  const { logAudit } = require('../../audit/auditEngine');
  await logAudit({
    action: 'order_created',
    entityType: 'order',
    entityId: String(order.id),
    actorId: interaction.user.id,
    afterState: {
      item: pending.itemName,
      quantity,
      notes,
      paymentMode: 'materials_money',
      totalPrice: pricing.finalPrice,
    },
  });

  // Event bus
  const eventBus = require('../../core/eventBus');
  eventBus
    .emitAsync('order.created', {
      orderId: order.id,
      itemName: pending.itemName,
      quantity,
      memberDiscordId: interaction.user.id,
      actorId: interaction.user.id,
      status: 'pending',
      notes,
      paymentMode: 'materials_money',
      totalPrice: pricing.finalPrice,
      createdAt: order.created_at,
      at: new Date(),
    })
    .catch(() => {});

  let description = `**${quantity}x** ${pending.itemName}\n`;
  description += `Preço final: **${Math.round(pricing.finalPrice).toLocaleString('pt-PT')}€**\n`;
  description += '💵 Pagamento: Dinheiro sujo + materiais\n';
  if (pricing.hasRecipe) {
    description += '📦 Materiais obrigatórios incluídos\n';
  }
  description += 'Estado: Pendente\n';
  if (notes) description += `Notas: ${notes}\n`;
  description += '\nA chefia será notificada.';

  const embed = successEmbed('Encomenda Registada', description);

  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

module.exports = {
  handleStockCommand,
  handleAdjustStockButton,
  handleAdjustSelect,
  handleAdjustModal,
  handleGerirMateriaisButton,
  handleGerirActionSelect,
  handleCategorySelect,
  handleEncomendasButton,
  handleEncomendaSelect,
  handleEncomendaModeSelect,
  handleEncomendaModal,
  pendingItemSelections,
  _setItemCtx,
};
