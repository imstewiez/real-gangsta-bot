'use strict';

const { query } = require('../db');
const { processEvent } = require('../web/botWebhook');

async function loadMember({ memberId, discordId }) {
  const where = memberId ? 'id = $1' : 'discord_id = $1';
  const value = memberId || discordId;
  const res = await query(`SELECT * FROM members WHERE ${where} ORDER BY updated_at DESC NULLS LAST LIMIT 1`, [value]);
  return res.rows[0] || null;
}

function tierOf(member) {
  return String(member?.tier || member?.role || '').toLowerCase().trim();
}

async function syncMemberDiscordState(_client, { memberId = null, discordId = null } = {}) {
  const member = await loadMember({ memberId, discordId });
  if (!member) return { ok: false, error: 'member_not_found' };
  if (!member.discord_id) return { ok: false, error: 'discord_id_missing', memberId: member.id };

  const result = await processEvent({ action: 'promote', discord_id: member.discord_id, to_tier: tierOf(member) });
  const nickname = member.display_name || (member.full_name && member.nickname ? `${member.full_name} (${member.nickname})` : null);
  if (result?.ok && nickname) {
    await processEvent({ action: 'rename', discord_id: member.discord_id, new_name: nickname });
  }

  await query('UPDATE members SET last_discord_reconciled_at = now(), updated_at = now() WHERE id = $1', [member.id]).catch(() => {});
  return { ...result, memberId: member.id, discordId: member.discord_id };
}

module.exports = { syncMemberDiscordState };
