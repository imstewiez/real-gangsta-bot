'use strict';
/**
 * Stock Manager v3 — core: entradas, retiradas, cálculos, relatórios.
 */

const { query } = require('../../db');
const { getUnitCost } = require('./stockCatalog');

async function getBalance(itemKey) {
  const res = await query(
    `SELECT COALESCE(SUM(CASE WHEN movement_type = 'entrada' THEN quantity ELSE -quantity END), 0)::int AS balance
     FROM stock_v3_movements WHERE item_key = $1`,
    [itemKey]
  );
  return Number(res.rows[0]?.balance) || 0;
}

async function getAllBalances() {
  const res = await query(
    `SELECT item_key,
       COALESCE(SUM(CASE WHEN movement_type = 'entrada' THEN quantity ELSE 0 END), 0)::int AS entradas,
       COALESCE(SUM(CASE WHEN movement_type IN ('venda','entrega') THEN quantity ELSE 0 END), 0)::int AS saidas,
       COALESCE(SUM(CASE WHEN movement_type = 'entrada' THEN quantity ELSE -quantity END), 0)::int AS balance
     FROM stock_v3_movements
     GROUP BY item_key`
  );
  const map = new Map();
  for (const r of res.rows)
    map.set(r.item_key, { entradas: Number(r.entradas), saidas: Number(r.saidas), balance: Number(r.balance) });
  return map;
}

async function recordEntry({ itemKey, quantity, totalPrice, reason, actorTag, actorId }) {
  const unitCost = quantity > 0 ? totalPrice / quantity : 0;
  const res = await query(
    `INSERT INTO stock_v3_movements
       (item_key, movement_type, quantity, unit_cost, total_cost, reason, created_by, created_by_id)
     VALUES ($1, 'entrada', $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [itemKey, quantity, unitCost, totalPrice, reason, actorTag, actorId]
  );
  return res.rows[0];
}

async function recordSale({ itemKey, quantity, salePrice, actorTag, actorId }) {
  const unitCost = await getUnitCost(itemKey);
  const totalCost = unitCost * quantity;
  const totalSale = salePrice * quantity;
  const grossProfit = totalSale - totalCost;
  const netProfit = grossProfit; // extensível
  const res = await query(
    `INSERT INTO stock_v3_movements
       (item_key, movement_type, quantity, unit_cost, total_cost, sale_price, gross_profit, net_profit, reason, created_by, created_by_id)
     VALUES ($1, 'venda', $2, $3, $4, $5, $6, $7, 'venda', $8, $9)
     RETURNING *`,
    [itemKey, quantity, unitCost, totalCost, salePrice, grossProfit, netProfit, actorTag, actorId]
  );
  return res.rows[0];
}

async function recordGiveaway({ itemKey, quantity, recipientMemberId, reason, actorTag, actorId }) {
  const unitCost = await getUnitCost(itemKey);
  const totalCost = unitCost * quantity;
  const res = await query(
    `INSERT INTO stock_v3_movements
       (item_key, movement_type, quantity, unit_cost, total_cost, total_loss, recipient_member_id, reason, created_by, created_by_id)
     VALUES ($1, 'entrega', $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [itemKey, quantity, unitCost, totalCost, totalCost, recipientMemberId || null, reason, actorTag, actorId]
  );
  return res.rows[0];
}

async function getRecentMovements(limit = 50) {
  const res = await query(
    `SELECT * FROM stock_v3_movements
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

// ── Relatórios contabilísticos ───────────────────────────────────────────────

async function _getPeriodReport(start, end) {
  const res = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN movement_type = 'entrada' THEN total_cost ELSE 0 END), 0)::numeric AS total_entradas,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN quantity * sale_price ELSE 0 END), 0)::numeric AS total_vendas,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN gross_profit ELSE 0 END), 0)::numeric AS gross_profit,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN net_profit ELSE 0 END), 0)::numeric AS net_profit,
       COALESCE(SUM(CASE WHEN movement_type = 'entrega' THEN total_loss ELSE 0 END), 0)::numeric AS total_loss,
       COALESCE(SUM(CASE WHEN movement_type = 'entrada' THEN total_cost ELSE 0 END), 0)::numeric -
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN total_cost ELSE 0 END), 0)::numeric -
       COALESCE(SUM(CASE WHEN movement_type = 'entrega' THEN total_cost ELSE 0 END), 0)::numeric AS stock_value_change
     FROM stock_v3_movements
     WHERE created_at >= $1 AND created_at < $2`,
    [start, end]
  );
  return res.rows[0];
}

async function getWeeklyReport() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return _getPeriodReport(start.toISOString(), end.toISOString());
}

async function getMonthlyReport() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return _getPeriodReport(start.toISOString(), end.toISOString());
}

async function getDailyAverage(days = 30) {
  const res = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN quantity * sale_price ELSE 0 END), 0)::numeric AS total_vendas,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN gross_profit ELSE 0 END), 0)::numeric AS total_gross_profit,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN net_profit ELSE 0 END), 0)::numeric AS total_net_profit,
       COUNT(DISTINCT DATE(created_at)) FILTER (WHERE movement_type = 'venda') AS days_with_sales
     FROM stock_v3_movements
     WHERE created_at >= NOW() - INTERVAL '${days} days'`,
    []
  );
  const r = res.rows[0];
  const d = Number(r.days_with_sales) || 1;
  return {
    total_vendas: Number(r.total_vendas) || 0,
    total_gross_profit: Number(r.total_gross_profit) || 0,
    total_net_profit: Number(r.total_net_profit) || 0,
    days_with_sales: d,
    avg_daily_sales: (Number(r.total_vendas) || 0) / d,
    avg_daily_gross: (Number(r.total_gross_profit) || 0) / d,
    avg_daily_net: (Number(r.total_net_profit) || 0) / d,
  };
}

module.exports = {
  getBalance,
  getAllBalances,
  recordEntry,
  recordSale,
  recordGiveaway,
  getRecentMovements,
  getWeeklyReport,
  getMonthlyReport,
  getDailyAverage,
};
