'use strict';
/**
 * orderPreviewEmbedBuilder — rich preview de item + fluxo rápido de quantidade
 * + confirmação de checkout + embed de sucesso.
 *
 * Resolve:
 *   - Descrições compactadas de materiais no select menu (100 chars)
 *   - Fluxo de 6 passos para adicionar 1 item → reduzido via quick-quantity
 *   - Falta de confirmação antes do checkout
 *   - Falta de feedback pós-checkout com tracking
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { formatMoney } = require('../shared/formatMoney');
const { totals } = require('./orderCart');

// ── Item Preview ───────────────────────────────────────────────────────────

function buildItemPreviewEmbed({ item, pricing, memberTier, memberRole }) {
  const embed = brandEmbed('HOUSE').setTitle(`${EMOJI.ENCOMENDA} ${item.name}`).setColor(COLOR.PRIMARY);

  const descLines = [];
  descLines.push(`**💰 Preço unitário:** ${formatMoney(pricing.finalPrice)}`);
  descLines.push(`**📦 Categoria:** ${item.category || '—'}`);
  descLines.push(`**💳 Multiplicador:** ${(pricing.multiplier * 100).toFixed(1)}% (${memberRole || '—'})`);

  if (pricing.hasRecipe && pricing.ingredients?.length) {
    descLines.push('', '🛠️ **Materiais obrigatórios por unidade:**');
    for (const ing of pricing.ingredients) {
      descLines.push(`  • ${ing.name}: **${ing.qty}×**`);
    }
  }

  embed.setDescription(descLines.join('\n'));
  return embed;
}

// ── Quick Quantity Row ─────────────────────────────────────────────────────

function buildQuickQuantityRow(itemId) {
  const quantities = [
    { label: '1 unidade', value: '1', emoji: '1️⃣' },
    { label: '2 unidades', value: '2', emoji: '2️⃣' },
    { label: '3 unidades', value: '3', emoji: '3️⃣' },
    { label: '5 unidades', value: '5', emoji: '5️⃣' },
    { label: '10 unidades', value: '10', emoji: '🔟' },
    { label: 'Outra quantidade…', value: 'custom', emoji: '✏️' },
  ];

  const options = quantities.map(q =>
    new StringSelectMenuOptionBuilder().setLabel(q.label).setValue(q.value).setEmoji(q.emoji)
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`orderqty::${itemId}`)
    .setPlaceholder('🔢 Escolhe a quantidade')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

// ── Preview Action Row ─────────────────────────────────────────────────────

function buildPreviewActionRow(itemId) {
  const addBtn = new ButtonBuilder()
    .setCustomId(`orderadd::${itemId}`)
    .setLabel('➕ Adicionar ao Carrinho')
    .setStyle(ButtonStyle.Success);

  const backBtn = new ButtonBuilder()
    .setCustomId('ordercart::back')
    .setLabel('🔙 Voltar')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(addBtn, backBtn);
}

// ── Checkout Confirmation ──────────────────────────────────────────────────

function buildCheckoutConfirmationEmbed(cart, { memberName } = {}) {
  const { totalQty, totalPrice, materials } = totals(cart);
  const embed = brandEmbed('HOUSE').setTitle(`${EMOJI.PENDENTE} Confirmar Encomenda`).setColor(COLOR.WARNING);

  const lines = [];
  lines.push('Revisa o teu carrinho antes de finalizar:');
  lines.push('');

  for (let i = 0; i < cart.lines.length; i++) {
    const l = cart.lines[i];
    lines.push(`**${i + 1}.** ${l.itemName} · **${l.quantity}×** · **${formatMoney(l.finalPrice)}**`);
  }

  lines.push('', `**Total:** ${totalQty} unidades · **${formatMoney(totalPrice)}**`);

  if (materials.length) {
    lines.push('', '📋 **Materiais a entregar:**');
    for (const m of materials) {
      lines.push(`  • ${m.name}: **${m.qty}×**`);
    }
  }

  if (cart.globalNotes) {
    lines.push('', `📝 **Notas:** ${cart.globalNotes}`);
  }

  embed.setDescription(lines.join('\n').slice(0, 4096));

  if (memberName) embed.setFooter({ text: `— ${memberName}` });
  return embed;
}

function buildCheckoutConfirmationComponents() {
  const confirmBtn = new ButtonBuilder()
    .setCustomId('ordercart::confirm_checkout')
    .setLabel('✅ Confirmar')
    .setStyle(ButtonStyle.Success);

  const backBtn = new ButtonBuilder()
    .setCustomId('ordercart::back')
    .setLabel('🔙 Voltar ao Carrinho')
    .setStyle(ButtonStyle.Secondary);

  const clearBtn = new ButtonBuilder()
    .setCustomId('ordercart::clear')
    .setLabel('🗑️ Limpar')
    .setStyle(ButtonStyle.Danger);

  return [new ActionRowBuilder().addComponents(confirmBtn, backBtn, clearBtn)];
}

// ── Checkout Success ───────────────────────────────────────────────────────

function buildCheckoutSuccessEmbed(createdOrders, cart, { memberName } = {}) {
  const { totalPrice } = totals(cart);
  const embed = brandEmbed('HOUSE').setTitle(`${EMOJI.OK} Encomendas Registadas`).setColor(COLOR.SUCCESS);

  const lines = createdOrders.map(
    (o, i) => `**#${o.id}** · ${cart.lines[i]?.quantity || '?'}× ${cart.lines[i]?.itemName || '?'}`
  );

  lines.push('', `**Total:** ${formatMoney(totalPrice)}`);
  lines.push('A chefia será notificada.');
  if (createdOrders.length > 1) {
    lines.push(`Podes acompanhar o estado em **${EMOJI.HISTORICO} Histórico de Encomendas**.`);
  }

  embed.setDescription(lines.join('\n'));
  if (memberName) embed.setFooter({ text: `— ${memberName}` });
  return embed;
}

module.exports = {
  buildItemPreviewEmbed,
  buildQuickQuantityRow,
  buildPreviewActionRow,
  buildCheckoutConfirmationEmbed,
  buildCheckoutConfirmationComponents,
  buildCheckoutSuccessEmbed,
};
