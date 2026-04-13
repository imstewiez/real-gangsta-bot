'use strict';
const { memberRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');

async function getOrCreateMember(discordId, username, displayName) {
  let member = await memberRepo.findByDiscordId(discordId);
  if (!member) {
    member = await memberRepo.create({ discordId, username, displayName });
  }
  return member;
}

async function updateMemberRole(memberId, newRole, changedBy, reason = '') {
  const member = await memberRepo.findById(memberId);
  if (!member) return null;

  const updated = await memberRepo.promote(memberId, newRole, changedBy, reason);

  await logAudit({
    action: 'member_role_changed',
    entityType: 'member',
    entityId: member.discord_id,
    actorId: changedBy,
    beforeState: { role: member.role },
    afterState: { role: newRole },
    context: reason,
  });

  return updated;
}

async function deactivateMember(memberId, changedBy, reason = '') {
  const updated = await memberRepo.update(memberId, { status: 'inativo' });

  await logAudit({
    action: 'member_deactivated',
    entityType: 'member',
    entityId: updated?.discord_id || String(memberId),
    actorId: changedBy,
    afterState: { status: 'inativo' },
    context: reason,
  });

  return updated;
}

module.exports = { getOrCreateMember, updateMemberRole, deactivateMember };
