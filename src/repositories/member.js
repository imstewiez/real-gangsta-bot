'use strict';
const { query, queryWithTransaction } = require('../db');
const { guardColumns } = require('../shared/sqlColumnGuard');

async function findByDiscordId(discordId) {
  const res = await query('SELECT * FROM members WHERE discord_id = $1', [discordId]);
  return res.rows[0] || null;
}

async function findById(id) {
  const res = await query('SELECT * FROM members WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function findAll(status = 'ativo') {
  const res = await query('SELECT * FROM members WHERE status = $1 ORDER BY display_name', [status]);
  return res.rows;
}

async function findAllNonDeleted() {
  const res = await query('SELECT * FROM members WHERE deleted_at IS NULL ORDER BY display_name');
  return res.rows;
}

async function findByRole(role) {
  const res = await query('SELECT * FROM members WHERE role = $1 AND status = $2 ORDER BY display_name', [
    role,
    'ativo',
  ]);
  return res.rows;
}

async function create({ discordId, username, displayName, role = 'bairrista', channelId = null }) {
  const res = await query(
    `INSERT INTO members (discord_id, username, display_name, role, channel_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [discordId, username, displayName, role, channelId]
  );
  return res.rows[0];
}

async function update(id, fields) {
  const ALLOWED = new Set([
    'discord_id',
    'username',
    'display_name',
    'role',
    'channel_id',
    'status',
    'tier',
    'notes',
    'nickname',
    'lifecycle_state',
    'lifecycle_changed_at',
    'lifecycle_changed_by',
    'lifecycle_notes',
    'deleted_at',
    'updated_at',
  ]);
  const safe = guardColumns(fields, ALLOWED);
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(safe)) {
    if (key === 'updated_at') continue;
    sets.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  sets.push('updated_at = NOW()');
  values.push(id);
  const res = await query(`UPDATE members SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, values);
  return res.rows[0] || null;
}

async function _recordRoleChange(id, newRole, changedBy, reason = '') {
  return queryWithTransaction(async client => {
    const current = await client.query('SELECT * FROM members WHERE id = $1', [id]);
    const member = current.rows[0];
    if (!member) return null;

    await client.query(
      `INSERT INTO member_role_history (member_id, old_role, new_role, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, member.role, newRole, changedBy, reason]
    );

    const shouldReactivate = member.status === 'inativo' && newRole !== 'inativo';
    const shouldDeactivate = newRole === 'inativo';
    const statusSet = shouldReactivate
      ? "status = 'ativo', deleted_at = NULL, lifecycle_state = 'active', lifecycle_changed_at = NOW(), lifecycle_changed_by = $3, lifecycle_notes = $4,"
      : shouldDeactivate
        ? "status = 'inativo', deleted_at = NOW(), lifecycle_state = 'removed', lifecycle_changed_at = NOW(), lifecycle_changed_by = $3, lifecycle_notes = $4,"
        : '';

    const result = await client.query(
      `UPDATE members SET role = $1, ${statusSet} updated_at = NOW() WHERE id = $2 RETURNING *`,
      statusSet ? [newRole, id, changedBy, reason || ''] : [newRole, id]
    );
    return result.rows[0];
  });
}

async function promote(id, newRole, changedBy, reason = '') {
  return _recordRoleChange(id, newRole, changedBy, reason);
}

async function demote(id, newRole, changedBy, reason = '') {
  return _recordRoleChange(id, newRole, changedBy, reason);
}

async function countByRole() {
  const res = await query("SELECT role, COUNT(*) as count FROM members WHERE status = 'ativo' GROUP BY role");
  return res.rows.reduce((acc, r) => {
    acc[r.role] = parseInt(r.count);
    return acc;
  }, {});
}

async function search(term) {
  const res = await query(
    `SELECT * FROM members WHERE status = 'ativo'
     AND (display_name ILIKE $1 OR username ILIKE $1)
     ORDER BY display_name LIMIT 25`,
    [`%${term}%`]
  );
  return res.rows;
}

module.exports = {
  findByDiscordId,
  findById,
  findAll,
  findAllNonDeleted,
  findByRole,
  create,
  update,
  promote,
  demote,
  countByRole,
  search,
};
