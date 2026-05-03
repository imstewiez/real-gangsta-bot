'use strict';
/**
 * Repository de receitas de craft (craft_recipes + recipe_ingredients).
 */

const { query, queryWithTransaction } = require('../db');

async function createRecipe({ itemId, category = 'outros', tier = null, ingredients = [] }) {
  return queryWithTransaction(async client => {
    const recipeRes = await client.query(
      `INSERT INTO craft_recipes (item_id, category, tier)
       VALUES ($1, $2, $3)
       ON CONFLICT (item_id) DO UPDATE SET category = $2, tier = $3
       RETURNING id`,
      [itemId, category, tier]
    );
    const recipeId = recipeRes.rows[0].id;

    // Clear old ingredients and re-insert
    await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [recipeId]);
    for (const ing of ingredients) {
      await client.query(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
         VALUES ($1, $2, $3)`,
        [recipeId, ing.itemId, ing.quantity]
      );
    }
    return { recipeId, itemId, category, tier, ingredientCount: ingredients.length };
  });
}

async function findByItemId(itemId) {
  const res = await query('SELECT * FROM craft_recipes WHERE item_id = $1', [itemId]);
  return res.rows[0] || null;
}

async function findByCategory(category) {
  const res = await query('SELECT * FROM craft_recipes WHERE category = $1 ORDER BY id', [category]);
  return res.rows;
}

async function getAllRecipes() {
  const res = await query('SELECT * FROM craft_recipes ORDER BY category, tier, id');
  return res.rows;
}

async function getRecipeWithIngredients(itemId) {
  const recipeRes = await query(
    `SELECT cr.*, i.name as item_name, i.estimated_value as item_price
     FROM craft_recipes cr
     JOIN items i ON i.id = cr.item_id
     WHERE cr.item_id = $1`,
    [itemId]
  );
  if (!recipeRes.rows[0]) return null;

  const ingredientsRes = await query(
    `SELECT ri.*, i.name as ingredient_name, i.estimated_value as ingredient_price
     FROM recipe_ingredients ri
     JOIN items i ON i.id = ri.ingredient_item_id
     WHERE ri.recipe_id = $1`,
    [recipeRes.rows[0].id]
  );

  return {
    ...recipeRes.rows[0],
    ingredients: ingredientsRes.rows,
  };
}

async function getAllRecipesWithIngredients() {
  const recipesRes = await query(
    `SELECT cr.*, i.name as item_name, i.estimated_value as item_price
     FROM craft_recipes cr
     JOIN items i ON i.id = cr.item_id
     ORDER BY cr.id`
  );
  if (!recipesRes.rows.length) return [];

  const ingredientsRes = await query(
    `SELECT ri.*, i.name as ingredient_name, i.estimated_value as ingredient_price
     FROM recipe_ingredients ri
     JOIN items i ON i.id = ri.ingredient_item_id
     ORDER BY ri.recipe_id, ri.id`
  );

  const byRecipe = new Map();
  for (const ing of ingredientsRes.rows) {
    if (!byRecipe.has(ing.recipe_id)) byRecipe.set(ing.recipe_id, []);
    byRecipe.get(ing.recipe_id).push(ing);
  }

  return recipesRes.rows.map(r => ({
    ...r,
    ingredients: byRecipe.get(r.id) || [],
  }));
}

async function deleteByItemId(itemId) {
  return queryWithTransaction(async client => {
    const recipeRes = await client.query('SELECT id FROM craft_recipes WHERE item_id = $1', [itemId]);
    if (!recipeRes.rows[0]) return { deleted: false };
    const recipeId = recipeRes.rows[0].id;
    await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = $1', [recipeId]);
    await client.query('DELETE FROM craft_recipes WHERE id = $1', [recipeId]);
    return { deleted: true, recipeId };
  });
}

async function clearAll() {
  return queryWithTransaction(async client => {
    await client.query('DELETE FROM recipe_ingredients');
    await client.query('DELETE FROM craft_recipes');
    return { cleared: true };
  });
}

module.exports = {
  createRecipe,
  findByItemId,
  findByCategory,
  getAllRecipes,
  getRecipeWithIngredients,
  getAllRecipesWithIngredients,
  deleteByItemId,
  clearAll,
};
