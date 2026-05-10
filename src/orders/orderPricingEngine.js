'use strict';
/**
 * Engine de cálculo de preços para encomendas e vendas.
 *
 * Suporta multiplicadores por rank para compras e vendas,
 * e cálculo de custos de materiais para itens craftáveis.
 */

const { inventoryRepo } = require('../repositories');
const craftRecipeRepo = require('../repositories/craftRecipe');
const { NotFoundError } = require('../shared/errors');

// ── Multiplicadores por rank/tier ──────────────────────────────────────────
// Bairristas: diferenciados por tier com incrementos de ~0.5%.
// Patrão/Oficial/Chefia: valor base (0%).
const RANK_MULTIPLIERS = {
  buy: {
    young_blood: 0.015, // +1.5%
    o_gunao: 0.01, // +1.0%
    gangster_fodido: 0.005, // +0.5%
    patrao_di_zona: 0.0,
    oficial: 0.0,
    chefia: 0.0,
    inativo: 0.015, // mesmo que young_blood
  },
  sell: {
    young_blood: -0.005, // -0.5%
    o_gunao: 0.0,
    gangster_fodido: 0.005, // +0.5%
    patrao_di_zona: 0.0,
    oficial: 0.0,
    chefia: 0.0,
    inativo: -0.005, // mesmo que young_blood
  },
};

/**
 * Retorna o multiplicador para um determinado rank e tipo.
 * @param {string} role — rank do membro (bairrista, patrao_di_zona, oficial, chefia, inativo)
 * @param {string} type — 'buy' ou 'sell'
 * @param {string} [tier] — tier do bairrista (young_blood, o_gunao, gangster_fodido)
 * @returns {number} multiplicador
 */
function getRankMultiplier(role, type = 'buy', tier = null) {
  const map = RANK_MULTIPLIERS[type] || RANK_MULTIPLIERS.buy;
  if (role === 'bairrista') {
    return map[tier] ?? map.young_blood;
  }
  return map[role] ?? map.young_blood;
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
 * @param {string} [opts.memberTier] — tier do bairrista
 * @returns {Promise<Object>}
 */
async function calculateOrderPricing({ itemId, quantity, memberRole, memberTier }) {
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) throw new NotFoundError('Item não encontrado.', { code: 'ITEM_NOT_FOUND' });

  const unitPrice = parseFloat(item.estimated_value) || 0;
  const { ingredients, hasRecipe } = await calculateIngredientsForOrder(itemId, quantity);

  const basePrice = unitPrice * quantity;
  const materialCost = hasRecipe ? ingredients.reduce((sum, ing) => sum + (parseFloat(ing.subtotal) || 0), 0) : 0;
  const multiplier = getRankMultiplier(memberRole, 'buy', memberTier);
  const finalPrice = basePrice * (1 + multiplier);

  return {
    itemId,
    itemName: item.name,
    quantity,
    unitPrice,
    basePrice,
    materialCost,
    finalPrice,
    multiplier,
    hasRecipe,
    ingredients,
  };
}

/**
 * Calcula o preço de venda de um item para um determinado rank.
 * @param {number} itemId — ID do item
 * @param {string} memberRole — rank do vendedor
 * @param {string} [memberTier] — tier do bairrista
 * @param {number} [quantity=1] — quantidade
 * @returns {Promise<{unitPrice: number, sellPrice: number, multiplier: number}>}
 */
async function calculateSellPrice({ itemId, memberRole, memberTier, quantity = 1 }) {
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) throw new NotFoundError('Item não encontrado.', { code: 'ITEM_NOT_FOUND' });

  const unitPrice = parseFloat(item.estimated_value) || 0;
  const multiplier = getRankMultiplier(memberRole, 'sell', memberTier);
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
