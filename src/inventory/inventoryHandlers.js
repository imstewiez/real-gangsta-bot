'use strict';
const {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { safeReply, safeUpdate, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { successEmbed, stockEmbed, brandEmbed } = require('../shared/embedBuilders');
const { adjustStock, getCurrentStock } = require('./inventoryEngine');
const {
  buildCategorySelectMenu,
  buildItemSelectMenuForCategory,
  buildStockAdjustmentModal,
} = require('./inventoryMenus');
const { inventoryRepo, memberRepo } = require('../repositories');
const { isChefia, canOpenSession } = require('../permissions/permissionEngine');
const { requirePermission } = require('../shared/requirePermission');
const { EMOJI, ERRORS, MODALS, INVENTORY } = require('../content');

// Context efémero por user para fluxos multi-step de inventário.
// TTL de 15 minutos — limpa entradas abandonadas automaticamente.
const { createSessionStore } = require('../shared/sessionStore');
const pendingItemSelections = createSessionStore('inventory', { ttlMs: 15 * 60 * 1000 });

// Store da interaction-parent para cada user — permite fechar o ephemeral
// com dropdowns pendurados antes de abrir um modal (padrão RoboCop).
const parentStore = require('../shared/parentInteractionStore');

function _setItemCtx(userId, ctx) {
  pendingItemSelections.set(userId, ctx);
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTAR MATERIAL — fluxo unificado: Entrega ou Venda
// ═══════════════════════════════════════════════════════════════════════════

// Step 1: Bairrista clica "Registar Material" → escolhe Entrega ou Venda
async function handleRegistarMaterialButton(interaction) {
  // Early check: o user existe no sistema?
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Não estás registado na firma. Pede a tag primeiro.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'ERROR' }
    );
  }

  const options = [
    {
      label: 'Entrega (dar material)',
      description: 'Material entregue à casa sem pagamento',
      value: 'entrega',
      emoji: '📥',
    },
    {
      label: 'Venda (vender material)',
      description: 'Material vendido — valor calculado automaticamente',
      value: 'venda',
      emoji: '💰',
    },
  ];

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('inv::select_tipo_registo')
      .setPlaceholder(INVENTORY.SELECTS.TIPO_REGISTO)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );

  await safeReply(interaction, {
    content: INVENTORY.PROMPTS.ENTREGA_OU_VENDA,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
  // Regista a interaction-parent — permite que qualquer handler da cascade
  // feche este ephemeral antes de abrir um modal.
  parentStore.setParent(interaction.user.id, interaction);
}

// Step 2: Escolheu entrega ou venda → inicia carrinho (novo fluxo multi-item)
async function handleTipoRegistoSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const tipo = interaction.values[0]; // 'entrega' ou 'venda'

  const bairristaCart = require('./bairristaCart');
  const cart = bairristaCart.createCart(interaction.user.id, tipo);

  // "Repetir última" visível se existe submission recente do mesmo tipo.
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  let canRepeat = false;
  if (member) {
    const movementType =
      tipo === 'venda' ? 'venda_bairrista' : member.role === 'oficial' ? 'entrega_oficial' : 'entrega_bairrista';
    const last = await inventoryRepo.getLastSubmissionForMember(member.id, movementType).catch(() => null);
    canRepeat = Boolean(last?.lines?.length);
  }

  const embed = bairristaCart.buildCartEmbed(cart);
  const components = bairristaCart.buildCartComponents(cart, { canRepeat });
  await safeUpdate(interaction, { content: '', embeds: [embed], components });
}

// Step 2b: Escolheu categoria → mostra items dessa categoria.
// Usado pelos fluxos staff (ajuste / edit / deactivate / encomenda) — o
// fluxo bairrista entrega/venda migrou para bairristaCart + itemSearch.
async function handleCategorySelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const category = interaction.values[0];
  if (category === 'none') return;

  const customId = interaction.customId;
  let itemPrefix;
  if (customId.includes('cat_ajuste')) itemPrefix = 'inv::select_ajuste';
  else if (customId.includes('cat_edit')) itemPrefix = 'inv::select_edit_item';
  else if (customId.includes('cat_deactivate')) itemPrefix = 'inv::select_deactivate_item';
  else if (customId.includes('cat_encomenda')) itemPrefix = 'inv::select_encomenda';
  else itemPrefix = 'inv::select_item';

  const menu = await buildItemSelectMenuForCategory(itemPrefix, 'Seleciona o item', category);
  await safeUpdate(interaction, {
    content: INVENTORY.PROMPTS.CATEGORY_ITEM(category),
    components: [menu],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STOCK
// ═══════════════════════════════════════════════════════════════════════════

async function handleStockCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const stock = await getCurrentStock();
  const embed = stockEmbed(stock);
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

// ═══════════════════════════════════════════════════════════════════════════
// AJUSTE MANUAL DE STOCK (Chefia)
// ═══════════════════════════════════════════════════════════════════════════

async function handleAdjustStockButton(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const menu = await buildCategorySelectMenu('inv::cat_ajuste', 'Seleciona a categoria');
  await safeReply(interaction, {
    content: 'Que categoria de item queres ajustar?',
    components: [menu],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleAdjustSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = interaction.values[0];
  _setItemCtx(interaction.user.id, { itemId: parseInt(itemId), movementType: 'ajuste_manual' });
  const modal = buildStockAdjustmentModal('inv::modal_ajuste_manual');
  await safeShowModal(interaction, modal);
}

async function handleAdjustModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending) return safeReply(interaction, { content: 'Sessão expirada.' }, { messageClass: 'BANAL' });

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr);
  if (isNaN(quantity)) return safeReply(interaction, { content: 'Quantidade inválida.' }, { messageClass: 'BANAL' });

  try {
    await adjustStock({ itemId: pending.itemId, quantity, notes, createdBy: interaction.user.id });
    pendingItemSelections.delete(interaction.user.id);
    const embed = successEmbed('Stock Ajustado', `Ajuste de **${quantity}** aplicado.\nRazão: ${notes}`);
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
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
  if (isDuplicate(interaction.id)) return;
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
          ? `**${parseFloat(item.estimated_value).toLocaleString('pt-PT')}\u20AC**`
          : '*sem preço*';
        lines.push(`  ${item.name} \u2014 ${price}${status}`);
      }
    }

    const embed = brandEmbed().setTitle('Catálogo de Materiais').setDescription(lines.join('\n'));
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { messageClass: 'BANAL' });
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
    const menu = await buildCategorySelectMenu('inv::cat_edit', 'Seleciona a categoria');
    return safeUpdate(interaction, { content: 'Que categoria de material queres editar?', components: [menu] });
  }

  if (action === 'deactivate') {
    _setItemCtx(interaction.user.id, { action: 'deactivate' });
    const menu = await buildCategorySelectMenu('inv::cat_deactivate', 'Seleciona a categoria');
    return safeUpdate(interaction, { content: 'Que categoria de material queres desativar?', components: [menu] });
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

async function handleAddItemModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = getModalField(interaction, 'name').trim();
  const category = getModalField(interaction, 'category').toLowerCase().trim();
  const priceStr = getModalField(interaction, 'price');
  const price = parseFloat(priceStr.replace(',', '.'));

  if (!name) return safeReply(interaction, { content: 'Nome obrigatório.' }, { messageClass: 'BANAL' });
  if (isNaN(price) || price < 0)
    return safeReply(interaction, { content: 'Preço inválido.' }, { messageClass: 'BANAL' });

  const existing = await inventoryRepo.getItemByName(name);
  if (existing) return safeReply(interaction, { content: ERRORS.ALREADY_EXISTS(name) }, { messageClass: 'BANAL' });

  await inventoryRepo.createItem({ name, category, unit: 'unidade', estimatedValue: price });

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'item_created',
    entityType: 'item',
    entityId: name,
    actorId: interaction.user.id,
    afterState: { name, category, price },
  });

  const embed = successEmbed('Material Adicionado', `**${name}**\nCategoria: ${category}\nPreço: **${price}\u20AC**`);
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
}

async function handleEditItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item)
    return safeReply(
      interaction,
      { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );

  _setItemCtx(interaction.user.id, { action: 'edit_price', itemId, itemName: item.name });

  const modal = new ModalBuilder()
    .setCustomId('inv::modal_edit_price')
    .setTitle(`Editar ${item.name}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('price')
          .setLabel(`Novo preço (atual: ${item.estimated_value || 0}\u20AC)`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(10)
          .setPlaceholder(String(item.estimated_value || 0))
      )
    );

  await safeShowModal(interaction, modal);
}

async function handleEditPriceModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending || pending.action !== 'edit_price')
    return safeReply(interaction, { content: 'Sessão expirada.' }, { messageClass: 'BANAL' });

  const priceStr = getModalField(interaction, 'price');
  const price = parseFloat(priceStr.replace(',', '.'));
  if (isNaN(price) || price < 0)
    return safeReply(interaction, { content: 'Preço inválido.' }, { messageClass: 'BANAL' });

  const oldItem = await inventoryRepo.getItemById(pending.itemId);
  await inventoryRepo.updateItem(pending.itemId, { estimated_value: price });
  pendingItemSelections.delete(interaction.user.id);

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'item_price_updated',
    entityType: 'item',
    entityId: pending.itemName,
    actorId: interaction.user.id,
    beforeState: { price: oldItem?.estimated_value },
    afterState: { price },
  });

  const embed = successEmbed(
    'Preço Atualizado',
    `**${pending.itemName}**\nPreço anterior: ${oldItem?.estimated_value || 0}\u20AC\nNovo preço: **${price}\u20AC**`
  );
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
}

async function handleDeactivateItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});

  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item)
    return safeReply(
      interaction,
      { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );

  await inventoryRepo.updateItem(itemId, { active: false });

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'item_deactivated',
    entityType: 'item',
    entityId: item.name,
    actorId: interaction.user.id,
  });

  const embed = successEmbed(
    'Material Desativado',
    `**${item.name}** foi removido do catálogo.\nPodes reativá-lo a qualquer momento.`
  );
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { messageClass: 'RESULT' });
}

async function handleReactivateItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});

  const itemId = parseInt(interaction.values[0]);
  const item = await inventoryRepo.getItemById(itemId);
  if (!item)
    return safeReply(
      interaction,
      { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'RESULT' }
    );

  await inventoryRepo.updateItem(itemId, { active: true });

  const embed = successEmbed('Material Reativado', `**${item.name}** está novamente disponível no catálogo.`);
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { messageClass: 'RESULT' });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCOMENDAS (orders)
// ═══════════════════════════════════════════════════════════════════════════

async function handleEncomendasButton(interaction) {
  const menu = await buildCategorySelectMenu('inv::cat_encomenda', 'Seleciona a categoria');
  await safeReply(interaction, {
    content: 'Seleciona a categoria do material que queres encomendar:',
    components: [menu],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleEncomendaSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  if (!itemId || itemId === 'none') return;

  const item = await inventoryRepo.getItemById(itemId);
  if (!item)
    return safeReply(
      interaction,
      { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );

  _setItemCtx(interaction.user.id, { itemId, itemName: item.name, action: 'order' });

  const modal = new ModalBuilder()
    .setCustomId('inv::modal_encomenda')
    .setTitle(`Encomendar ${item.name}`)
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
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingItemSelections.get(interaction.user.id);
  if (!pending || pending.action !== 'order')
    return safeReply(interaction, { content: 'Sessão expirada.' }, { messageClass: 'BANAL' });

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr);

  if (isNaN(quantity) || quantity <= 0)
    return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { messageClass: 'BANAL' });

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) return safeReply(interaction, { content: 'Não estás registado no sistema.' }, { messageClass: 'BANAL' });

  const { query } = require('../db');
  const insertRes = await query(
    'INSERT INTO orders (member_id, item_id, quantity, notes) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
    [member.id, pending.itemId, quantity, notes]
  );
  const order = insertRes.rows[0];

  pendingItemSelections.delete(interaction.user.id);

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'order_created',
    entityType: 'order',
    entityId: String(order.id),
    actorId: interaction.user.id,
    afterState: { item: pending.itemName, quantity, notes },
  });

  // Event bus — notification routing publica em INVENTORY_EVENTS.
  const eventBus = require('../core/eventBus');
  eventBus
    .emitAsync('order.created', {
      orderId: order.id,
      itemName: pending.itemName,
      quantity,
      memberDiscordId: interaction.user.id,
      actorId: interaction.user.id,
      status: 'pending',
      notes,
      createdAt: order.created_at,
      at: new Date(),
    })
    .catch(() => {});

  const embed = successEmbed(
    'Encomenda Registada',
    `**${quantity}x** ${pending.itemName}\nEstado: Pendente\n${notes ? `Notas: ${notes}` : ''}\n\nA chefia será notificada.`
  );

  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

// ═══════════════════════════════════════════════════════════════════════════
// BAIRRISTA CART — multi-item flow (migration 038 + bairristaCart.js)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Re-render do painel do carrinho após mutação. Usa editReply se a
 * interaction já foi deferida; senão safeUpdate (component interaction).
 */
async function _refreshCartPanel(interaction, cart, { extraNote } = {}) {
  const bairristaCart = require('./bairristaCart');
  const member = await memberRepo.findByDiscordId(interaction.user.id).catch(() => null);
  let canRepeat = false;
  if (member) {
    const movementType =
      cart.tipo === 'venda' ? 'venda_bairrista' : member.role === 'oficial' ? 'entrega_oficial' : 'entrega_bairrista';
    const last = await inventoryRepo.getLastSubmissionForMember(member.id, movementType).catch(() => null);
    canRepeat = Boolean(last?.lines?.length);
  }
  const embed = bairristaCart.buildCartEmbed(cart, { extraNote });
  const components = bairristaCart.buildCartComponents(cart, { canRepeat });
  const payload = { content: '', embeds: [embed], components };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
  } else {
    await safeUpdate(interaction, payload);
  }
}

// ── Add item → mostra categoria select ──────────────────────────────────────
async function handleCartAdd(interaction) {
  if (isDuplicate(interaction.id)) return;
  const tipo = interaction.customId.split('::')[2];
  const cart = require('./bairristaCart').getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.PENDENTE} Carrinho expirado. Volta a clicar em "Registar Material".`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }
  const menu = await buildCategorySelectMenu(`invcart::cat::${tipo}`, 'Escolhe a categoria');
  return safeUpdate(interaction, {
    content: `Escolhe a categoria do item a adicionar:`,
    embeds: [],
    components: [menu],
  });
}

// ── Categoria escolhida → mostra itens ──────────────────────────────────────
async function handleCartCategory(interaction) {
  if (isDuplicate(interaction.id)) return;
  const tipo = interaction.customId.split('::')[2];
  const category = interaction.values[0];
  if (category === 'none') return;
  const menu = await buildItemSelectMenuForCategory(`invcart::pick::${tipo}::${category}`, 'Escolhe o item', category);
  return safeUpdate(interaction, {
    content: `Item da categoria **${category}**:`,
    embeds: [],
    components: [menu],
  });
}

// ── Item escolhido → abre modal qty (+ preço custom em vendas) ─────────────
// Extraído como função para ser reutilizado pelo cart normal (cascade) E
// pelo itemSearch (modal de pesquisa → select filtrado → aqui).
async function _openCartQtyModal(interaction, tipo, item, { category = 'search' } = {}) {
  const isVenda = tipo === 'venda';
  const basePrice = parseFloat(item.estimated_value) || 0;

  const modalRows = [
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('quantity')
        .setLabel('Quantidade')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: 10')
        .setRequired(true)
        .setMaxLength(10)
    ),
  ];
  if (isVenda) {
    modalRows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('unit_price')
          .setLabel(`Preço por unidade (base: ${basePrice}€)`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`${basePrice} — deixa em branco para usar base`)
          .setRequired(false)
          .setMaxLength(10)
      )
    );
  }

  const modal = new ModalBuilder()
    .setCustomId(`invcart::qty_modal::${tipo}::${item.id}::${category}`)
    .setTitle(`${isVenda ? 'Vender' : 'Entregar'} ${item.name}`.slice(0, 45))
    .addComponents(...modalRows);

  parentStore.deleteParentEphemeral(interaction.user.id).catch(() => {});
  await safeShowModal(interaction, modal);
}

async function handleCartItemPick(interaction) {
  if (isDuplicate(interaction.id)) return;
  const parts = interaction.customId.split('::');
  const tipo = parts[2];
  const category = parts[3];
  const itemId = parseInt(interaction.values[0]);
  if (!itemId || itemId === 'none') return;

  const item = await inventoryRepo.getItemById(itemId);
  if (!item) {
    return safeReply(
      interaction,
      { content: ERRORS.ITEM_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
  return _openCartQtyModal(interaction, tipo, item, { category });
}

// Registo de handlers para o itemSearch dispatcher — um purpose por fluxo.
// Registado aqui (module load time) para evitar circular deps.
(() => {
  const itemSearch = require('./itemSearch');
  itemSearch.registerPickHandler('cart_entrega', async ({ interaction, item }) => {
    return _openCartQtyModal(interaction, 'entrega', item);
  });
  itemSearch.registerPickHandler('cart_venda', async ({ interaction, item }) => {
    return _openCartQtyModal(interaction, 'venda', item);
  });
})();

// ── Qty modal submetido → adiciona linha + re-render painel ─────────────────
async function handleCartQtyModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  // Novo ephemeral é o novo "pai" — futuros modais na cascade vão fechá-lo.
  parentStore.setParent(interaction.user.id, interaction);

  const parts = interaction.customId.split('::');
  const tipo = parts[2];
  const itemId = parseInt(parts[3]);

  const bairristaCart = require('./bairristaCart');
  const cart = bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Carrinho expirado. Recomeça.` },
      { messageClass: 'BANAL' }
    );
  }

  const qty = parseInt(getModalField(interaction, 'quantity'));
  if (isNaN(qty) || qty <= 0) {
    return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { messageClass: 'BANAL' });
  }

  const item = await inventoryRepo.getItemById(itemId);
  if (!item) {
    return safeReply(interaction, { content: ERRORS.ITEM_NOT_FOUND() }, { messageClass: 'ERROR' });
  }
  const basePrice = parseFloat(item.estimated_value) || 0;

  let unitPrice = null;
  if (tipo === 'venda') {
    const raw = getModalField(interaction, 'unit_price');
    if (raw && raw.trim()) {
      const parsed = parseFloat(raw.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0) {
        return safeReply(interaction, { content: `${EMOJI.ERRO} Preço inválido.` }, { messageClass: 'BANAL' });
      }
      // Só guarda custom se diferente do base.
      if (parsed !== basePrice) unitPrice = parsed;
    }
  }

  bairristaCart.addLine(cart, {
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    quantity: qty,
    unitPrice,
    basePrice,
  });
  bairristaCart.saveCart(interaction.user.id, cart);

  return _refreshCartPanel(interaction, cart);
}

// ── Remover uma linha via select menu ───────────────────────────────────────
async function handleCartLineAction(interaction) {
  if (isDuplicate(interaction.id)) return;
  const tipo = interaction.customId.split('::')[2];
  const value = interaction.values[0]; // "remove:<idx>"
  const [action, idxStr] = value.split(':');

  const bairristaCart = require('./bairristaCart');
  const cart = bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Carrinho expirado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  if (action === 'remove') {
    const idx = parseInt(idxStr);
    bairristaCart.removeLine(cart, idx);
    bairristaCart.saveCart(interaction.user.id, cart);
  }
  return _refreshCartPanel(interaction, cart);
}

// ── Notas globais ───────────────────────────────────────────────────────────
async function handleCartNotesButton(interaction) {
  if (isDuplicate(interaction.id)) return;
  const tipo = interaction.customId.split('::')[2];
  const cart = require('./bairristaCart').getCart(interaction.user.id);
  if (!cart) {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Carrinho expirado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  const modal = new ModalBuilder()
    .setCustomId(`invcart::notes_modal::${tipo}`)
    .setTitle('Notas da submissão')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Notas (visível no log)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
          .setValue(cart.globalNotes || '')
      )
    );
  // Fecha o painel do carrinho antes do modal abrir (ver handleCartItemPick).
  parentStore.deleteParentEphemeral(interaction.user.id).catch(() => {});
  await safeShowModal(interaction, modal);
}

async function handleCartNotesModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  parentStore.setParent(interaction.user.id, interaction);
  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('./bairristaCart');
  const cart = bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeReply(interaction, { content: `${EMOJI.PENDENTE} Carrinho expirado.` }, { messageClass: 'BANAL' });
  }
  const notes = getModalField(interaction, 'notes') || '';
  bairristaCart.setNotes(cart, notes);
  bairristaCart.saveCart(interaction.user.id, cart);
  return _refreshCartPanel(interaction, cart);
}

// ── Cancelar carrinho ───────────────────────────────────────────────────────
async function handleCartCancel(interaction) {
  if (isDuplicate(interaction.id)) return;
  require('./bairristaCart').clearCart(interaction.user.id);
  parentStore.clearParent(interaction.user.id);
  return safeUpdate(
    interaction,
    {
      content: `${EMOJI.OK} Carrinho cancelado. Sem alterações no stock.`,
      embeds: [],
      components: [],
    },
    { messageClass: 'BANAL' }
  );
}

// ── Repetir última entrega/venda ────────────────────────────────────────────
async function handleCartRepeat(interaction) {
  if (isDuplicate(interaction.id)) return;
  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('./bairristaCart');
  const cart = bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Carrinho expirado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Não estás registado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
  const movementType =
    tipo === 'venda' ? 'venda_bairrista' : member.role === 'oficial' ? 'entrega_oficial' : 'entrega_bairrista';
  const last = await inventoryRepo.getLastSubmissionForMember(member.id, movementType);
  if (!last?.lines?.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Não tens submissão anterior deste tipo.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  // Re-resolve preços: usa base actual do catálogo (evita time-travel).
  for (const line of last.lines) {
    const item = await inventoryRepo.getItemById(line.item_id).catch(() => null);
    if (!item) continue;
    bairristaCart.addLine(cart, {
      itemId: line.item_id,
      itemName: line.item_name,
      category: line.category,
      quantity: line.quantity,
      unitPrice: null, // não re-usa preço custom antigo
      basePrice: parseFloat(item.estimated_value) || 0,
    });
  }
  bairristaCart.saveCart(interaction.user.id, cart);
  return _refreshCartPanel(interaction, cart, {
    extraNote: `🔁 _Pré-preenchido com ${last.lines.length} linha(s) da última submissão. Preços actualizados._`,
  });
}

// ── Preview (Rever) ─────────────────────────────────────────────────────────
async function handleCartPreview(interaction) {
  if (isDuplicate(interaction.id)) return;
  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('./bairristaCart');
  const cart = bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Carrinho expirado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  if (!cart.lines.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Nada para rever — carrinho vazio.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  // Contexto de ranking/promoção — current state, delta não previsão.
  const { bairristaStatsRepo } = require('../repositories');
  const { weekBounds } = require('../util');
  const { start } = weekBounds();
  const weekStartStr = start.toISOString().split('T')[0];
  const [weeklyBefore, rankCurrent, promotion] = await Promise.all([
    bairristaStatsRepo.getWeeklyMaterialStats(interaction.user.id).catch(() => null),
    bairristaStatsRepo.getRankingPosition(interaction.user.id, weekStartStr).catch(() => null),
    (async () => {
      const { getPromotionProgress } = require('../members/autoPromotionEngine');
      return await getPromotionProgress(interaction.user.id).catch(() => null);
    })(),
  ]);

  const previewEmbed = bairristaCart.buildCartPreview(cart, {
    weeklyBefore,
    rankCurrent,
    promotion: promotion && !promotion.maxedOut ? promotion : null,
  });
  return safeUpdate(interaction, {
    content: '',
    embeds: [previewEmbed],
    components: bairristaCart.buildPreviewComponents(tipo),
  });
}

async function handleCartPreviewBack(interaction) {
  if (isDuplicate(interaction.id)) return;
  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('./bairristaCart');
  const cart = bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Carrinho expirado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  return _refreshCartPanel(interaction, cart);
}

// ── Submeter carrinho ───────────────────────────────────────────────────────
async function handleCartSubmit(interaction) {
  if (isDuplicate(interaction.id)) return;

  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('./bairristaCart');
  const cart = bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeUpdate(
      interaction,
      { content: `${EMOJI.PENDENTE} Carrinho expirado.`, embeds: [], components: [] },
      { messageClass: 'FLOW' }
    );
  }
  if (!cart.lines.length) {
    return safeUpdate(
      interaction,
      { content: `${EMOJI.WARN} Carrinho vazio.`, embeds: [], components: [] },
      { messageClass: 'FLOW' }
    );
  }

  // ── V12: TODAS as submissões (entrega + venda) criam Delivery Request ─────
  // Só a chefia (Patrão/OG/Kingpin/Manda-Chuva) pode aprovar.
  await interaction.deferUpdate().catch(() => {});

  const linesSnapshot = cart.lines.map(l => ({
    itemId: l.itemId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));
  const globalNotesSnapshot = cart.globalNotes;
  bairristaCart.clearCart(interaction.user.id);
  parentStore.clearParent(interaction.user.id);

  const { createDeliveryRequest } = require('./inventoryEngine');
  let requestResult;
  try {
    requestResult = await createDeliveryRequest({
      discordId: interaction.user.id,
      approverDiscordId: null,
      lines: linesSnapshot,
      globalNotes: globalNotesSnapshot,
      createdBy: interaction.user.id,
      tipo,
    });
  } catch (e) {
    return interaction.editReply({ content: `${EMOJI.ERRO} ${e.message}`, embeds: [], components: [] }).catch(() => {});
  }

  // Notificar canal de staff
  try {
    const CONFIG = require('../config');
    const staffChannelId = CONFIG.TAG_REQUEST_CHANNEL_ID;
    if (staffChannelId) {
      const staffChannel = await interaction.client.channels.fetch(staffChannelId).catch(() => null);
      if (staffChannel) {
        const requestEmbed = bairristaCart.buildDeliveryRequestEmbed({
          requestId: requestResult.request.id,
          memberName: requestResult.member.display_name,
          memberDiscordId: requestResult.member.discord_id,
          lines: requestResult.lines,
          totalQty: requestResult.totalQty,
          totalValue: requestResult.totalValue,
          notes: globalNotesSnapshot,
          tipo,
        });
        const decisionComponents = bairristaCart.buildDeliveryDecisionComponents(requestResult.request.id);
        const tipoLabel = tipo === 'venda' ? 'venda' : 'entrega';
        await staffChannel.send({
          content: `Nova **${tipoLabel}** pendente de aprovação.`,
          embeds: [requestEmbed],
          components: decisionComponents,
        });
      }
    }
  } catch (e) {
    // Best-effort
  }

  const isVenda = tipo === 'venda';
  const title = isVenda ? `${EMOJI.LUCRO} Venda submetida` : `${EMOJI.MATERIAL} Entrega submetida`;
  const desc = [
    `**${requestResult.lines.length}** linha(s) · **${requestResult.totalQty.toLocaleString('pt-PT')}** unidades`,
    requestResult.totalValue > 0 ? `Valor: **${requestResult.totalValue.toLocaleString('pt-PT')}€**` : '',
    '',
    `${EMOJI.PENDENTE} **Aguarda aprovação da chefia.**`,
    'Só quando a chefia aprovar é que o stock será actualizado.',
  ]
    .filter(Boolean)
    .join('\n');

  const embed = brandEmbed('MOVEMENT').setColor(COLOR.WARNING_SOFT).setTitle(title).setDescription(desc);

  return interaction.editReply({ content: '', embeds: [embed], components: [] });
}

// ── Undo submission ─────────────────────────────────────────────────────────
async function handleCartUndo(interaction) {
  if (isDuplicate(interaction.id)) return;
  // deferUpdate pela mesma razão que handleCartSubmit: evita double-click
  // race + substitui o feedback (com botão undo) pela confirmação de undo
  // na mesma mensagem.
  await interaction.deferUpdate().catch(() => {});

  const submissionId = interaction.customId.split('::')[2];
  const { undoSubmission } = require('./inventoryEngine');
  const r = await undoSubmission({
    submissionId,
    requesterDiscordId: interaction.user.id,
    client: interaction.client,
  });
  if (!r.undone) {
    return interaction.editReply({ content: `${EMOJI.WARN} ${r.reason}`, embeds: [], components: [] }).catch(() => {});
  }
  return interaction
    .editReply({
      content: `${EMOJI.OK} Submissão desfeita — ${r.deletedCount} linha(s) removida(s). O stock foi restaurado.`,
      embeds: [],
      components: [],
    })
    .catch(() => {});
}

async function handleDeliveryApproverSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});

  const approverId = interaction.values[0];
  const bairristaCart = require('./bairristaCart');
  const cart = bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== 'entrega') {
    return interaction
      .editReply({ content: `${EMOJI.PENDENTE} Carrinho expirado.`, embeds: [], components: [] })
      .catch(() => {});
  }

  let approverMember = null;
  try {
    approverMember = await interaction.guild.members.fetch(approverId);
  } catch {
    approverMember = null;
  }
  if (!approverMember || !canOpenSession(approverMember)) {
    return interaction
      .editReply({
        content: `${EMOJI.ERRO} Tens de escolher um OG ou alguém acima na hierarquia.`,
        embeds: [],
        components: bairristaCart.buildDeliveryApproverComponents(),
      })
      .catch(() => {});
  }

  const linesSnapshot = cart.lines.map(l => ({
    itemId: l.itemId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));
  const globalNotesSnapshot = cart.globalNotes;

  const { createDeliveryRequest } = require('./inventoryEngine');
  let result;
  try {
    result = await createDeliveryRequest({
      discordId: interaction.user.id,
      approverDiscordId: approverId,
      lines: linesSnapshot,
      globalNotes: globalNotesSnapshot,
      createdBy: interaction.user.id,
    });
  } catch (e) {
    return interaction.editReply({ content: `${EMOJI.ERRO} ${e.message}`, embeds: [], components: [] }).catch(() => {});
  }

  bairristaCart.clearCart(interaction.user.id);
  parentStore.clearParent(interaction.user.id);

  try {
    const requestEmbed = bairristaCart.buildDeliveryRequestEmbed({
      requestId: result.request.id,
      memberName: result.member.display_name,
      memberDiscordId: result.member.discord_id,
      lines: result.lines,
      totalQty: result.totalQty,
      totalValue: result.totalValue,
      notes: globalNotesSnapshot,
    });
    const decisionComponents = bairristaCart.buildDeliveryDecisionComponents(result.request.id);

    let delivered = 'DM';
    try {
      await approverMember.send({ embeds: [requestEmbed], components: decisionComponents });
    } catch {
      delivered = 'canal';
      await interaction.channel
        ?.send({
          content: `<@${approverId}> tens uma entrega para confirmar.`,
          embeds: [requestEmbed],
          components: decisionComponents,
        })
        .catch(() => {
          delivered = 'pendente';
        });
    }

    const msg =
      delivered === 'pendente'
        ? 'Pedido criado, mas não consegui notificar o OG+. Pede-lhe para abrir a mensagem de confirmação se tiver sido entregue noutro canal.'
        : `Pedido enviado para <@${approverId}> (${delivered}). O stock só muda quando a entrega for aceite.`;

    return interaction.editReply({ content: `${EMOJI.OK} ${msg}`, embeds: [], components: [] }).catch(() => {});
  } catch (e) {
    return interaction
      .editReply({
        content: `${EMOJI.ERRO} Pedido criado, mas falhou a notifica\u00e7\u00e3o do OG+: ${e.message}`,
        embeds: [],
        components: [],
      })
      .catch(() => {});
  }
}

async function handleDeliveryDecision(interaction) {
  if (isDuplicate(interaction.id)) return;

  // V12: só Patrão/OG/Kingpin/Manda-Chuva podem aprovar
  const { isPatraoDiZona } = require('../permissions/permissionEngine');
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Só Patrão di Zona, OG, Kingpin ou Manda-Chuva podem aprovar entregas/vendas.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  await interaction.deferUpdate().catch(() => {});

  const [, action, requestId] = interaction.customId.split('::');
  const approve = action === 'approve';
  const { decideDeliveryRequest } = require('./inventoryEngine');
  const result = await decideDeliveryRequest({
    requestId,
    decisionBy: interaction.user.id,
    approve,
  });

  if (!result.ok) {
    return interaction
      .editReply({ content: `${EMOJI.WARN} ${result.reason}`, embeds: [], components: [] })
      .catch(() => {});
  }

  // Notificar o bairrista do resultado
  try {
    const bairristaUser = await interaction.client.users.fetch(result.member.discord_id).catch(() => null);
    if (bairristaUser) {
      const tipoLabel = result.request?.tipo === 'venda' ? 'venda' : 'entrega';
      if (approve) {
        const embed = successEmbed(
          '✅ Aprovado',
          `A tua **${tipoLabel}** foi aprovada por <@${interaction.user.id}>.\n` +
            `**${result.totalQty.toLocaleString('pt-PT')}** unidade(s) confirmadas no stock.`
        );
        await bairristaUser.send({ embeds: [embed] }).catch(() => {});
      } else {
        const embed = brandEmbed('SHORT')
          .setColor(COLOR.DANGER)
          .setTitle('❌ Rejeitado')
          .setDescription(
            `A tua **${tipoLabel}** foi rejeitada por <@${interaction.user.id}>.\n` + 'Nada foi alterado no stock.'
          );
        await bairristaUser.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (_) {
    // Best-effort DM
  }

  if (!approve) {
    return interaction
      .editReply({
        content: `${EMOJI.OK} ${result.request?.tipo === 'venda' ? 'Venda' : 'Entrega'} recusada. Nada foi alterado no stock.`,
        embeds: [],
        components: [],
      })
      .catch(() => {});
  }

  const { checkAndPromote } = require('../members/autoPromotionEngine');
  await checkAndPromote(result.member.discord_id, interaction.guild, interaction.client).catch(() => null);

  return interaction
    .editReply({
      content:
        `${EMOJI.OK} ${result.request?.tipo === 'venda' ? 'Venda' : 'Entrega'} aceite. ` +
        `${result.totalQty.toLocaleString('pt-PT')} unidade(s) foram confirmadas no stock para <@${result.member.discord_id}>.`,
      embeds: [],
      components: [],
    })
    .catch(() => {});
}

module.exports = {
  handleRegistarMaterialButton,
  handleTipoRegistoSelect,
  handleCategorySelect,
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
  // Cart handlers
  handleCartAdd,
  handleCartCategory,
  handleCartItemPick,
  handleCartQtyModal,
  handleCartLineAction,
  handleCartNotesButton,
  handleCartNotesModal,
  handleCartCancel,
  handleCartRepeat,
  handleCartSubmit,
  handleCartUndo,
  handleDeliveryApproverSelect,
  handleDeliveryDecision,
  handleCartPreview,
  handleCartPreviewBack,
};
