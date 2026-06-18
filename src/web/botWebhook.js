'use strict';
/**
 * Webhook handler para receber eventos da web app (gangsta-bot-web).
 * Atualiza roles, nicknames e canais individuais diretamente no Discord.
 */

const CONFIG = require('../config');
const { query } = require('../db');
const { queueChannelOp } = require('../discordQueue');
const { formatResidentChannelName } = require('../discord/structureTemplate');
const { log, warn } = require('../logger');
const { sendDM } = require('../shared/dm');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');

let _client = null;

function setClient(client) {
  _client = client;
}

const TIER_TO_ROLE = {
  ballas: CONFIG.BALLAS_ROLE_ID,
  bairrista: CONFIG.BAIRRISTAS_BASE_ROLE_ID,
  manda_chuva: CONFIG.MANDA_CHUVA_ROLE_ID,
  kingpin: CONFIG.KINGPIN_ROLE_ID,
  og: CONFIG.OG_ROLE_ID,
  real_gangster: CONFIG.REAL_GANGSTER_ROLE_ID,
  patrao_di_zona: CONFIG.PATRAO_DI_ZONA_ROLE_ID,
  gangster_fodido: CONFIG.GANGSTER_FODIDO_ROLE_ID,
  o_gunao: CONFIG.O_GUNAO_ROLE_ID,
  young_blood: CONFIG.YOUNG_BLOOD_ROLE_ID,
};

const ALL_TIER_ROLES = [
  CONFIG.MANDA_CHUVA_ROLE_ID,
  CONFIG.KINGPIN_ROLE_ID,
  CONFIG.OG_ROLE_ID,
  CONFIG.REAL_GANGSTER_ROLE_ID,
  CONFIG.PATRAO_DI_ZONA_ROLE_ID,
  CONFIG.GANGSTER_FODIDO_ROLE_ID,
  CONFIG.O_GUNAO_ROLE_ID,
  CONFIG.YOUNG_BLOOD_ROLE_ID,
].filter(Boolean);

const ALL_ORG_ROLES = [
  ...ALL_TIER_ROLES,
  CONFIG.BALLAS_ROLE_ID,
  CONFIG.BAIRRISTAS_BASE_ROLE_ID,
  CONFIG.PENDENTE_ROLE_ID,
].filter(Boolean);

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

function channelNickFromDb(row) {
  if (row?.nickname) return row.nickname;
  const display = row?.display_name || row?.full_name || '';
  const m = String(display).match(/\(([^)]+)\)\s*$/);
  if (m?.[1]) return m[1];
  return display || 'sem-nome';
}

async function renameResidentChannel(discordId, toTier) {
  if (!_client || !discordId || !toTier) return { skipped: true };
  const guild = _client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) return { skipped: true, error: 'guild_not_found' };

  const res = await query(
    `select id, discord_id, channel_id, nickname, display_name, full_name, tier
       from members
      where discord_id = $1
        and deleted_at is null
      order by updated_at desc nulls last
      limit 1`,
    [discordId]
  ).catch(e => {
    warn(`[webhook] Failed to load member channel for ${discordId}: ${e.message}`);
    return { rows: [] };
  });

  const row = res.rows[0];
  if (!row?.channel_id) return { skipped: true, reason: 'no_channel_id' };

  const channel = await guild.channels.fetch(row.channel_id).catch(() => null);
  if (!channel || !channel.setName) return { skipped: true, reason: 'channel_not_found' };

  const newName = formatResidentChannelName(toTier, channelNickFromDb(row));
  if (!newName || channel.name === newName) return { skipped: true, reason: 'same_name' };

  const oldName = channel.name;
  await queueChannelOp(() => channel.setName(newName, 'Sincronizar tópico com cargo atual'));
  log(`[webhook] Renamed resident channel ${oldName} -> ${newName}`);
  return { ok: true, oldName, newName };
}

async function handlePromote(discordId, toTier) {
  const member = await resolveGuildMember(discordId);
  if (!member) return { ok: false, error: 'member_not_found' };

  const newRoleId = TIER_TO_ROLE[toTier];
  if (!newRoleId) return { ok: false, error: `unknown_tier: ${toTier}` };

  const currentRoleIds = member.roles.cache.map(r => r.id);
  const newRoleIds = currentRoleIds.filter(id => !ALL_TIER_ROLES.includes(id));
  if (!newRoleIds.includes(newRoleId)) newRoleIds.push(newRoleId);

  const isOperationalTier = !['ballas', 'bairrista'].includes(toTier);
  if (isOperationalTier && CONFIG.BAIRRISTAS_BASE_ROLE_ID && !newRoleIds.includes(CONFIG.BAIRRISTAS_BASE_ROLE_ID)) {
    newRoleIds.push(CONFIG.BAIRRISTAS_BASE_ROLE_ID);
  }

  await member.roles.set(newRoleIds, 'Alteração de cargo via webapp');
  if (isOperationalTier) {
    await renameResidentChannel(discordId, toTier).catch(e => warn(`[webhook] Failed to rename resident channel for ${discordId}: ${e.message}`));
  }

  log(`[webhook] Changed ${member.user.tag} to ${toTier} (role ${newRoleId})`);
  return { ok: true };
}

async function handleDemote(discordId, toTier) {
  return handlePromote(discordId, toTier);
}

async function handleRename(discordId, newName) {
  const member = await resolveGuildMember(discordId);
  if (!member) return { ok: false, error: 'member_not_found' };

  await member.setNickname(newName, 'Rename via webapp');
  log(`[webhook] Renamed ${member.user.tag} to ${newName}`);
  return { ok: true };
}

async function handleKick(discordId, reason) {
  const member = await resolveGuildMember(discordId);
  if (!member) return { ok: false, error: 'member_not_found' };

  try {
    const remainingRoleIds = member.roles.cache.map(r => r.id).filter(id => !ALL_ORG_ROLES.includes(id));
    await member.roles.set(remainingRoleIds, 'Kick via webapp: remover cargos da organização');
  } catch (e) {
    warn(`[webhook] Failed to strip org roles before kick for ${discordId}: ${e.message}`);
  }

  await member.kick(reason || 'Kick via webapp');
  log(`[webhook] Kicked ${member.user.tag}`);
  return { ok: true };
}

async function handlePrizeDefined(discordId, { week_start, prize_type, prize_description }) {
  if (!_client) return { ok: false, error: 'client_not_set' };
  try {
    const user = await _client.users.fetch(discordId).catch(() => null);
    if (!user) return { ok: false, error: 'user_not_found' };
    const embed = brandEmbed('HOUSE')
      .setColor(COLOR.GOLD)
      .setTitle('🏆 Prémio Definido!')
      .setDescription(`O teu prémio da semana **${week_start}** foi definido.`)
      .addFields(
        { name: 'Tipo', value: prize_type || '—', inline: true },
        { name: 'Descrição', value: prize_description || '—', inline: true }
      )
      .setFooter({ text: 'Parabéns! 🎉' });
    await sendDM(user, { embeds: [embed] });
    log(`[webhook] Prize defined DM sent to ${discordId}`);
    return { ok: true };
  } catch (e) {
    warn(`[webhook] Failed to send prize DM to ${discordId}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

async function handlePrizeDelivered(discordId, { week_start, prize_type, prize_description }) {
  if (!_client) return { ok: false, error: 'client_not_set' };
  try {
    const user = await _client.users.fetch(discordId).catch(() => null);
    if (!user) return { ok: false, error: 'user_not_found' };
    const embed = brandEmbed('HOUSE')
      .setColor(COLOR.SUCCESS)
      .setTitle('🎁 Prémio Entregue!')
      .setDescription(`O teu prémio da semana **${week_start}** foi marcado como entregue.`)
      .addFields(
        { name: 'Tipo', value: prize_type || '—', inline: true },
        { name: 'Descrição', value: prize_description || '—', inline: true }
      )
      .setFooter({ text: 'Obrigado pela dedicação! 💪' });
    await sendDM(user, { embeds: [embed] });
    log(`[webhook] Prize delivered DM sent to ${discordId}`);
    return { ok: true };
  } catch (e) {
    warn(`[webhook] Failed to send prize DM to ${discordId}: ${e.message}`);
    return { ok: false, error: e.message };
  }
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
    case 'prize_defined':
      return handlePrizeDefined(discord_id, body);
    case 'prize_delivered':
      return handlePrizeDelivered(discord_id, body);
    default:
      return { ok: false, error: `unknown_action: ${action}` };
  }
}

module.exports = { setClient, processEvent, renameResidentChannel };
