'use strict';
/**
 * Repository de encomendas (orders).
 *
 * Centraliza todo o acesso à tabela `orders` e `order_status_history`.
 * Antes este acesso era feito via raw SQL em handlers — agora temos
 * transações, validação e auditoria centralizada.
 */

const { query, queryWithTransaction } = require('../db');
const eventBus = require('../core/eventBus');
const { warn } = require('../logger');

async function create({
  memberId,
  itemId,
  quantity,
  unitPrice,
  totalPrice,
  notes = '',
  paymentMode = 'materials_money',
  materialCost = null,
  moneyCost = null,
  ingredientsJson = null,
}) {
  const res = await query(
    `INSERT INTO orders (member_id, item_id, quantity, unit_price, total_price, status, notes, payment_mode, material_cost, money_cost, ingredients_json)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10)
     RETURNING *`,
    [memberId, itemId, quantity, unitPrice, totalPrice, notes, paymentMode, materialCost, moneyCost, ingredientsJson]
  );
  return res.rows[0];
}

async function findById(id) {
  const res = await query(
    `SELECT o.*, i.name AS item_name, i.category, m.display_name AS member_name, m.discord_id AS member_discord_id
     FROM orders o
     JOIN items i ON i.id = o.item_id
     JOIN members m ON m.id = o.member_id
     WHERE o.id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function findByMember(memberId, { limit = 20, status = null } = {}) {
  let sql = `
    SELECT o.*, i.name AS item_name, i.category, i.estimated_value
    FROM orders o
    JOIN items i ON i.id = o.item_id
    WHERE o.member_id = $1`;
  const params = [memberId];
  if (status) {
    sql += ' AND o.status = $2';
    params.push(status);
  }
  sql += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  const res = await query(sql, params);
  return res.rows;
}

async function findByStatus(status, { limit = 50 } = {}) {
  const res = await query(
    `SELECT o.*, i.name AS item_name, m.display_name AS member_name, m.discord_id AS member_discord_id
     FROM orders o
     JOIN items i ON i.id = o.item_id
     JOIN members m ON m.id = o.member_id
     WHERE o.status = $1
     ORDER BY o.created_at DESC
     LIMIT $2`,
    [status, limit]
  );
  return res.rows;
}

const STATUS_META_COLS = {
  approved: { col: 'approved_by', resolved: true },
  fulfilled: { col: 'fulfilled_by', resolved: true },
  denied: { resolved: true },
  cancelled: { col: 'cancelled_by', resolved: true },
};

async function updateStatus(id, { status, actorDiscordId, notes = null }) {
  return queryWithTransaction(async client => {
    const current = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) throw new Error('Encomenda não encontrada.');
    const oldStatus = current.rows[0].status;

    const meta = STATUS_META_COLS[status] || {};
    const setParts = ['status = $1', 'updated_at = NOW()', 'updated_by = $2'];
    const params = [status, actorDiscordId, id];

    if (meta.col) {
      setParts.push(`${meta.col} = $2`);
      if (meta.col === 'cancelled_by') setParts.push('cancelled_at = NOW()');
    }
    if (meta.resolved) {
      setParts.push('resolved_at = NOW()');
    }

    await client.query(`UPDATE orders SET ${setParts.join(', ')} WHERE id = $3`, params);

    await client.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, oldStatus, status, actorDiscordId, notes]
    );

    // Fetch enriched order with item_name and member details
    const enrichedRes = await client.query(
      `SELECT o.*, i.name AS item_name, i.category, m.display_name AS member_name, m.discord_id AS member_discord_id
       FROM orders o
       JOIN items i ON i.id = o.item_id
       JOIN members m ON m.id = o.member_id
       WHERE o.id = $1`,
      [id]
    );
    const order = enrichedRes.rows[0];

    const eventName = `order.${status}`;
    eventBus
      .emitAsync(eventName, {
        orderId: id,
        oldStatus,
        newStatus: status,
        memberId: order.member_id,
        memberDiscordId: order.member_discord_id,
        itemId: order.item_id,
        itemName: order.item_name,
        quantity: order.quantity,
        totalPrice: order.total_price,
        actorDiscordId,
        notes,
        createdAt: order.created_at,
        at: new Date(),
      })
      .catch(e => warn(`[EVENT] ${eventName}: ${e.message}`));

    return order;
  });
}

async function addNote(id, note, actorDiscordId) {
  const res = await query(
    `UPDATE orders SET notes = COALESCE(notes, '') || E'\n' || $1, updated_at = NOW(), updated_by = $2
     WHERE id = $3 RETURNING *`,
    [note, actorDiscordId, id]
  );
  return res.rows[0] || null;
}

async function getStatusHistory(orderId) {
  const res = await query('SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at DESC', [orderId]);
  return res.rows;
}

module.exports = {
  create,
  findById,
  findByMember,
  findByStatus,
  updateStatus,
  addNote,
  getStatusHistory,
};
