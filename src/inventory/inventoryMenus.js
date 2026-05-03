'use strict';
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { inventoryRepo } = require('../repositories');
const { MODALS, INVENTORY } = require('../content');
const { buildSearchableSelect } = require('../shared/selectSearch');

// Emoji por categoria de material — consistente em todo o bot
const CATEGORY_EMOJI = {
  armas_fogo: '🔫',
  armas_brancas: '🔪',
  dinheiro: '💵',
  sucata_industria: '♻️',
  quimicos_droga: '🧪',
  comida_pesca: '🍖',
  equipamento: '🎒',
  municoes: '🔹',
  metais: '⛏️',
  armas: '🔫',
  acessorios: '🎒',
  reciclagem: '♻️',
  componentes: '🔧',
  madeiras: '🪵',
  quimicos: '🧪',
  electronica: '💻',
  droga: '💊',
  comida: '🍖',
  pesca: '🐟',
  texteis: '🧵',
  utilidade: '🔦',
  outros: '📦',
};

// Display name por categoria
const CATEGORY_LABEL = {
  armas: 'Armas',
  armas_fogo: 'Armas de Fogo',
  armas_brancas: 'Armas Brancas',
  municoes: 'Munições',
  acessorios: 'Acessórios',
  equipamento: 'Equipamento',
  metais: 'Metais',
  sucata_industria: 'Sucata & Indústria',
  reciclagem: 'Reciclagem',
  componentes: 'Componentes',
  madeiras: 'Madeiras',
  quimicos: 'Químicos',
  quimicos_droga: 'Químicos & Droga',
  electronica: 'Electrónica',
  droga: 'Droga',
  dinheiro: 'Dinheiro',
  comida: 'Comida',
  comida_pesca: 'Comida & Pesca',
  pesca: 'Pesca',
  texteis: 'Têxteis',
  utilidade: 'Utilidade',
  outros: 'Outros',
};

/**
 * PASSO 1 — Select menu de categorias.
 * Mostra todas as categorias com itens activos + contagem.
 * O customId leva o prefixo para que o handler saiba para onde ir no passo 2.
 */
async function buildCategorySelectMenu(customIdPrefix, placeholder, { searchKey, modalTitle } = {}) {
  const items = await inventoryRepo.getItems(true);

  const byCat = {};
  for (const item of items) {
    const cat = item.category || 'outros';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(item);
  }

  const options = Object.entries(byCat)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 25)
    .map(([cat, catItems]) => ({
      label: (CATEGORY_LABEL[cat] || cat).slice(0, 100),
      description: `${catItems.length} itens`.slice(0, 100),
      value: cat,
      emoji: CATEGORY_EMOJI[cat] || '📦',
    }));

  if (searchKey) {
    return buildSearchableSelect({
      customId: customIdPrefix,
      placeholder: placeholder || 'Seleciona a categoria',
      options: options.length ? options : [{ label: 'Sem categorias', value: 'none' }],
      searchKey,
      modalTitle: modalTitle || 'Pesquisar categoria',
      messageClass: 'FLOW',
    });
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customIdPrefix)
      .setPlaceholder(placeholder || 'Seleciona a categoria')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options.length ? options : [{ label: 'Sem categorias', value: 'none' }])
  );
}

/**
 * PASSO 2 — Select menu de itens dentro de uma categoria.
 * Mostra até 25 itens da categoria seleccionada com preço + stock.
 */
async function buildItemSelectMenuForCategory(customIdPrefix, placeholder, category, { searchKey, modalTitle } = {}) {
  const items = await inventoryRepo.getItems(true);
  const filtered = items.filter(i => (i.category || 'outros') === category);

  // Batch-fetch stock balances
  const balanceMap = new Map();
  for (const item of filtered) {
    const bal = await inventoryRepo.getStockForItem(item.id).catch(() => 0);
    balanceMap.set(item.id, Number(bal) || 0);
  }

  const emoji = CATEGORY_EMOJI[category] || '📦';
  const options = filtered.slice(0, 25).map(item => {
    const price = parseFloat(item.estimated_value) || 0;
    const priceStr = price > 0 ? `${Math.round(price).toLocaleString('pt-PT')}€` : 'sem preço';
    const balance = balanceMap.get(item.id) || 0;
    return {
      label: item.name.slice(0, 100),
      description: `${priceStr} · ${balance} em stock`.slice(0, 100),
      value: String(item.id),
      emoji,
    };
  });

  if (searchKey) {
    return buildSearchableSelect({
      customId: customIdPrefix,
      placeholder: placeholder || INVENTORY.SELECTS.MATERIAL,
      options: options.length ? options : [{ label: 'Sem itens nesta categoria', value: 'none' }],
      searchKey,
      modalTitle: modalTitle || 'Pesquisar item',
      messageClass: 'FLOW',
    });
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customIdPrefix)
      .setPlaceholder(placeholder || INVENTORY.SELECTS.MATERIAL)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options.length ? options : [{ label: 'Sem itens nesta categoria', value: 'none' }])
  );
}

/**
 * Select menu flat (legacy) — para fluxos com poucas opções (ex: armas de saída).
 * Aceita items pré-filtrados, não puxa da DB.
 */
function buildItemSelectMenuFlat(customIdPrefix, placeholder, items, opts = {}) {
  const emoji = opts.emoji || '📦';
  const options = items.slice(0, 25).map(item => ({
    label: (item.label || item.name || '—').slice(0, 100),
    description: (item.description || '').slice(0, 100) || undefined,
    value: String(item.value || item.id),
    emoji: item.emoji || emoji,
  }));

  const builder = new StringSelectMenuBuilder()
    .setCustomId(customIdPrefix)
    .setPlaceholder(placeholder || 'Seleciona')
    .setMinValues(opts.minValues || 1)
    .setMaxValues(opts.maxValues || 1)
    .addOptions(options.length ? options : [{ label: 'Sem opções', value: 'none' }]);

  return new ActionRowBuilder().addComponents(builder);
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
      )
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
      )
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
      )
    );
}

module.exports = {
  buildCategorySelectMenu,
  buildItemSelectMenuForCategory,
  buildItemSelectMenuFlat,
  buildQuantityModal,
  buildOperationMaterialModal,
  buildStockAdjustmentModal,
  CATEGORY_EMOJI,
  CATEGORY_LABEL,
};
