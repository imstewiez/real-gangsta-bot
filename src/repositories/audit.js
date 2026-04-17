'use strict';
const { query } = require('../db');

async function log({ action, entityType, entityId, actorId, actorName, beforeState, afterState, context }) {
  const res = await query(
    `INSERT INTO audit_logs (action, entity_type, entity_id, actor_id, actor_name, before_state, after_state, context)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      action,
      entityType,
      entityId || '',
      actorId,
      actorName || '',
      beforeState ? JSON.stringify(beforeState) : null,
      afterState ? JSON.stringify(afterState) : null,
      context || '',
    ]
  );
  return res.rows[0];
}

async function getRecent(limit = 50, filters = {}) {
  let sql = 'SELECT * FROM audit_logs';
  const conditions = [];
  const params = [];
  let i = 1;

  if (filters.entityType) {
    conditions.push(`entity_type = $${i++}`);
    params.push(filters.entityType);
  }
  if (filters.actorId) {
    conditions.push(`actor_id = $${i++}`);
    params.push(filters.actorId);
  }
  if (filters.action) {
    conditions.push(`action = $${i++}`);
    params.push(filters.action);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ` ORDER BY created_at DESC LIMIT $${i}`;
  params.push(limit);

  const res = await query(sql, params);
  return res.rows;
}

module.exports = { log, getRecent };
