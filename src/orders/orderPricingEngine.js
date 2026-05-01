'use strict';
/**
 * Engine de cálculo de preços para encomendas e vendas.
 *
 * Suporta multiplicadores por rank para compras e vendas,
 * e cálculo de custos de materiais para itens craftáveis.
 */

const { inventoryRepo } = require('../repositories');
const craftRecipeRepo = require('../repositories/craftRecipe');

// ── Multiplicadores por rank ───────────────────────────────────────────────
const RANK_MULTIPLIERS = {
  buy: {
    bairrista: 0.30,
    patrao_di_zona: 0.20,
    oficial: 0.10,
    chefia: 0.00,
    inativo: 0.30,
  },
  sell: {
    bairrista: 0.10,
    patrao_di_zona: 0.20,
    oficial: 0.30,
    chefia: 0.30,
    inativo: 0.10,
  },
};

/**
 * Retorna o multiplicador para um determinado rank e tipo.
 * @param {string} role — rank do membro (bairrista, patrao_di_zona, oficial, chefia, inativo)
 * @param {string} type — 'buy' ou 'sell'
 * @returns {number} multiplicador (0.0 a 0.3)
 */
function getRankMultiplier(role, type = 'buy') {
  const map = RANK_MULTIPLIERS[type] || RANK_MULTIPLIERS.buy;
  return map[role] ?? map.bairrista;
}

/**
 * Calcula os ingredientes necessários para uma quantidade de um item craftável.
 * @param {number} itemId — ID do item
 * @param {number} quantity — quantidade encomendada
 * @returns {Promise<{ingredients: Array, hasRecipe: boolean}>}
 */
async function calculateIngredientsForOrder(itemId, quantity) {
  const recipe = await craftRecipeRepo.getRecipeWithIngredients(itemId);
  if (!recipe) return { ingredients: [], hasRecipe: false };

  const ingredients = recipe.ingredients.map(ing => ({
    itemId: ing.ingredient_item_id,
    name: ing.ingredient_name,
    qty: ing.quantity * quantity,
    unitPrice: parseFloat(ing.ingredient_price) || 0,
    subtotal: (parseFloat(ing.ingredient_price) || 0) * ing.quantity * quantity,
  }));

  return { ingredients, hasRecipe: true };
}

/**
 * Calcula o preço total de uma encomenda.
 * @param {Object} opts
 * @param {number} opts.itemId — ID do item
 * @param {number} opts.quantity — quantidade
 * @param {string} opts.memberRole — rank do membro
 * @param {string} [opts.paymentMode='materials_money'] — 'materials_money' ou 'money_only'
 * @returns {Promise<Object>}
 */
async function calculateOrderPricing({ itemId, quantity, memberRole, paymentMode = 'materials_money' }) {
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) throw new Error('Item não encontrado.');

  const unitPrice = parseFloat(item.estimated_value) || 0;
  const { ingredients, hasRecipe } = await calculateIngredientsForOrder(itemId, quantity);

  let basePrice = 0;
  let materialCost = 0;

  if (hasRecipe) {
    materialCost = ingredients.reduce((sum, ing) => sum + ing.subtotal, 0);
    // Preço base = custo dos materiais (o utilizador entrega os materiais)
    basePrice = materialCost;
  } else {
    // Item simples: preço base = estimated_value × quantidade
    basePrice = unitPrice * quantity;
  }

  const multiplier = getRankMultiplier(memberRole, 'buy');
  const finalPrice = basePrice * (1 + multiplier);

  return {
    itemId,
    itemName: item.name,
    quantity,
    unitPrice,
    basePrice,
    finalPrice,
    materialCost,
    multiplier,
    paymentMode,
    hasRecipe,
    ingredients,
  };
}

/**
 * Calcula o preço de venda de um item para um determinado rank.
 * @param {number} itemId — ID do item
 * @param {string} memberRole — rank do vendedor
 * @param {number} [quantity=1] — quantidade
 * @returns {Promise<{unitPrice: number, sellPrice: number, multiplier: number}>}
 */
async function calculateSellPrice({ itemId, memberRole, quantity = 1 }) {
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) throw new Error('Item não encontrado.');

  const unitPrice = parseFloat(item.estimated_value) || 0;
  const multiplier = getRankMultiplier(memberRole, 'sell');
  const sellPrice = unitPrice * (1 + multiplier) * quantity;

  return {
    itemId,
    itemName: item.name,
    unitPrice,
    sellPrice,
    multiplier,
    quantity,
  };
}

module.exports = {
  getRankMultiplier,
  calculateIngredientsForOrder,
  calculateOrderPricing,
  calculateSellPrice,
  RANK_MULTIPLIERS,
};
