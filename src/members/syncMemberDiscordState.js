'use strict';

const { query } = require('../db');

async function loadMember({ memberId, discordId }) {
  const where = memberId ? 'id = $1' : 'discord_id = $1';
  const value = memberId || discordId;
  const res = await query(`SELECT * FROM members WHERE ${where} ORDER BY updated_at DESC NULLS LAST LIMIT 1`, [value]);
  return res.rows[0] || null;
}

async function syncMemberDiscordState(_client, { memberId = null, discordId = null } = {}) {
  const member = await loadMember({ memberId, discordId });
  if (!member) return { ok: false, error: 'member_not_found' };
  await query('UPDATE members SET last_discord_reconciled_at = now(), updated_at = now() WHERE id = $1', [member.id]).catch(() => {});
  return { ok: true, memberId: member.id, discordId: member.discord_id, note: 'db_checked' };
}

module.exports = { syncMemberDiscordState };
