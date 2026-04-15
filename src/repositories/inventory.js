'use strict';
const { query } = require('../db');

async function getItems(activeOnly = true) {
  const sql = activeOnly
    ? 'SELECT * FROM items WHERE active = true ORDER BY category, name'
    : 'SELECT * FROM items ORDER BY category, name';
  const res = await query(sql);
  return res.rows;
}

async function getItemById(id) {
  const res = await query('SELECT * FROM items WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function getItemByName(name) {
  const res = await query('SELECT * FROM items WHERE LOWER(name) = LOWER($1)', [name]);
  return res.rows[0] || null;
}

async function createItem({ name, category = 'outros', unit = 'unidade', estimatedValue = null, notes = '' }) {
  const res = await query(
    `INSERT INTO items (name, category, unit, estimated_value, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, category, unit, estimatedValue, notes]
  );
  return res.rows[0];
}

async function updateItem(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  values.push(id);
  const res = await query(
    `UPDATE items SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return res.rows[0] || null;
}

async function recordMovement({ movementType, itemId, quantity, memberId = null, memberRole = '', origin = '', destination = '', context = '', notes = '', operationId = null, createdBy }) {
  const res = await query(
    `INSERT INTO inventory_movements
     (movement_type, item_id, quantity, member_id, member_role, origin, destination, context, notes, operation_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [movementType, itemId, quantity, memberId, memberRole, origin, destination, context, notes, operationId, createdBy]
  );
  return res.rows[0];
}

// ── Stock balance — sinal por movement_type ─────────────────────────────────
// IMPORTANTE: saldo_inicial conta como positivo (era o bug pré-Fase 7 — o
// bootstrap inseria movimentos `saldo_inicial` mas o CASE caía no ELSE 0).
// Inclui também todas as direcções inversas explicitamente; ELSE 0 fica como
// rede de segurança para movement_types desconhecidos.
async function getStock() {
  const res = await query(`
    SELECT i.id, i.name, i.category, i.unit, i.estimated_value,
      COALESCE(SUM(
        CASE
          WHEN im.movement_type IN (
            'saldo_inicial', 'entrega_morador', 'venda_morador', 'entrega_oficial',
            'devolucao_operacao', 'apreendido', 'craftado'
          ) THEN im.quantity
          WHEN im.movement_type IN ('fornecimento_org', 'consumo_operacao', 'perda_operacao')
            THEN -im.quantity
          WHEN im.movement_type = 'ajuste_manual'
            THEN im.quantity
          ELSE 0
        END
      ), 0) as balance
    FROM items i
    LEFT JOIN inventory_movements im ON im.item_id = i.id
    WHERE i.active = true
    GROUP BY i.id, i.name, i.category, i.unit, i.estimated_value
    ORDER BY i.category, i.name
  `);
  return res.rows;
}

async function getStockForItem(itemId) {
  const res = await query(`
    SELECT COALESCE(SUM(
      CASE
        WHEN movement_type IN (
          'saldo_inicial', 'entrega_morador', 'venda_morador', 'entrega_oficial',
          'devolucao_operacao', 'apreendido', 'craftado'
        ) THEN quantity
        WHEN movement_type IN ('fornecimento_org', 'consumo_operacao', 'perda_operacao')
          THEN -quantity
        WHEN movement_type = 'ajuste_manual'
          THEN quantity
        ELSE 0
      END
    ), 0) as balance
    FROM inventory_movements WHERE item_id = $1
  `, [itemId]);
  return parseInt(res.rows[0]?.balance || 0);
}

async function getMemberMovements(memberId, limit = 50) {
  const res = await query(`
    SELECT im.*, i.name as item_name, i.category as item_category
    FROM inventory_movements im
    JOIN items i ON i.id = im.item_id
    WHERE im.member_id = $1
    ORDER BY im.created_at DESC
    LIMIT $2
  `, [memberId, limit]);
  return res.rows;
}

async function getMovementsByOperation(operationId) {
  const res = await query(`
    SELECT im.*, i.name as item_name
    FROM inventory_movements im
    JOIN items i ON i.id = im.item_id
    WHERE im.operation_id = $1
    ORDER BY im.created_at
  `, [operationId]);
  return res.rows;
}

async function getMemberTotals(memberId) {
  const res = await query(`
    SELECT movement_type, SUM(quantity) as total
    FROM inventory_movements
    WHERE member_id = $1
    GROUP BY movement_type
  `, [memberId]);
  return res.rows.reduce((acc, r) => { acc[r.movement_type] = parseInt(r.total); return acc; }, {});
}

async function getWeeklyMovements(weekStart, weekEnd) {
  // `weighted_value` aqui conta apenas QUANTIDADE (não multiplica por preço).
  // Semântica alinhada com promoções: 25k itens → O Gunão, 50k → Gangster Fodido.
  // Coluna mantém o nome por compatibilidade com weekly_rankings.weighted_value.
  const res = await query(`
    SELECT im.member_id, m.discord_id, m.display_name, m.role as member_role,
      SUM(CASE WHEN im.movement_type IN ('entrega_morador', 'entrega_oficial') THEN im.quantity ELSE 0 END) as deliveries,
      SUM(CASE WHEN im.movement_type = 'venda_morador' THEN im.quantity ELSE 0 END) as sales,
      SUM(CASE WHEN im.movement_type IN ('entrega_morador', 'venda_morador', 'entrega_oficial')
          THEN im.quantity ELSE 0 END) as weighted_value
    FROM inventory_movements im
    JOIN members m ON m.id = im.member_id
    JOIN items i ON i.id = im.item_id
    WHERE im.created_at >= $1 AND im.created_at <= $2
      AND im.movement_type IN ('entrega_morador', 'venda_morador', 'entrega_oficial')
    GROUP BY im.member_id, m.discord_id, m.display_name, m.role
    ORDER BY weighted_value DESC
  `, [weekStart, weekEnd]);
  return res.rows;
}

module.exports = {
  getItems, getItemById, getItemByName, createItem, updateItem,
  recordMovement, getStock, getStockForItem,
  getMemberMovements, getMovementsByOperation, getMemberTotals,
  getWeeklyMovements,
};
