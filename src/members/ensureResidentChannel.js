'use strict';

const { ChannelType } = require('discord.js');
const CONFIG = require('../config');
const { query } = require('../db');
const { log, warn } = require('../logger');
const { formatResidentChannelName } = require('../discord/structureTemplate');
const { buildBairristaChannelOverwrites } = require('./channelInvariants');
const { createResidentChannel } = require('./createResidentChannel');
const { welcomeChannelEmbed } = require('../shared/embedBuilders');
const { buildBairristaChannelPanel } = require('../onboarding/onboardingHandlers');
const memberRepo = require('../repositories/member');

const BAIRRISTA_TIERS = new Set([
  'young_blood',
  'o_gunao',
  'gangster_fodido',
  'patrao_di_zona',
]);

function isActiveBairrista(row) {
  const role = String(row?.role || '').toLowerCase();
  const tier = String(row?.tier || '').toLowerCase();
  const state = String(row?.lifecycle_state || row?.status || 'active').toLowerCase();
  return role === 'bairrista'
    && BAIRRISTA_TIERS.has(tier)
    && !row?.deleted_at
    && ['active', 'ativo', 'promoted'].includes(state)
    && Boolean(row?.discord_id);
}

function channelNickFromMember(row) {
  if (row?.nickname) return row.nickname;
  const display = row?.display_name || row?.full_name || '';
  const m = String(display).match(/\(([^)]+)\)\s*$/);
  if (m?.[1]) return m[1];
  return display || 'sem-nome';
}

async function hasUsableResidentChannel(guild, row) {
  if (row?.channel_id) {
    const existing = await guild.channels.fetch(row.channel_id).catch(() => null);
    if (existing) return { ok: true, channel: existing, reason: 'members.channel_id' };
  }

  const rc = await query(
    `select channel_id
       from resident_channels
      where member_id = $1
        and status = 'active'
        and deleted_at is null
      order by id desc
      limit 1`,
    [row.id]
  ).catch(() => ({ rows: [] }));

  const channelId = rc.rows[0]?.channel_id;
  if (!channelId) return { ok: false };

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return { ok: false };

  if (row.channel_id !== channel.id) {
    await memberRepo.update(row.id, { channel_id: channel.id }).catch(() => {});
  }

  return { ok: true, channel, reason: 'resident_channels' };
}

async function createChannelForBairrista(guild, row, opts = {}) {
  const botId = guild.members.me?.id;
  if (!botId) throw new Error('Bot não está registado na guild.');
  if (!CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID) throw new Error('BAIRRISTA_TOPICOS_CATEGORY_ID/MEMBER_CHANNELS_CATEGORY_ID não está configurado.');

  const nickname = channelNickFromMember(row);
  const fullName = row.display_name || row.full_name || nickname;
  const tier = row.tier || 'young_blood';
  const channelName = formatResidentChannelName(tier, nickname);
  const guildMember = await guild.members.fetch(row.discord_id).catch(() => null);
  const permissionOverwrites = buildBairristaChannelOverwrites(guild, row.discord_id, botId, { ownerPresent: Boolean(guildMember) });

  const { channel, categoryId } = await createResidentChannel(guild, {
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites,
    topic: `Canal individual de ${fullName} (${nickname})`,
    reason: opts.reason || 'Criar canal individual de bairrista',
  });

  await memberRepo.update(row.id, { channel_id: channel.id });

  await query(
    `insert into resident_channels (member_id, discord_id, channel_id, channel_name, category_id, status)
     values ($1, $2, $3, $4, $5, 'active')`,
    [row.id, row.discord_id, channel.id, channelName, categoryId]
  );

  try {
    const panelRows = buildBairristaChannelPanel();
    const panelMsg = await channel.send({ embeds: [welcomeChannelEmbed(fullName)], components: panelRows });
    await panelMsg.pin().catch(() => {});
  } catch (e) {
    warn(`[RESIDENT-CHANNEL] Welcome/painel em ${channel.id} falhou (non-fatal): ${e.message}`);
  }

  log(`[RESIDENT-CHANNEL] Criado canal individual para ${fullName}#${row.id}: ${channel.id} (${channelName}) em ${categoryId}.`);
  return { created: true, channelId: channel.id, channelName, categoryId };
}

async function ensureResidentChannelForMember(guild, row, opts = {}) {
  if (!isActiveBairrista(row)) return { skipped: true, reason: 'not_active_bairrista' };

  const existing = await hasUsableResidentChannel(guild, row);
  if (existing.ok) return { skipped: true, reason: existing.reason, channelId: existing.channel.id };

  if (opts.dryRun) return { wouldCreate: true, memberId: row.id, displayName: row.display_name };

  return createChannelForBairrista(guild, row, opts);
}

async function findBairristasMissingChannels() {
  const res = await query(
    `select m.id, m.discord_id, m.username, m.display_name, m.full_name, m.nickname, m.role, m.tier,
            m.status, m.lifecycle_state, m.deleted_at, m.channel_id
       from members m
       left join resident_channels rc
         on rc.member_id = m.id
        and rc.status = 'active'
        and rc.deleted_at is null
      where m.role = 'bairrista'
        and m.tier = any($1::text[])
        and m.discord_id is not null
        and m.deleted_at is null
        and coalesce(m.lifecycle_state::text, m.status, 'active') in ('active','ativo','promoted')
        and (m.channel_id is null or rc.id is null)
      order by m.display_name asc
      limit 500`,
    [[...BAIRRISTA_TIERS]]
  );
  return res.rows;
}

async function ensureMissingBairristaChannels(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const rows = await findBairristasMissingChannels();
  const report = { scanned: rows.length, created: 0, skipped: 0, failed: 0, details: [] };

  for (const row of rows) {
    try {
      const result = await ensureResidentChannelForMember(guild, row, { dryRun, reason: opts.reason || 'Backfill canais individuais de bairristas' });
      if (result.created || result.wouldCreate) report.created += 1;
      else report.skipped += 1;
      report.details.push({ memberId: row.id, displayName: row.display_name, ...result });
    } catch (e) {
      report.failed += 1;
      report.details.push({ memberId: row.id, displayName: row.display_name, error: e.message });
      warn(`[RESIDENT-CHANNEL] Falha ao criar canal para ${row.display_name || row.id}: ${e.message}`);
    }
  }

  log(`[RESIDENT-CHANNEL] Backfill bairristas sem canal: scanned=${report.scanned} created=${report.created} skipped=${report.skipped} failed=${report.failed} dry=${dryRun}`);
  return report;
}

module.exports = {
  BAIRRISTA_TIERS,
  isActiveBairrista,
  ensureResidentChannelForMember,
  ensureMissingBairristaChannels,
  findBairristasMissingChannels,
};
