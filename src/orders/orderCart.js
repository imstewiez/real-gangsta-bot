'use strict';
/**
 * Order cart — carrinho de encomendas estilo checkout.
 *
 * Cada linha tem:
 *   - itemId, itemName, category, quantity
 *   - mode: 'money_only' (s/ Mat) | 'materials_money' (c/ Mat)
 *   - unitPrice (preço base do item)
 *   - finalPrice (preço total com tier multiplier)
 *   - materialCost (só se mode === 'materials_money')
 *   - ingredients (array de { name, qty } — materiais necessários)
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const { createSessionStore } = require('../shared/sessionStore');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { formatMoney } = require('../shared/formatMoney');

const cartStore = createSessionStore('orderCart', { ttlMs: 15 * 60 * 1000 });

// ═══════════════════════════════════════════════════════════════════════════
// STATE OPS
// ═══════════════════════════════════════════════════════════════════════════

function createCart(discordId) {
  const cart = { lines: [], globalNotes: '', updatedAt: Date.now() };
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

function addLine(cart, line) {
  const existing = cart.lines.find(l => l.itemId === line.itemId);
  if (existing) {
    existing.quantity += line.quantity;
    existing.finalPrice += line.finalPrice;
    if (line.ingredients) {
      for (const ing of line.ingredients) {
        const exIng = existing.ingredients.find(i => i.name === ing.name);
        if (exIng) exIng.qty += ing.qty;
        else existing.ingredients.push({ name: ing.name, qty: ing.qty });
      }
    }
  } else {
    cart.lines.push({
      itemId: line.itemId,
      itemName: line.itemName,
      category: line.category,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      finalPrice: line.finalPrice,
      ingredients: line.ingredients ? line.ingredients.map(i => ({ ...i })) : [],
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

function totals(cart) {
  const totalQty = cart.lines.reduce((a, l) => a + l.quantity, 0);
  const totalPrice = cart.lines.reduce((a, l) => a + l.finalPrice, 0);

  // Agregar todos os ingredientes de todas as linhas
  const materialMap = new Map();
  for (const l of cart.lines) {
    if (!l.ingredients) continue;
    for (const ing of l.ingredients) {
      materialMap.set(ing.name, (materialMap.get(ing.name) || 0) + ing.qty);
    }
  }
  const materials = Array.from(materialMap.entries()).map(([name, qty]) => ({ name, qty }));

  return { totalQty, totalPrice, materials };
}

// ═══════════════════════════════════════════════════════════════════════════
// UI BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildCartEmbed(cart, { memberName } = {}) {
  const { totalQty, totalPrice, materials } = totals(cart);

  const embed = brandEmbed('HOUSE').setTitle(`${EMOJI.ENCOMENDA} Carrinho de Encomendas`).setColor(COLOR.PRIMARY);

  if (!cart.lines.length) {
    embed.setDescription('O carrinho está vazio.\n\nClica em **➕ Adicionar** para começar.');
    return embed;
  }

  const lines = [];
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

  embed.setDescription(lines.join('\n'));
  if (memberName) embed.setFooter({ text: `— ${memberName}` });
  return embed;
}

function buildCartComponents(cart) {
  const rows = [];

  // Row 1: Adicionar + | Finalizar | Limpar
  const addBtn = new ButtonBuilder()
    .setCustomId('ordercart::add')
    .setLabel('➕ Adicionar')
    .setStyle(ButtonStyle.Success);
  const submitBtn = new ButtonBuilder()
    .setCustomId('ordercart::checkout')
    .setLabel('✅ Finalizar')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!cart.lines.length);
  const clearBtn = new ButtonBuilder()
    .setCustomId('ordercart::clear')
    .setLabel('🗑️ Limpar')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(!cart.lines.length);
  rows.push(new ActionRowBuilder().addComponents(addBtn, submitBtn, clearBtn));

  // Row 2: Remover item (select menu se houver linhas)
  if (cart.lines.length) {
    const removeOpts = cart.lines.slice(0, 25).map((l, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${i + 1}. ${l.itemName} (${l.quantity}×)`)
        .setValue(String(i))
        .setDescription('📦 Encomenda')
    );
    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId('ordercart::remove')
      .setPlaceholder('🗑️ Remover item...')
      .addOptions(removeOpts);
    rows.push(new ActionRowBuilder().addComponents(removeSelect));
  }

  return rows;
}

module.exports = {
  createCart,
  getCart,
  saveCart,
  clearCart,
  addLine,
  removeLine,
  totals,
  buildCartEmbed,
  buildCartComponents,
};
