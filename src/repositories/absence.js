'use strict';
const { query } = require('../db');

async function create({ memberId, startDate, endDate, reason }) {
  const res = await query(
    `INSERT INTO member_absences (member_id, start_date, end_date, reason)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [memberId, startDate, endDate, reason]
  );
  return res.rows[0];
}

async function list({ memberId, status } = {}) {
  const params = [];
  let sql = 'SELECT a.*, m.display_name FROM member_absences a JOIN members m ON m.id = a.member_id WHERE 1=1';
  if (memberId) {
    params.push(memberId);
    sql += ` AND a.member_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND a.status = $${params.length}`;
  }
  sql += ' ORDER BY a.start_date DESC';
  const res = await query(sql, params);
  return res.rows;
}

async function updateStatus(id, status, approvedBy) {
  const res = await query(`UPDATE member_absences SET status = $1, approved_by = $2 WHERE id = $3 RETURNING *`, [
    status,
    approvedBy,
    id,
  ]);
  return res.rows[0];
}

module.exports = { create, list, updateStatus };
