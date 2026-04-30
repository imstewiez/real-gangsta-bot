'use strict';
const { query } = require('../db');

async function create({ title, description, severity, source, createdBy }) {
  const res = await query(
    `INSERT INTO incidents (title, description, severity, source, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [title, description, severity, source, createdBy]
  );
  return res.rows[0];
}

async function list({ status, limit = 20 } = {}) {
  const params = [];
  let sql = 'SELECT * FROM incidents';
  if (status) {
    sql += ' WHERE status = $1';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit);
  const res = await query(sql, params);
  return res.rows;
}

async function updateStatus(id, status, resolvedBy) {
  const res = await query(
    `UPDATE incidents SET status = $1, resolved_by = $2, resolved_at = CASE WHEN $1 IN ('resolved','ignored') THEN NOW() ELSE resolved_at END
     WHERE id = $3 RETURNING *`,
    [status, resolvedBy, id]
  );
  return res.rows[0];
}

async function findById(id) {
  const res = await query('SELECT * FROM incidents WHERE id = $1', [id]);
  return res.rows[0] || null;
}

module.exports = { create, list, updateStatus, findById };
