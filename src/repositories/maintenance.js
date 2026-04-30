'use strict';
const { query } = require('../db');

async function isActive() {
  const res = await query('SELECT active, reason FROM maintenance_mode WHERE id = 1');
  return res.rows[0] || { active: false, reason: '' };
}

async function setActive(active, reason, startedBy) {
  const res = await query(
    `UPDATE maintenance_mode SET active = $1, reason = $2, started_by = $3,
     started_at = CASE WHEN $1 THEN NOW() ELSE started_at END,
     ended_at = CASE WHEN NOT $1 THEN NOW() ELSE ended_at END
     WHERE id = 1 RETURNING *`,
    [active, reason || '', startedBy]
  );
  return res.rows[0];
}

module.exports = { isActive, setActive };
