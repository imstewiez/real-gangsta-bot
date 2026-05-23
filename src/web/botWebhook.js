'use strict';
/**
 * Webhook handler para receber eventos da web app (gangsta-bot-web).
 * Atualiza roles, nicknames e kicks diretamente no Discord.
 */

const CONFIG = require('../config');
const { log, warn, error } = require('../logger');

let _client = null;

function setClient(client) {
  _client = client;
}

const TIER_TO_ROLE = {
  manda_chuva: CONFIG.MANDA_CHUVA_ROLE_ID,
  kingpin: CONFIG.KINGPIN_ROLE_ID,
  og: CONFIG.OG_ROLE_ID,
  real_gangster: CONFIG.REAL_GANGSTER_ROLE_ID,
  patrao_di_zona: CONFIG.PATRAO_DI_ZONA_ROLE_ID,
  gangster_fodido: CONFIG.GANGSTER_FODIDO_ROLE_ID,
  o_gunao: CONFIG.O_GUNAO_ROLE_ID,
  young_blood: CONFIG.YOUNG_BLOOD_ROLE_ID,
};

const ALL_TIER_ROLES = Object.values(TIER_TO_ROLE).filter(Boolean);

async function resolveGuildMember(discordId) {
  if (!_client) return null;
  const guild = _client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) {
    warn('[webhook] Guild not found:', CONFIG.DISCORD_GUILD_ID);
    return null;
  }
  try {
    return await guild.members.fetch(discordId);
  } catch (e) {
    warn('[webhook] Member not found in guild:', discordId, e.message);
    return null;
  }
}

async function handlePromote(discordId, toTier) {
  const member = await resolveGuildMember(discordId);
  if (!member) return { ok: false, error: 'member_not_found' };

  const newRoleId = TIER_TO_ROLE[toTier];
  if (!newRoleId) {
    return { ok: false, error: `unknown_tier: ${toTier}` };
  }

  // Swap roles in a single operation to avoid intermediate states
  // that trigger the bot's own role-change listener multiple times.
  const currentRoleIds = member.roles.cache.map(r => r.id);
  const newRoleIds = currentRoleIds.filter(id => !ALL_TIER_ROLES.includes(id));
  newRoleIds.push(newRoleId);
  await member.roles.set(newRoleIds, 'Promoção via web app');

  log(`[webhook] Promoted ${member.user.tag} to ${toTier} (role ${newRoleId})`);
  return { ok: true };
}

async function handleDemote(discordId, toTier) {
  // Same logic as promote — roles are swapped
  return handlePromote(discordId, toTier);
}

async function handleRename(discordId, newName) {
  const member = await resolveGuildMember(discordId);
  if (!member) return { ok: false, error: 'member_not_found' };

  await member.setNickname(newName, 'Rename via web app');
  log(`[webhook] Renamed ${member.user.tag} to ${newName}`);
  return { ok: true };
}

async function handleKick(discordId, reason) {
  const member = await resolveGuildMember(discordId);
  if (!member) return { ok: false, error: 'member_not_found' };

  await member.kick(reason || 'Kick via web app');
  log(`[webhook] Kicked ${member.user.tag}`);
  return { ok: true };
}

async function processEvent(body) {
  const { action, discord_id, to_tier, new_name, reason } = body;

  switch (action) {
    case 'promote':
      return handlePromote(discord_id, to_tier);
    case 'demote':
      return handleDemote(discord_id, to_tier);
    case 'rename':
      return handleRename(discord_id, new_name);
    case 'kick':
      return handleKick(discord_id, reason);
    default:
      return { ok: false, error: `unknown_action: ${action}` };
  }
}

module.exports = { setClient, processEvent };
