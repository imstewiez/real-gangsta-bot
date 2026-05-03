'use strict';
/**
 * Queries do Stock v3 para Google Sheets.
 */

const { query } = require('../../db');

async function getStockV3Balances() {
  const res = await query(
    `SELECT
       item_key,
       COALESCE(SUM(CASE WHEN movement_type = 'entrada' THEN quantity ELSE -quantity END), 0)::int AS balance,
       COALESCE(SUM(CASE WHEN movement_type = 'entrada' THEN total_cost ELSE 0 END), 0)::numeric AS total_invested
     FROM stock_v3_movements
     GROUP BY item_key`
  );
  return res.rows;
}

async function getStockV3Movements(limit = 50) {
  const res = await query(
    `SELECT
       m.id, m.item_key, m.movement_type, m.quantity, m.unit_cost, m.total_cost,
       m.sale_price, m.gross_profit, m.net_profit, m.total_loss,
       m.reason, m.created_by, m.created_at
     FROM stock_v3_movements m
     ORDER BY m.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function getStockV3WeeklyReport() {
  const res = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN movement_type = 'entrada' THEN total_cost ELSE 0 END), 0)::numeric AS total_entradas,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN quantity * sale_price ELSE 0 END), 0)::numeric AS total_vendas,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN gross_profit ELSE 0 END), 0)::numeric AS gross_profit,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN net_profit ELSE 0 END), 0)::numeric AS net_profit,
       COALESCE(SUM(CASE WHEN movement_type = 'entrega' THEN total_loss ELSE 0 END), 0)::numeric AS total_loss
     FROM stock_v3_movements
     WHERE created_at >= date_trunc('week', NOW())`
  );
  return res.rows[0];
}

async function getStockV3MonthlyReport() {
  const res = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN movement_type = 'entrada' THEN total_cost ELSE 0 END), 0)::numeric AS total_entradas,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN quantity * sale_price ELSE 0 END), 0)::numeric AS total_vendas,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN gross_profit ELSE 0 END), 0)::numeric AS gross_profit,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN net_profit ELSE 0 END), 0)::numeric AS net_profit,
       COALESCE(SUM(CASE WHEN movement_type = 'entrega' THEN total_loss ELSE 0 END), 0)::numeric AS total_loss
     FROM stock_v3_movements
     WHERE created_at >= date_trunc('month', NOW())`
  );
  return res.rows[0];
}

async function getStockV3DailyAverage(days = 30) {
  const res = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN quantity * sale_price ELSE 0 END), 0)::numeric AS total_vendas,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN gross_profit ELSE 0 END), 0)::numeric AS total_gross_profit,
       COALESCE(SUM(CASE WHEN movement_type = 'venda' THEN net_profit ELSE 0 END), 0)::numeric AS total_net_profit,
       COUNT(DISTINCT DATE(created_at)) FILTER (WHERE movement_type = 'venda') AS days_with_sales
     FROM stock_v3_movements
     WHERE created_at >= NOW() - INTERVAL '${days} days'`
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
  getStockV3Balances,
  getStockV3Movements,
  getStockV3WeeklyReport,
  getStockV3MonthlyReport,
  getStockV3DailyAverage,
};
