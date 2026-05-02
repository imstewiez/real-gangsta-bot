'use strict';
const { ChannelType } = require('discord.js');
const { query } = require('../db');
// CONFIG no longer needed — all config accessed via callers or defaults
const { log, warn } = require('../logger');
const { formatResidentChannelName } = require('../discord/structureTemplate');
const { buildBairristaChannelOverwrites } = require('../members/channelInvariants');
const { createResidentChannel } = require('../members/createResidentChannel');
const { buildBairristaChannelPanel } = require('../onboarding/onboardingHandlers');
const { welcomeChannelEmbed } = require('../shared/embedBuilders');
const memberRepo = require('../repositories/member');

async function _findMissing() {
  const res = await query(
    `SELECT m.id, m.discord_id, m.display_name, m.nickname, m.tier
       FROM members m
       LEFT JOIN resident_channels rc
         ON rc.member_id = m.id
        AND rc.status IN ('active', 'archived')
      WHERE m.role = 'bairrista'
        AND m.status = 'ativo'
        AND m.deleted_at IS NULL
        AND rc.id IS NULL
      ORDER BY m.display_name ASC`
  );
  return res.rows;
}

async function _createOne(guild, botId, dbMember) {
  const nickname = dbMember.nickname || dbMember.display_name;
  const fullName = dbMember.display_name;
  const channelName = formatResidentChannelName(dbMember.tier || 'young_blood', nickname);

  const permissionOverwrites = buildBairristaChannelOverwrites(guild, dbMember.discord_id, botId);

  const { channel, categoryId } = await createResidentChannel(guild, {
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites,
    topic: `Canal individual de ${fullName} (${nickname})`,
  });

  await memberRepo.update(dbMember.id, { channel_id: channel.id });

  await query(
    `INSERT INTO resident_channels (member_id, discord_id, channel_id, channel_name, category_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [dbMember.id, dbMember.discord_id, channel.id, channelName, categoryId]
  );

  try {
    const panelRows = buildBairristaChannelPanel();
    const panelMsg = await channel.send({ embeds: [welcomeChannelEmbed(fullName)], components: panelRows });
    await panelMsg.pin().catch(() => {});
  } catch (e) {
    warn(`[BACKFILL-TOPICOS] Welcome em ${channel.id} falhou (non-fatal): ${e.message}`);
  }

  return { channelId: channel.id, channelName };
}

async function backfill(guild, { dryRun = false } = {}) {
  const missing = await _findMissing();
  if (!missing.length) {
    log('[BACKFILL-TOPICOS] Nenhum tópico em falta.');
    return { created: 0, missing: 0 };
  }

  if (dryRun) {
    return { created: 0, missing: missing.length, preview: missing.map(m => m.display_name) };
  }

  const botId = guild.members.me?.id;
  const results = [];
  for (const dbMember of missing) {
    try {
      const r = await _createOne(guild, botId, dbMember);
      results.push(r);
      log(`[BACKFILL-TOPICOS] Criado ${r.channelName} (${r.channelId})`);
    } catch (e) {
      warn(`[BACKFILL-TOPICOS] Falha ao criar para ${dbMember.display_name}: ${e.message}`);
    }
  }

  return { created: results.length, missing: missing.length };
}

module.exports = { backfill };
