'use strict';
/**
 * Repositório de preços de custo do Stock v3.
 * Tabela: stock_v3_pricing
 */

const { query } = require('../../db');

async function getPricing(itemKey) {
  const res = await query('SELECT * FROM stock_v3_pricing WHERE item_key = $1', [itemKey]);
  return res.rows[0] || null;
}

async function getAllPricing() {
  const res = await query('SELECT * FROM stock_v3_pricing ORDER BY item_key');
  return res.rows;
}

async function setPricing(itemKey, unitCost, updatedBy) {
  const res = await query(
    `INSERT INTO stock_v3_pricing (item_key, unit_cost, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (item_key) DO UPDATE SET
       unit_cost = EXCLUDED.unit_cost,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [itemKey, unitCost, updatedBy]
  );
  return res.rows[0];
}

module.exports = {
  getPricing,
  getAllPricing,
  setPricing,
};
