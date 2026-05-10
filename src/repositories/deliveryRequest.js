'use strict';
const { query } = require('../db');
const { assertArray, assertJsonSchema } = require('../shared/validators');

async function create({
  id,
  requesterMemberId,
  requesterDiscordId,
  approverDiscordId,
  lines,
  notes = '',
  tipo = 'entrega',
  totalQty,
  totalValue,
  createdBy,
}) {
  assertArray('deliveryRequest.lines', lines);
  for (const line of lines)
    assertJsonSchema('deliveryRequest.line', line, { item_id: 'number', quantity: 'number', unit_price: 'number' });
  const res = await query(
    `INSERT INTO inventory_delivery_requests
     (id, requester_member_id, requester_discord_id, approver_discord_id,
      lines, notes, tipo, total_qty, total_value, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id,
      requesterMemberId,
      requesterDiscordId,
      approverDiscordId,
      JSON.stringify(lines),
      notes,
      tipo,
      totalQty,
      totalValue,
      createdBy,
    ]
  );
  return res.rows[0];
}

async function findById(id, { client = null } = {}) {
  const runner = client || { query: (sql, values) => query(sql, values) };
  const res = await runner.query('SELECT * FROM inventory_delivery_requests WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function findPendingByIdForUpdate(id, client) {
  const res = await client.query(
    `SELECT * FROM inventory_delivery_requests
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  return res.rows[0] || null;
}

async function markDecision(
  id,
  { status, decisionBy, decisionReason = '', movementSubmissionId = null },
  { client = null } = {}
) {
  const runner = client || { query: (sql, values) => query(sql, values) };
  const res = await runner.query(
    `UPDATE inventory_delivery_requests
        SET status = $2,
            decision_by = $3,
            decision_reason = $4,
            movement_submission_id = $5,
            decided_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, status, decisionBy, decisionReason, movementSubmissionId]
  );
  return res.rows[0] || null;
}

module.exports = {
  create,
  findById,
  findPendingByIdForUpdate,
  markDecision,
};
