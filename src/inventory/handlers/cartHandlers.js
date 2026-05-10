'use strict';
const {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { safeReply, safeUpdate, safeShowModal, getModalField } = require('../../shared/interactionHelpers');
const { replySafe } = require('../../shared/safeEmbed');
const { brandEmbed, COLOR } = require('../../shared/embedBuilders');
const { inventoryRepo, memberRepo } = require('../../repositories');
const { EMOJI, ERRORS } = require('../../content');
const parentStore = require('../../shared/parentInteractionStore');
const { buildRawMaterialSelectMenu, buildItemSelectMenuForCategory } = require('../inventoryMenus');

// ═══════════════════════════════════════════════════════════════════════════
// REGISTAR MATERIAL — fluxo unificado: Entrega ou Venda
// ═══════════════════════════════════════════════════════════════════════════

// Step 1: Bairrista clica "Entregar Material" → inicia carrinho de entrega
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

  // Vai directo para entrega (o botão "Vender" no painel cobre vendas)
  const tipo = 'entrega';
  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.createCart(interaction.user.id, tipo);

  const movementType = member.role === 'oficial' ? 'entrega_oficial' : 'entrega_bairrista';
  const last = await inventoryRepo.getLastSubmissionForMember(member.id, movementType).catch(() => null);
  const canRepeat = Boolean(last?.lines?.length);

  const embed = bairristaCart.buildCartEmbed(cart);
  const components = bairristaCart.buildCartComponents(cart, { canRepeat });

  await replySafe(interaction, { content: '', embeds: [embed], components, flags: MessageFlags.Ephemeral });
  parentStore.setParent(interaction.user.id, interaction);
}

// Step 2: Escolheu entrega ou venda → inicia carrinho (novo fluxo multi-item)
async function handleTipoRegistoSelect(interaction) {
  const tipo = interaction.values[0]; // 'entrega' ou 'venda'

  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.createCart(interaction.user.id, tipo);

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

// ═══════════════════════════════════════════════════════════════════════════
// BAIRRISTA CART — multi-item flow (migration 038 + bairristaCart.js)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Re-render do painel do carrinho após mutação. Usa editReply se a
 * interaction já foi deferida; senão safeUpdate (component interaction).
 */
async function _refreshCartPanel(interaction, cart, { extraNote } = {}) {
  const bairristaCart = require('../bairristaCart');
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
  const tipo = interaction.customId.split('::')[2];
  const cart = await require('../bairristaCart').getCart(interaction.user.id);
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
  const selectRow = await buildRawMaterialSelectMenu(`invcart::pick::${tipo}`, 'Escolhe o material', {
    searchKey: `cartpick::${interaction.user.id}::${tipo}`,
    modalTitle: 'Pesquisar material',
  });
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`invcart::back::${tipo}`)
      .setLabel('Voltar ao carrinho')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⬅️')
  );
  return safeUpdate(interaction, {
    content: '**Matérias Primas** — escolhe o item a adicionar:',
    embeds: [],
    components: [selectRow, backRow],
  });
}

// ── Categoria escolhida → mostra itens ──────────────────────────────────────
async function handleCartCategory(interaction) {
  const tipo = interaction.customId.split('::')[2];
  const category = interaction.values[0];
  if (category === 'none') return;
  const rows = await buildItemSelectMenuForCategory(`invcart::pick::${tipo}::${category}`, 'Escolhe o item', category, {
    searchKey: `cartpick::${interaction.user.id}::${tipo}::${category}`,
    modalTitle: 'Pesquisar item',
  });
  return safeUpdate(interaction, {
    content: `Item da categoria **${category}**:`,
    embeds: [],
    components: rows,
  });
}

// ── Item escolhido → abre modal qty (+ preço custom em vendas) ─────────────
// Extraído como função para ser reutilizado pelo cart normal (cascade) E
// pelo itemSearch (modal de pesquisa → select filtrado → aqui).
async function _openCartQtyModal(interaction, tipo, item, { category = 'search' } = {}) {
  const isVenda = tipo === 'venda';
  const rawBasePrice = parseFloat(item.estimated_value) || 0;

  // Apply sell multiplier if selling
  let basePrice = rawBasePrice;
  if (isVenda) {
    const member = await memberRepo.findByDiscordId(interaction.user.id);
    if (member) {
      const { getRankMultiplier } = require('../../orders/orderPricingEngine');
      basePrice = Math.round(rawBasePrice * (1 + getRankMultiplier(member.role, 'sell', member.tier)));
    }
  }

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
          .setLabel(`Preço por unidade (sugerido: ${basePrice}€)`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`${basePrice} — deixa em branco para usar sugerido`)
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
  const itemSearch = require('../itemSearch');
  itemSearch.registerPickHandler('cart_entrega', async ({ interaction, item }) => {
    return _openCartQtyModal(interaction, 'entrega', item);
  });
  itemSearch.registerPickHandler('cart_venda', async ({ interaction, item }) => {
    return _openCartQtyModal(interaction, 'venda', item);
  });
})();

// ── Qty modal submetido → adiciona linha + re-render painel ─────────────────
async function handleCartQtyModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  // Novo ephemeral é o novo "pai" — futuros modais na cascade vão fechá-lo.
  parentStore.setParent(interaction.user.id, interaction);

  const parts = interaction.customId.split('::');
  const tipo = parts[2];
  const itemId = parseInt(parts[3]);

  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.getCart(interaction.user.id);
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

  // ── Validação: materiais primas podem ser entregues/vendidos ───────────────
  const BLOCKED_CATEGORIES = new Set([
    'armas',
    'armas_fogo',
    'armas_brancas',
    'municoes',
    'dinheiro',
    'droga',
    'comida',
    'pesca',
    'comida_pesca',
  ]);
  if (BLOCKED_CATEGORIES.has(item.category)) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} **${item.name}** não pode ser entregue/vendido. Consulta o regulamento.` },
      { messageClass: 'BANAL' }
    );
  }

  const rawBasePrice = parseFloat(item.estimated_value) || 0;

  // Apply sell multiplier if selling
  let basePrice = rawBasePrice;
  if (tipo === 'venda') {
    const member = await memberRepo.findByDiscordId(interaction.user.id);
    if (member) {
      const { getRankMultiplier } = require('../../orders/orderPricingEngine');
      basePrice = Math.round(rawBasePrice * (1 + getRankMultiplier(member.role, 'sell', member.tier)));
    }
  }

  let unitPrice = null;
  if (tipo === 'venda') {
    const raw = getModalField(interaction, 'unit_price');
    if (raw && raw.trim()) {
      const parsed = parseFloat(raw.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0) {
        return safeReply(interaction, { content: `${EMOJI.ERRO} Preço inválido.` }, { messageClass: 'BANAL' });
      }
      // Só guarda custom se diferente do base (com multiplier).
      if (parsed !== basePrice) unitPrice = parsed;
    }
  }

  await bairristaCart.addLine(
    cart,
    {
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      quantity: qty,
      unitPrice,
      basePrice,
    },
    interaction.user.id
  );

  return _refreshCartPanel(interaction, cart);
}

// ── Remover uma linha via select menu ───────────────────────────────────────
async function handleCartLineAction(interaction) {
  const tipo = interaction.customId.split('::')[2];
  const value = interaction.values[0]; // "remove:<idx>"
  const [action, idxStr] = value.split(':');

  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Carrinho expirado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  if (action === 'remove') {
    const idx = parseInt(idxStr, 10);
    if (Number.isNaN(idx)) {
      return safeReply(
        interaction,
        { content: 'Índice inválido.', flags: MessageFlags.Ephemeral },
        { messageClass: 'BANAL' }
      );
    }
    await bairristaCart.removeLine(cart, idx, interaction.user.id);
  }
  return _refreshCartPanel(interaction, cart);
}

// ── Notas globais ───────────────────────────────────────────────────────────
async function handleCartNotesButton(interaction) {
  const tipo = interaction.customId.split('::')[2];
  const cart = await require('../bairristaCart').getCart(interaction.user.id);
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  parentStore.setParent(interaction.user.id, interaction);
  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeReply(interaction, { content: `${EMOJI.PENDENTE} Carrinho expirado.` }, { messageClass: 'BANAL' });
  }
  const notes = getModalField(interaction, 'notes') || '';
  await bairristaCart.setNotes(cart, notes, interaction.user.id);
  return _refreshCartPanel(interaction, cart);
}

// ── Cancelar carrinho ───────────────────────────────────────────────────────
async function handleCartCancel(interaction) {
  await require('../bairristaCart').clearCart(interaction.user.id);
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
  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.getCart(interaction.user.id);
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
    await bairristaCart.addLine(
      cart,
      {
        itemId: line.item_id,
        itemName: line.item_name,
        category: line.category,
        quantity: line.quantity,
        unitPrice: null, // não re-usa preço custom antigo
        basePrice: parseFloat(item.estimated_value) || 0,
      },
      interaction.user.id
    );
  }
  return _refreshCartPanel(interaction, cart, {
    extraNote: `🔁 _Pré-preenchido com ${last.lines.length} linha(s) da última submissão. Preços actualizados._`,
  });
}

// ── Preview (Rever) ─────────────────────────────────────────────────────────
async function handleCartPreview(interaction) {
  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.getCart(interaction.user.id);
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
  const { bairristaStatsRepo } = require('../../repositories');
  const { weekBounds } = require('../../util');
  const { start } = weekBounds();
  const weekStartStr = start.toISOString().split('T')[0];
  const [weeklyBefore, rankCurrent, promotion] = await Promise.all([
    bairristaStatsRepo.getWeeklyMaterialStats(interaction.user.id).catch(() => null),
    bairristaStatsRepo.getRankingPosition(interaction.user.id, weekStartStr).catch(() => null),
    (async () => {
      const { getPromotionProgress } = require('../../members/autoPromotionEngine');
      return getPromotionProgress(interaction.user.id).catch(() => null);
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
  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== tipo) {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Carrinho expirado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  return _refreshCartPanel(interaction, cart);
}

// ── Voltar ao carrinho (do menu de matérias primas) ─────────────────────────
async function handleCartBack(interaction) {
  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.getCart(interaction.user.id);
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
  const tipo = interaction.customId.split('::')[2];
  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.getCart(interaction.user.id);
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

  const { createDeliveryRequest } = require('../inventoryEngine');
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
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} ${e.message}`, embeds: [], components: [] },
      { messageClass: 'ERROR' }
    );
  }

  // Só limpa o carrinho DEPOIS de criar o pedido com sucesso.
  // Se falhar, o utilizador pode corrigir e re-submeter.
  await bairristaCart.clearCart(interaction.user.id);
  parentStore.clearParent(interaction.user.id);

  // Notificar canal de staff (INVENTORY_EVENTS → CH_MATERIAL_ENTREG 1491506821599330545)
  try {
    const { resolveChannel } = require('../../notifications/channels');
    const staffChannel = await resolveChannel(interaction.client, 'INVENTORY_EVENTS');
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
  } catch (e) {
    // Best-effort
  }

  const isVenda = tipo === 'venda';
  const title = isVenda ? `${EMOJI.LUCRO} Venda submetida` : `${EMOJI.MATERIAL} Entrega submetida`;
  const desc = [
    `**${requestResult.lines.length}** linha(s) · **${requestResult.totalQty.toLocaleString('pt-PT')}** unidades`,
    requestResult.totalValue > 0 ? `Valor: **${Math.round(requestResult.totalValue).toLocaleString('pt-PT')}€**` : '',
    '',
    `${EMOJI.PENDENTE} **Aguarda aprovação da chefia.**`,
    'Só quando a chefia aprovar é que o stock será actualizado.',
  ]
    .filter(Boolean)
    .join('\n');

  const embed = brandEmbed('MOVEMENT').setColor(COLOR.WARNING_SOFT).setTitle(title).setDescription(desc);

  return safeReply(
    interaction,
    { content: '', embeds: [embed], components: [] },
    { messageClass: 'RESULT', ttlMs: 15_000 }
  );
}

// ── Undo submission ─────────────────────────────────────────────────────────
async function handleCartUndo(interaction) {
  // deferUpdate pela mesma razão que handleCartSubmit: evita double-click
  // race + substitui o feedback (com botão undo) pela confirmação de undo
  // na mesma mensagem.
  await interaction.deferUpdate().catch(() => {});

  const submissionId = interaction.customId.split('::')[2];
  const { undoSubmission } = require('../inventoryEngine');
  const r = await undoSubmission({
    submissionId,
    requesterDiscordId: interaction.user.id,
    client: interaction.client,
  });
  if (!r.undone) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} ${r.reason}`, embeds: [], components: [] },
      { messageClass: 'WARN' }
    );
  }
  return safeReply(
    interaction,
    {
      content: `${EMOJI.OK} Submissão desfeita — ${r.deletedCount} linha(s) removida(s). O stock foi restaurado.`,
      embeds: [],
      components: [],
    },
    { messageClass: 'BANAL' }
  );
}

module.exports = {
  handleRegistarMaterialButton,
  handleTipoRegistoSelect,
  _refreshCartPanel,
  handleCartAdd,
  handleCartCategory,
  _openCartQtyModal,
  handleCartItemPick,
  handleCartQtyModal,
  handleCartLineAction,
  handleCartNotesButton,
  handleCartNotesModal,
  handleCartCancel,
  handleCartRepeat,
  handleCartPreview,
  handleCartPreviewBack,
  handleCartBack,
  handleCartSubmit,
  handleCartUndo,
};
