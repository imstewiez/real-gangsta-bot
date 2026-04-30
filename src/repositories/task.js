'use strict';
const { query } = require('../db');

async function create({ title, description, type, targetMemberId, assignedBy, dueAt }) {
  const res = await query(
    `INSERT INTO tasks (title, description, type, target_member_id, assigned_by, due_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [title, description, type, targetMemberId, assignedBy, dueAt]
  );
  return res.rows[0];
}

async function list({ memberId, status, limit = 20 } = {}) {
  const params = [];
  let sql = 'SELECT t.*, m.display_name FROM tasks t JOIN members m ON m.id = t.target_member_id WHERE 1=1';
  if (memberId) {
    params.push(memberId);
    sql += ` AND t.target_member_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND t.status = $${params.length}`;
  }
  sql += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  const res = await query(sql, params);
  return res.rows;
}

async function updateStatus(id, status) {
  const res = await query(
    `UPDATE tasks SET status = $1, completed_at = CASE WHEN $1 IN ('completed','failed') THEN NOW() ELSE completed_at END, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return res.rows[0];
}

module.exports = { create, list, updateStatus };
