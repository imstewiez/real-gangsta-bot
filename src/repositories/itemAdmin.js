'use strict';
/**
 * Item administration repository — flags, price history, CRUD.
 */

const { query, queryWithTransaction } = require('../db');
const { guardColumns } = require('../shared/sqlColumnGuard');
const { NotFoundError } = require('../shared/errors');

async function listAll({ active, orderable, category } = {}) {
  const conditions = ['1=1'];
  const params = [];
  if (active !== undefined) {
    conditions.push(`active = $${params.length + 1}`);
    params.push(active);
  }
  if (orderable !== undefined) {
    conditions.push(`orderable = $${params.length + 1}`);
    params.push(orderable);
  }
  if (category) {
    conditions.push(`category = $${params.length + 1}`);
    params.push(category);
  }
  const res = await query(`SELECT * FROM items WHERE ${conditions.join(' AND ')} ORDER BY category, name`, params);
  return res.rows;
}

async function findById(id) {
  const res = await query('SELECT * FROM items WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function create({
  name,
  category,
  unit,
  estimatedValue,
  orderable,
  countsForStock,
  countsForRankings,
  purchasePrice,
  minSalePrice,
  maxSalePrice,
  targetStock,
  supplier,
  _createdBy,
}) {
  const res = await query(
    `INSERT INTO items (name, category, unit, estimated_value, active, orderable, counts_for_stock, counts_for_rankings, purchase_price, min_sale_price, max_sale_price, target_stock, supplier)
     VALUES ($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      name,
      category,
      unit,
      estimatedValue,
      orderable,
      countsForStock,
      countsForRankings,
      purchasePrice,
      minSalePrice,
      maxSalePrice,
      targetStock,
      supplier,
    ]
  );
  return res.rows[0];
}

async function update(id, fields, changedBy) {
  return queryWithTransaction(async client => {
    const current = await client.query('SELECT * FROM items WHERE id = $1', [id]);
    if (!current.rows.length) throw new NotFoundError('Item não encontrado.', { code: 'ITEM_NOT_FOUND' });
    const old = current.rows[0];

    const ALLOWED = new Set([
      'name',
      'category',
      'unit',
      'estimated_value',
      'active',
      'orderable',
      'counts_for_stock',
      'counts_for_rankings',
      'purchase_price',
      'min_sale_price',
      'max_sale_price',
      'target_stock',
      'supplier',
      'notes',
    ]);
    const safe = guardColumns(fields, ALLOWED);

    const trackedFields = [
      'estimated_value',
      'purchase_price',
      'min_sale_price',
      'max_sale_price',
      'target_stock',
      'orderable',
      'counts_for_stock',
      'counts_for_rankings',
    ];
    for (const f of trackedFields) {
      if (safe[f] !== undefined && String(old[f]) !== String(safe[f])) {
        await client.query(
          `INSERT INTO item_price_history (item_id, field_changed, old_value, new_value, changed_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, f, String(old[f]), String(safe[f]), changedBy]
        );
      }
    }

    const setParts = [];
    const params = [];
    Object.entries(safe).forEach(([k, v]) => {
      if (v !== undefined) {
        setParts.push(`${k} = $${params.length + 1}`);
        params.push(v);
      }
    });
    if (!setParts.length) return old;
    params.push(id);
    const res = await client.query(
      `UPDATE items SET ${setParts.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    return res.rows[0];
  });
}

async function toggleActive(id, active) {
  const res = await query('UPDATE items SET active = $1 WHERE id = $2 RETURNING *', [active, id]);
  return res.rows[0];
}

async function getPriceHistory(itemId, { limit = 20 } = {}) {
  const res = await query('SELECT * FROM item_price_history WHERE item_id = $1 ORDER BY changed_at DESC LIMIT $2', [
    itemId,
    limit,
  ]);
  return res.rows;
}

module.exports = { listAll, findById, create, update, toggleActive, getPriceHistory };
