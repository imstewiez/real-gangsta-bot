'use strict';
/**
 * Bairrista cart — state + UI builders para submissão multi-item de
 * entregas/vendas.
 *
 * Fluxo:
 *   1. `handleTipoRegistoSelect` cria um cart vazio e renderiza painel.
 *   2. User clica "➕ Adicionar" → categoria → item → modal qty/preço →
 *      volta ao painel com a linha adicionada.
 *   3. User pode "✏ Editar linhas" (select menu remove/edit).
 *   4. "✅ Submeter" → recordDeliveryBatch atómico + embed de sucesso com
 *      botão "↩ Desfazer (5 min)".
 *
 * State:
 *   - `cartStore` = sessionStore TTL 15min (limpa carts abandonados).
 *   - Key = discordId; value = { tipo, lines, globalNotes, updatedAt }.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const { createSessionStore } = require('../shared/sessionStore');
const { brandEmbed } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');

const cartStore = createSessionStore('bairristaCart', { ttlMs: 15 * 60 * 1000 });

// ═══════════════════════════════════════════════════════════════════════════
// STATE OPS
// ═══════════════════════════════════════════════════════════════════════════

function createCart(discordId, tipo) {
  const cart = {
    tipo, // 'entrega' | 'venda'
    lines: [],
    globalNotes: '',
    updatedAt: Date.now(),
  };
  cartStore.set(discordId, cart);
  return cart;
}

function getCart(discordId) {
  return cartStore.get(discordId) || null;
}

function saveCart(discordId, cart) {
  cart.updatedAt = Date.now();
  cartStore.set(discordId, cart);
}

function clearCart(discordId) {
  cartStore.delete(discordId);
}

/**
 * Adiciona ou funde uma linha. Se já existe linha para o mesmo itemId
 * (com o mesmo preço custom), soma a quantity; senão adiciona nova linha.
 * Fundir evita duplicados visuais quando o user adiciona o mesmo item 2×.
 */
function addLine(cart, { itemId, itemName, category, quantity, unitPrice, basePrice }) {
  const existing = cart.lines.find(l => l.itemId === itemId && (l.unitPrice ?? null) === (unitPrice ?? null));
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.lines.push({
      itemId,
      itemName,
      category,
      quantity,
      unitPrice: unitPrice ?? null,
      basePrice,
    });
  }
  cart.updatedAt = Date.now();
}

function removeLine(cart, index) {
  if (index < 0 || index >= cart.lines.length) return false;
  cart.lines.splice(index, 1);
  cart.updatedAt = Date.now();
  return true;
}

function setNotes(cart, notes) {
  cart.globalNotes = String(notes || '').slice(0, 500);
  cart.updatedAt = Date.now();
}

function totals(cart) {
  const totalQty = cart.lines.reduce((a, l) => a + l.quantity, 0);
  const totalValue = cart.lines.reduce((a, l) => a + l.quantity * (l.unitPrice ?? l.basePrice), 0);
  return { totalQty, totalValue };
}

// ═══════════════════════════════════════════════════════════════════════════
// UI BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildCartEmbed(cart, { extraNote } = {}) {
  const isVenda = cart.tipo === 'venda';
  const title = isVenda
    ? `${EMOJI.LUCRO} Carrinho — Venda de Material`
    : `${EMOJI.MATERIAL} Carrinho — Entrega de Material`;
  const color = isVenda ? 0xf1c40f : 0x2ecc71;

  const { totalQty, totalValue } = totals(cart);

  const lines = [];
  if (cart.lines.length === 0) {
    lines.push('_Carrinho vazio. Clica **➕ Adicionar item** para começar._');
  } else {
    for (let i = 0; i < cart.lines.length; i++) {
      const l = cart.lines[i];
      const lineValue = l.quantity * (l.unitPrice ?? l.basePrice);
      const priceTag =
        isVenda && l.unitPrice != null && l.unitPrice !== l.basePrice
          ? ` ⚡ **${l.unitPrice}€**/un _(base ${l.basePrice}€)_`
          : l.basePrice > 0
            ? ` · ${l.basePrice}€/un`
            : '';
      const valTag = lineValue > 0 ? ` → **${lineValue.toLocaleString('pt-PT')}€**` : '';
      lines.push(`**${i + 1}.** ${l.itemName} · **${l.quantity}×**${priceTag}${valTag}`);
    }
    lines.push(
      '',
      `**Total:** ${totalQty} unidades${totalValue > 0 ? ` · **${totalValue.toLocaleString('pt-PT')}€**` : ''}`
    );
  }

  if (cart.globalNotes) {
    lines.push('', `📝 _${cart.globalNotes}_`);
  }

  if (extraNote) {
    lines.push('', extraNote);
  }

  return brandEmbed('MOVEMENT').setColor(color).setTitle(title).setDescription(lines.join('\n'));
}

function buildCartComponents(cart, { canRepeat = false } = {}) {
  const tipo = cart.tipo;
  const hasLines = cart.lines.length > 0;
  const rows = [];

  // Row 1: Pesquisar / Adicionar (categoria) / Notas / Repetir última
  // Pesquisar é o path rápido — modal text input com fuzzy match elimina
  // o cascade de dropdowns para quem sabe o nome do item.
  const addRow = new ActionRowBuilder();
  addRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`invcart::search::${tipo}`)
      .setLabel('Pesquisar')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔍')
  );
  addRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`invcart::add::${tipo}`)
      .setLabel('Por categoria')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📁')
  );
  addRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`invcart::notes::${tipo}`)
      .setLabel(cart.globalNotes ? 'Editar notas' : 'Notas')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📝')
  );
  if (canRepeat) {
    addRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`invcart::repeat::${tipo}`)
        .setLabel('Repetir')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔁')
    );
  }
  rows.push(addRow);

  // Row 2: Rever (preview) / Submit / Cancel
  const submitRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`invcart::preview::${tipo}`)
      .setLabel('Rever')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔍')
      .setDisabled(!hasLines),
    new ButtonBuilder()
      .setCustomId(`invcart::submit::${tipo}`)
      .setLabel(hasLines ? `Submeter ${cart.lines.length} linha(s)` : 'Submeter')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
      .setDisabled(!hasLines),
    new ButtonBuilder()
      .setCustomId(`invcart::cancel::${tipo}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );
  rows.push(submitRow);

  // Row 3: line action select (só se há linhas) — remove
  if (hasLines) {
    const options = cart.lines.slice(0, 25).map((l, idx) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${idx + 1}. ${l.itemName} · ${l.quantity}×`.slice(0, 100))
        .setDescription(`Remover esta linha`.slice(0, 100))
        .setValue(`remove:${idx}`)
        .setEmoji('🗑️')
    );
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`invcart::line_action::${tipo}`)
          .setPlaceholder('Remover uma linha…')
          .addOptions(options)
      )
    );
  }

  return rows;
}

/**
 * Preview antes de submeter — mostra totais, notas, aviso de kills
 * elevados se houver. Retorna { embed, components } para actualizar
 * o painel em place.
 */
function buildCartPreview(cart, context = {}) {
  const { totalQty, totalValue } = totals(cart);
  const isVenda = cart.tipo === 'venda';

  const lines = [
    `${EMOJI.INFO} **Rever antes de submeter**`,
    '',
    `• Linhas: **${cart.lines.length}**`,
    `• Total de unidades: **${totalQty.toLocaleString('pt-PT')}**`,
  ];
  if (totalValue > 0) {
    lines.push(`• Valor total: **${totalValue.toLocaleString('pt-PT')}€**`);
  }
  if (cart.globalNotes) {
    lines.push('', `📝 Notas: _${cart.globalNotes}_`);
  }

  if (context.weeklyBefore && context.promotion) {
    const newTotal = (context.weeklyBefore.totalQty || 0) + totalQty;
    lines.push('', `📈 **Semana actual:** ${context.weeklyBefore.totalQty || 0} → **${newTotal}** após submeter`);
    if (context.promotion.threshold) {
      const remaining = Math.max(0, context.promotion.threshold - newTotal);
      if (remaining > 0) {
        lines.push(`🎯 **${context.promotion.nextTierName}**: faltam ${remaining.toLocaleString('pt-PT')} para subir`);
      } else {
        lines.push(`🎯 **${context.promotion.nextTierName}**: atingido após submeter!`);
      }
    }
  }

  if (context.rankCurrent) {
    lines.push(`🏆 Posição actual: **#${context.rankCurrent.position}**/${context.rankCurrent.total}`);
  }

  // Sanity: alerta se alguma linha tem qty muito alta (ex: > 10000 unidades)
  const SANITY_QTY = 10000;
  const huge = cart.lines.filter(l => l.quantity > SANITY_QTY);
  if (huge.length) {
    lines.push(
      '',
      `${EMOJI.WARN} **Atenção:** ${huge.length} linha(s) com qty > ${SANITY_QTY.toLocaleString('pt-PT')}. Confirma se é mesmo este o valor.`
    );
  }

  const embed = brandEmbed('MOVEMENT')
    .setColor(isVenda ? 0xf1c40f : 0x2ecc71)
    .setTitle(isVenda ? `${EMOJI.LUCRO} Preview — Venda` : `${EMOJI.MATERIAL} Preview — Entrega`)
    .setDescription(lines.join('\n'));
  return embed;
}

/**
 * Components para o painel de preview — Voltar + Submeter directo.
 */
function buildPreviewComponents(tipo) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`invcart::preview_back::${tipo}`)
        .setLabel('Voltar ao carrinho')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️'),
      new ButtonBuilder()
        .setCustomId(`invcart::submit::${tipo}`)
        .setLabel('Confirmar e submeter')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    ),
  ];
}

/**
 * Builder para o feedback pós-submit (com botão de undo).
 */
function buildSubmissionFeedback({ submissionId, tipo, totalQty, totalValue, lineCount, promotionLine }) {
  const isVenda = tipo === 'venda';
  const title = isVenda ? `${EMOJI.LUCRO} Venda submetida` : `${EMOJI.MATERIAL} Entrega submetida`;
  const lines = [`**${lineCount}** linha(s) · **${totalQty.toLocaleString('pt-PT')}** unidades`];
  if (totalValue > 0) lines.push(`Valor: **${totalValue.toLocaleString('pt-PT')}€**`);
  if (promotionLine) lines.push('', promotionLine);
  lines.push('', `_Podes desfazer esta submissão nos próximos 5 min._`);

  const embed = brandEmbed('MOVEMENT')
    .setColor(isVenda ? 0xf1c40f : 0x2ecc71)
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `submission ${submissionId.slice(0, 8)}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`invcart::undo::${submissionId}`)
      .setLabel('Desfazer (5 min)')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('↩️')
  );

  return { embed, components: [row] };
}

module.exports = {
  cartStore,
  createCart,
  getCart,
  saveCart,
  clearCart,
  addLine,
  removeLine,
  setNotes,
  totals,
  buildCartEmbed,
  buildCartComponents,
  buildCartPreview,
  buildPreviewComponents,
  buildSubmissionFeedback,
};
