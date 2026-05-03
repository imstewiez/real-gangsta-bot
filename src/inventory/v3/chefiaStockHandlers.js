'use strict';
/**
 * Handlers de interação do Stock v3 para o painel da chefia.
 */

const { safeReply, safeUpdate, safeShowModal, getModalField } = require('../../shared/interactionHelpers');
const { requirePermission } = require('../../shared/requirePermission');
const { isChefia } = require('../../permissions/permissionEngine');
const { logAudit } = require('../../audit/auditEngine');
const { log } = require('../../logger');
const { getCatalog, getItemName, getUnitCost } = require('./stockCatalog');
const { getAllPricing, setPricing } = require('./stockPricing');
const { getAllBalances, recordEntry, recordSale, recordGiveaway } = require('./stockManager');
const {
  buildStockV3MainEmbed,
  buildStockV3MainButtons,
  buildItemSelectMenu,
  buildRetiradaTypeSelect,
  buildEntryModal,
  buildSaleModal,
  buildGiveawayModal,
  buildPricingModal,
  buildReportEmbeds,
} = require('./chefiaStockMenus');
const {
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const { EMOJI } = require('../../content');

// ── Main panel ───────────────────────────────────────────────────────────────

async function handleGerirStockV3(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const balances = await getAllBalances();
  const pricing = await getAllPricing();
  const embed = buildStockV3MainEmbed(balances, pricing);
  const buttons = buildStockV3MainButtons();
  await safeReply(interaction, { embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral });
}

// ── Entrada flow ─────────────────────────────────────────────────────────────

async function handleEntradaButton(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const row = buildItemSelectMenu('stockv3::select_entrada_item', 'Escolhe o artigo para entrada');
  await safeReply(interaction, {
    content: '**Entrada de Stock** — escolhe o artigo:',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleEntradaItemSelect(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const itemKey = interaction.values[0];
  await safeShowModal(interaction, buildEntryModal(itemKey));
}

async function handleEntradaModal(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const [, , itemKey] = interaction.customId.split('::');
  const qty = parseInt(getModalField(interaction, 'qty'), 10);
  const totalPrice = parseFloat(getModalField(interaction, 'total_price').replace(/\./g, '').replace(',', '.'));
  const reason = getModalField(interaction, 'reason');

  if (!qty || qty <= 0 || isNaN(totalPrice) || totalPrice < 0) {
    return safeReply(interaction, {
      content: `${EMOJI.ERRO} Quantidade ou preço inválidos.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const mov = await recordEntry({
    itemKey,
    quantity: qty,
    totalPrice,
    reason,
    actorTag: interaction.user.tag,
    actorId: interaction.user.id,
  });

  await logAudit({
    action: 'stock_v3_entrada',
    entityType: 'stock',
    entityId: String(mov.id),
    actorId: interaction.user.id,
    afterState: { itemKey, qty, totalPrice, reason },
    context: `Entrada stock v3: ${getItemName(itemKey)} x${qty}`,
  });

  log(`[STOCKV3] Entrada: ${interaction.user.tag} → ${itemKey} x${qty} @ ${totalPrice}€`);

  // Refresh panel
  const balances = await getAllBalances();
  const pricing = await getAllPricing();
  const embed = buildStockV3MainEmbed(balances, pricing);
  const buttons = buildStockV3MainButtons();
  await safeReply(interaction, {
    content: `${EMOJI.SUCCESS} Entrada registada: **${getItemName(itemKey)}** x${qty} · ${Math.round(totalPrice).toLocaleString('pt-PT')}€`,
    embeds: [embed],
    components: [buttons],
    flags: MessageFlags.Ephemeral,
  });
}

// ── Retirada flow ────────────────────────────────────────────────────────────

async function handleRetiradaButton(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const row = buildRetiradaTypeSelect();
  await safeReply(interaction, {
    content: '**Retirada de Stock** — escolhe o tipo:',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRetiradaTipoSelect(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const tipo = interaction.values[0]; // 'venda' | 'entrega'
  const customId = tipo === 'venda' ? 'stockv3::select_venda_item' : 'stockv3::select_entrega_item';
  const placeholder = tipo === 'venda' ? 'Artigo a vender' : 'Artigo a entregar';
  const row = buildItemSelectMenu(customId, placeholder);
  await safeUpdate(interaction, {
    content: `**Retirada — ${tipo === 'venda' ? 'Venda' : 'Entrega/Prémio'}** — escolhe o artigo:`,
    components: [row],
  });
}

async function handleVendaItemSelect(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const itemKey = interaction.values[0];
  await safeShowModal(interaction, buildSaleModal(itemKey));
}

async function handleEntregaItemSelect(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const itemKey = interaction.values[0];
  await safeShowModal(interaction, buildGiveawayModal(itemKey));
}

async function handleVendaModal(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const [, , itemKey] = interaction.customId.split('::');
  const qty = parseInt(getModalField(interaction, 'qty'), 10);
  const salePrice = parseFloat(getModalField(interaction, 'sale_price').replace(/\./g, '').replace(',', '.'));

  if (!qty || qty <= 0 || isNaN(salePrice) || salePrice < 0) {
    return safeReply(interaction, {
      content: `${EMOJI.ERRO} Quantidade ou preço inválidos.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const unitCost = await getUnitCost(itemKey);
  if (unitCost <= 0) {
    return safeReply(interaction, {
      content: `${EMOJI.ERRO} Preço de custo não definido para **${getItemName(itemKey)}**. Define em ⚙️ Preços de Custo primeiro.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const mov = await recordSale({
    itemKey,
    quantity: qty,
    salePrice,
    actorTag: interaction.user.tag,
    actorId: interaction.user.id,
  });

  const profit = Math.round(Number(mov.gross_profit) || 0);
  const profitEmoji = profit >= 0 ? EMOJI.SUCCESS : EMOJI.ERRO;

  await logAudit({
    action: 'stock_v3_venda',
    entityType: 'stock',
    entityId: String(mov.id),
    actorId: interaction.user.id,
    afterState: { itemKey, qty, salePrice, profit },
    context: `Venda stock v3: ${getItemName(itemKey)} x${qty} @ ${salePrice}€/un`,
  });

  const balances = await getAllBalances();
  const pricing = await getAllPricing();
  const embed = buildStockV3MainEmbed(balances, pricing);
  const buttons = buildStockV3MainButtons();
  await safeReply(interaction, {
    content: `${profitEmoji} Venda registada: **${getItemName(itemKey)}** x${qty} @ ${Math.round(salePrice).toLocaleString('pt-PT')}€/un · Lucro: ${profit.toLocaleString('pt-PT')}€`,
    embeds: [embed],
    components: [buttons],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleEntregaModal(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const [, , itemKey] = interaction.customId.split('::');
  const qty = parseInt(getModalField(interaction, 'qty'), 10);
  const recipient = getModalField(interaction, 'recipient') || null;
  const reason = getModalField(interaction, 'reason');

  if (!qty || qty <= 0) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} Quantidade inválida.`, flags: MessageFlags.Ephemeral });
  }

  const unitCost = await getUnitCost(itemKey);
  if (unitCost <= 0) {
    return safeReply(interaction, {
      content: `${EMOJI.ERRO} Preço de custo não definido para **${getItemName(itemKey)}**. Define em ⚙️ Preços de Custo primeiro.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const mov = await recordGiveaway({
    itemKey,
    quantity: qty,
    recipientMemberId: null,
    reason,
    actorTag: interaction.user.tag,
    actorId: interaction.user.id,
  });

  const loss = Math.round(Number(mov.total_loss) || 0);

  await logAudit({
    action: 'stock_v3_entrega',
    entityType: 'stock',
    entityId: String(mov.id),
    actorId: interaction.user.id,
    afterState: { itemKey, qty, reason, loss },
    context: `Entrega stock v3: ${getItemName(itemKey)} x${qty} → ${recipient || 'sem destinatário'}`,
  });

  const balances = await getAllBalances();
  const pricing = await getAllPricing();
  const embed = buildStockV3MainEmbed(balances, pricing);
  const buttons = buildStockV3MainButtons();
  await safeReply(interaction, {
    content: `${EMOJI.WARN} Entrega registada: **${getItemName(itemKey)}** x${qty} → ${recipient || '—'} · Prejuízo: ${loss.toLocaleString('pt-PT')}€`,
    embeds: [embed],
    components: [buttons],
    flags: MessageFlags.Ephemeral,
  });
}

// ── Relatório ────────────────────────────────────────────────────────────────

async function handleRelatorioButton(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const embeds = await buildReportEmbeds();
  await safeReply(interaction, { embeds, flags: MessageFlags.Ephemeral });
}

// ── Preços de Custo ──────────────────────────────────────────────────────────

async function handlePrecosButton(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const pricing = await getAllPricing();
  const options = getCatalog().map(item => {
    const p = pricing.find(pr => pr.item_key === item.key);
    return new StringSelectMenuOptionBuilder()
      .setLabel(`${item.name} — ${Math.round(Number(p?.unit_cost || 0)).toLocaleString('pt-PT')}€`)
      .setValue(item.key);
  });
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('stockv3::select_preco_item')
      .setPlaceholder('Escolhe o artigo para editar')
      .addOptions(options)
  );
  await safeReply(interaction, {
    content: '**Preços de Custo** — escolhe o artigo:',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handlePrecoItemSelect(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const itemKey = interaction.values[0];
  const pricing = await getAllPricing();
  const p = pricing.find(pr => pr.item_key === itemKey);
  await safeShowModal(interaction, buildPricingModal(itemKey, Number(p?.unit_cost || 0)));
}

async function handlePrecoModal(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const [, , itemKey] = interaction.customId.split('::');
  const unitCost = parseFloat(getModalField(interaction, 'unit_cost').replace(/\./g, '').replace(',', '.'));
  if (isNaN(unitCost) || unitCost < 0) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} Preço inválido.`, flags: MessageFlags.Ephemeral });
  }
  await setPricing(itemKey, unitCost, interaction.user.tag);
  log(`[STOCKV3] Preço actualizado: ${interaction.user.tag} → ${itemKey} = ${unitCost}€`);
  const balances = await getAllBalances();
  const pricing = await getAllPricing();
  const embed = buildStockV3MainEmbed(balances, pricing);
  const buttons = buildStockV3MainButtons();
  await safeReply(interaction, {
    content: `${EMOJI.SUCCESS} Preço actualizado: **${getItemName(itemKey)}** = ${Math.round(unitCost).toLocaleString('pt-PT')}€`,
    embeds: [embed],
    components: [buttons],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  handleGerirStockV3,
  handleEntradaButton,
  handleEntradaItemSelect,
  handleEntradaModal,
  handleRetiradaButton,
  handleRetiradaTipoSelect,
  handleVendaItemSelect,
  handleEntregaItemSelect,
  handleVendaModal,
  handleEntregaModal,
  handleRelatorioButton,
  handlePrecosButton,
  handlePrecoItemSelect,
  handlePrecoModal,
};
