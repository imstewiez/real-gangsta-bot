'use strict';
/**
 * Materialized balance table para inventário.
 * Recalcula a partir do ledger, lê do cache, ou faz touch (delta) em hot paths.
 */

const { query } = require('../db');
const { MOVEMENT_TYPE, STOCK_INFLOW_TYPES, STOCK_OUTFLOW_TYPES } = require('../shared/movementTypes');

async function recalculateBalance(itemId, location = 'armazem') {
  const res = await query(
    `
    SELECT COALESCE(SUM(
      CASE
        WHEN movement_type = ANY($2::text[])
          THEN quantity
        WHEN movement_type = ANY($3::text[])
          THEN -quantity
        WHEN movement_type = $4 THEN quantity
        ELSE 0
      END
    ), 0)::int AS balance
    FROM inventory_movements
    WHERE item_id = $1 AND ($5::text IS NULL OR location = $5)
  `,
    [itemId, STOCK_INFLOW_TYPES, STOCK_OUTFLOW_TYPES, MOVEMENT_TYPE.AJUSTE_MANUAL, location]
  );
  const balance = res.rows[0]?.balance || 0;
  await query(
    `
    INSERT INTO inventory_balance (item_id, location, balance, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (item_id, location)
    DO UPDATE SET balance = $3, updated_at = NOW()
  `,
    [itemId, location, balance]
  );
  return balance;
}

async function getBalance(itemId, location = 'armazem') {
  const res = await query(
    'SELECT balance FROM inventory_balance WHERE item_id = $1 AND location = $2',
    [itemId, location]
  );
  if (res.rows.length) {
    return res.rows[0].balance;
  }
  return recalculateBalance(itemId, location);
}

async function touchBalance(itemId, location, delta, client = null) {
  const runner = client || { query: (sql, values) => query(sql, values) };
  const res = await runner.query(
    `
    INSERT INTO inventory_balance (item_id, location, balance, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (item_id, location)
    DO UPDATE SET balance = inventory_balance.balance + $3, updated_at = NOW()
    RETURNING balance
  `,
    [itemId, location || 'armazem', delta]
  );
  return res.rows[0]?.balance || 0;
}

module.exports = {
  recalculateBalance,
  getBalance,
  touchBalance,
};
