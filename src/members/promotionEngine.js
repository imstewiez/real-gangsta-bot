'use strict';
const { memberRepo } = require('../repositories');
const { handlePromotionToOficial } = require('../onboarding/onboardingEngine');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');
const { log } = require('../logger');

async function promoteToOficial(guildMember, client, promotedBy) {
  const discordId = guildMember.id;
  const dbMember = await memberRepo.findByDiscordId(discordId);
  if (!dbMember) return null;

  if (dbMember.role === 'oficial') return dbMember;

  await handlePromotionToOficial(guildMember, client);
  return await memberRepo.findByDiscordId(discordId);
}

module.exports = { promoteToOficial };
