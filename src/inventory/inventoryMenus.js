'use strict';
const {
  ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { inventoryRepo } = require('../repositories');
const { MODALS, INVENTORY } = require('../content');

// Emoji por categoria de material — consistente em todo o bot
// Inclui nomes do catálogo actual (config/full-inventory.json) + legacy
const CATEGORY_EMOJI = {
  // Catálogo actual
  armas_fogo: '🔫', armas_brancas: '🔪', dinheiro: '💵',
  sucata_industria: '♻️', quimicos_droga: '🧪', comida_pesca: '🍖',
  equipamento: '🎒', municoes: '🔹', metais: '⛏️',
  // Legacy (ainda pode haver items com estas categorias)
  armas: '🔫', acessorios: '🎒', reciclagem: '♻️',
  componentes: '🔧', madeiras: '🪵', quimicos: '🧪',
  electronica: '💻', droga: '💊', comida: '🍖', pesca: '🐟',
  texteis: '🧵', utilidade: '🔦', outros: '📦',
};

/**
 * Select menu de materiais — agrupado por categoria, com emoji + preço + stock.
 * Máximo 25 opções (limite Discord). Ordenado por categoria, depois por nome.
 */
async function buildItemSelectMenu(customIdPrefix, placeholder) {
  const items = await inventoryRepo.getItems(true);

  // Batch-fetch stock balances para mostrar no description
  const balanceMap = new Map();
  for (const item of items) {
    const bal = await inventoryRepo.getStockForItem(item.id).catch(() => 0);
    balanceMap.set(item.id, Number(bal) || 0);
  }

  // Agrupar por categoria
  const grouped = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  const options = [];
  for (const [category, catItems] of Object.entries(grouped)) {
    const emoji = CATEGORY_EMOJI[category] || '📦';
    for (const item of catItems) {
      if (options.length >= 25) break;
      const price = parseFloat(item.estimated_value) || 0;
      const priceStr = price > 0 ? `${price.toLocaleString('pt-PT')}€` : 'sem preço';
      const balance = balanceMap.get(item.id) || 0;
      const stockStr = `${balance} em stock`;
      options.push({
        label: item.name.slice(0, 100),
        description: `${priceStr} · ${stockStr}`.slice(0, 100),
        value: String(item.id),
        emoji,
      });
    }
    if (options.length >= 25) break;
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customIdPrefix)
      .setPlaceholder(placeholder || INVENTORY.SELECTS.MATERIAL)
      .setMinValues(1).setMaxValues(1)
      .addOptions(options.length ? options : [{ label: 'Sem itens disponíveis', value: 'none' }])
  );
}

function buildQuantityModal(title, customId) {
  const F = MODALS.INVENTORY_QUANTITY.FIELDS;
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(typeof F.quantity.label === 'function' ? F.quantity.label() : F.quantity.label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(F.quantity.placeholder)
          .setRequired(F.quantity.required)
          .setMaxLength(F.quantity.maxLength)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel(F.notes.label)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(F.notes.placeholder)
          .setRequired(F.notes.required)
          .setMaxLength(F.notes.maxLength)
      ),
    );
}

function buildOperationMaterialModal(title, customId) {
  const F = MODALS.SAIDA_MATERIAL.FIELDS;
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(F.qty.label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(F.qty.placeholder)
          .setRequired(F.qty.required)
          .setMaxLength(F.qty.maxLength)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel(F.notes.label)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(F.notes.placeholder)
          .setRequired(F.notes.required)
          .setMaxLength(F.notes.maxLength)
      ),
    );
}

function buildStockAdjustmentModal(customId) {
  const F = MODALS.INVENTORY_ADJUST.FIELDS;
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(MODALS.INVENTORY_ADJUST.TITLE)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(F.delta.label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(F.delta.placeholder)
          .setRequired(F.delta.required)
          .setMaxLength(F.delta.maxLength)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel(F.reason.label)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(F.reason.placeholder)
          .setRequired(F.reason.required)
          .setMaxLength(F.reason.maxLength)
      ),
    );
}

module.exports = {
  buildItemSelectMenu,
  buildQuantityModal,
  buildOperationMaterialModal,
  buildStockAdjustmentModal,
};
