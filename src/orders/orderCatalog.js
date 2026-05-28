'use strict';
/**
 * Catálogo de encomendas — apenas itens do preçário de compra.
 *
 * Reutiliza as whitelist e classificações do priceListInteractive.js
 * para garantir consistência entre preçário e catálogo de encomendas.
 */

const { inventoryRepo } = require('../repositories');
const craftRecipeRepo = require('../repositories/craftRecipe');
const { getRankMultiplier } = require('../orders/orderPricingEngine');
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { buildSearchableSelect } = require('../shared/selectSearch');

// ── Whitelists (copiadas de priceListInteractive.js para evitar coupling) ──

const BUY_WEAPON_NAMES = new Set([
  'Pistol XM3',
  'Mini SMG',
  'Micro SMG',
  'TEC Pistol',
  'AP Pistol',
  'TEC-9',
  '.50',
  'P90',
  'PDW',
  'Bullpup',
  'Carabina',
  'Heavy Pistol',
]);

const EXCLUDED_NAMES = new Set([
  'Lançador da Âncora',
  'Colete Tático',
  'Colete Leve',
  'Colete Pesado',
  'Micro Carregador',
  'TEC-9 Carregador',
  'TecPistol Carregador',
  'HeavyPistol Carregador',
  'APPistol Carregador',
  'Pistol50 Carregador',
  'AssaultSMG Carregador',
  'AssaultRifle Carregador',
  'PDW Carregador',
  'Bullpup Carregador',
  'CompactRifle Carregador',
  'SpecialCarbine Carregador',
  'Tactical Carregador',
  'BattleRifle Carregador',
  'MilitaryRifle Carregador',
]);

const ALLOWED_ACESSORIOS = new Set([
  'Silenciador',
  'Mira',
  'Grip',
  'Lanterna',
  'Muzzle',
  'Barrel',
  'Extensivo',
  'Mag Expandido',
]);

const ARMAS_ORANGE_NAMES = new Set(['Pistol XM3', 'Mini SMG', 'Micro SMG', 'TEC Pistol', 'AP Pistol', 'TEC-9']);

const ARMAS_RED_NAMES = new Set(['.50', 'P90', 'PDW', 'Bullpup', 'Carabina', 'Heavy Pistol']);

// ── Ordem explícita dentro de cada categoria ───────────────────────────────

const ORDER_ARMAS_BRANCAS = ['Canivete', 'Taco de Baseball', 'Taco de 8Ball'];
const ORDER_ARMAS_ORANGE = ['Pistol XM3', 'Mini SMG', 'Micro SMG', 'TEC-9', 'TEC Pistol', 'AP Pistol'];
const ORDER_ARMAS_RED = ['Heavy Pistol', '.50', 'PDW', 'P90', 'Bullpup', 'Carabina'];

const _ING_ABBREV = {
  'Barra de Ouro': 'Ouro',
  'Barra de Cobre': 'Cobre',
  'Print Laranja': 'P.Lar',
  'Print Azul': 'P.Azu',
  'Print Vermelha': 'P.Verm',
  'Print Amarela': 'P.Amar',
  'Tábua de Ébano': 'Ébano',
  'Molde de Arma': 'Molde',
  'Corpo Mini SMG': 'Corpo',
  'Corpo Pistol XM3': 'Corpo',
  'Corpo Micro SMG': 'Corpo',
  'Corpo TEC-9': 'Corpo',
  'Corpo TEC Pistol': 'Corpo',
  'Corpo AP Pistol': 'Corpo',
  'Dinheiro Sujo': 'Sujo',
};

function _compactIngredients(ingredients) {
  const parts = ingredients.map(ing => {
    const name = _ING_ABBREV[ing.ingredient_name] || ing.ingredient_name;
    return `${ing.quantity}${name}`;
  });
  return parts.join('+');
}

function sortByExplicitOrder(items, orderArray) {
  const orderMap = new Map(orderArray.map((name, i) => [name, i]));
  return items.slice().sort((a, b) => {
    const ia = orderMap.get(a.name) ?? Infinity;
    const ib = orderMap.get(b.name) ?? Infinity;
    return ia - ib;
  });
}

// ── Categorias de exibição para encomendas ─────────────────────────────────

const ORDER_CATEGORIES = [
  { key: 'armas_orange', label: '🟠 Armas Orange', emoji: '🟠' },
  { key: 'armas_red', label: '🔴 Armas Red', emoji: '🔴' },
  { key: 'carregadores', label: '🔋 Carregadores', emoji: '🔋' },
  { key: 'coletes', label: '🛡️ Coletes', emoji: '🛡️' },
  { key: 'acessorios', label: '🔧 Acessórios', emoji: '🔧' },
];

function classifyOrderCategory(item) {
  const name = item.name || '';
  const cat = item.category || '';

  if (EXCLUDED_NAMES.has(name)) return null;
  if (
    !BUY_WEAPON_NAMES.has(name) &&
    !name.startsWith('Carregador') &&
    !name.startsWith('Colete') &&
    !ALLOWED_ACESSORIOS.has(name)
  ) {
    return null;
  }

  if (cat === 'armas_brancas') return 'armas_brancas';
  if (cat === 'armas_fogo') {
    if (ARMAS_RED_NAMES.has(name)) return 'armas_red';
    if (ARMAS_ORANGE_NAMES.has(name)) return 'armas_orange';
    return null;
  }
  if (name.startsWith('Carregador')) return 'carregadores';
  if (name.startsWith('Colete')) return 'coletes';
  if (ALLOWED_ACESSORIOS.has(name)) return 'acessorios';
  return null;
}

// ── Fetch e filtragem ──────────────────────────────────────────────────────

async function getOrderCatalogItems() {
  const items = await inventoryRepo.getItems(true);
  return items.map(i => ({ ...i, orderCategory: classifyOrderCategory(i) })).filter(i => i.orderCategory !== null);
}

// ── Select menu builders ───────────────────────────────────────────────────

async function buildOrderCategorySelect(customIdPrefix, placeholder, { searchKey, modalTitle } = {}) {
  const items = await getOrderCatalogItems();

  const byCat = {};
  for (const item of items) {
    const cat = item.orderCategory;
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(item);
  }

  const options = ORDER_CATEGORIES.filter(c => byCat[c.key]?.length > 0).map(c => ({
    label: c.label.slice(0, 100),
    description: `${byCat[c.key].length} itens`.slice(0, 100),
    value: c.key,
    emoji: c.emoji,
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

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customIdPrefix)
        .setPlaceholder(placeholder || 'Seleciona a categoria')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options.length ? options : [{ label: 'Sem categorias', value: 'none' }])
    ),
  ];
}

async function buildOrderItemSelect(
  customIdPrefix,
  placeholder,
  category,
  { searchKey, modalTitle, memberRole, memberTier } = {}
) {
  const items = await getOrderCatalogItems();
  let filtered = items.filter(i => i.orderCategory === category);

  // Ordenação: explícita para armas; todas as outras categorias por preço descendente
  if (category === 'armas_brancas') filtered = sortByExplicitOrder(filtered, ORDER_ARMAS_BRANCAS);
  else if (category === 'armas_orange') filtered = sortByExplicitOrder(filtered, ORDER_ARMAS_ORANGE);
  else if (category === 'armas_red') filtered = sortByExplicitOrder(filtered, ORDER_ARMAS_RED);
  else filtered.sort((a, b) => (parseFloat(b.estimated_value) || 0) - (parseFloat(a.estimated_value) || 0));

  const catMeta = ORDER_CATEGORIES.find(c => c.key === category);
  const emoji = catMeta?.emoji || '📦';

  // Fetch recipes for craft indicator
  const recipes = await craftRecipeRepo.getAllRecipesWithIngredients();
  const recipeMap = new Map();
  for (const r of recipes) recipeMap.set(r.item_id, r);

  const mult = memberRole ? getRankMultiplier(memberRole, 'buy', memberTier) : 0;

  const options = filtered.slice(0, 25).map(item => {
    const base = parseFloat(item.estimated_value) || 0;
    const price = base * (1 + mult);
    const recipe = recipeMap.get(item.id);
    let priceStr = price > 0 ? `${Math.round(price).toLocaleString('pt-PT')}€` : 'sem preço';
    if (recipe) {
      const mats = _compactIngredients(recipe.ingredients);
      priceStr = `${priceStr} 🛠️ ${mats}`;
    }
    return {
      label: item.name.slice(0, 100),
      description: priceStr.slice(0, 100),
      value: String(item.id),
      emoji,
    };
  });

  if (searchKey) {
    return buildSearchableSelect({
      customId: customIdPrefix,
      placeholder: placeholder || 'Escolhe o item',
      options: options.length ? options : [{ label: 'Sem itens', value: 'none' }],
      searchKey,
      modalTitle: modalTitle || 'Pesquisar item',
      messageClass: 'FLOW',
    });
  }

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customIdPrefix)
        .setPlaceholder(placeholder || 'Escolhe o item')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options.length ? options : [{ label: 'Sem itens', value: 'none' }])
    ),
  ];
}

module.exports = {
  BUY_WEAPON_NAMES,
  EXCLUDED_NAMES,
  ALLOWED_ACESSORIOS,
  ORDER_CATEGORIES,
  classifyOrderCategory,
  getOrderCatalogItems,
  buildOrderCategorySelect,
  buildOrderItemSelect,
};
