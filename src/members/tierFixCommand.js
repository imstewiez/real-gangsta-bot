'use strict';
/**
 * /rg-fix-tiers — sincroniza DB.tier com o role actual do Discord.
 *
 * Idempotente: para cada morador, lê o role mais alto que tem (GF > Gun > YB)
 * e actualiza:
 *   - members.tier para o valor correspondente
 *   - resident_channels.channel_name (e o canal no Discord) para o tier
 *
 * Não mexe em roles do Discord — só lê. Assim, promoções excepcionais feitas
 * por staff via atribuição manual de role ficam automaticamente reflectidas
 * na DB quando o comando correr.
 *
 * Também funciona como limpeza após mudanças de hierarquia: se alguém tem a
 * tier na DB desactualizada, fica alinhada.
 */

const CONFIG = require('../config');
const { query } = require('../db');
const { queueChannelOp } = require('../discordQueue');
const { logAudit } = require('../audit/auditEngine');
const { formatResidentChannelName, TIER_LABEL } = require('../discord/structureTemplate');
const { log, warn } = require('../logger');

function inferTierFromRoles(guildMember) {
  // Ordem importa: se tiver múltiplos, escolhe o mais alto.
  if (CONFIG.GANGSTER_FODIDO_ROLE_ID && guildMember.roles.cache.has(CONFIG.GANGSTER_FODIDO_ROLE_ID)) return 'gangster_fodido';
  if (CONFIG.O_GUNAO_ROLE_ID && guildMember.roles.cache.has(CONFIG.O_GUNAO_ROLE_ID)) return 'o_gunao';
  if (CONFIG.YOUNG_BLOOD_ROLE_ID && guildMember.roles.cache.has(CONFIG.YOUNG_BLOOD_ROLE_ID)) return 'young_blood';
  return null;
}

/**
 * @param guild  Discord Guild
 * @param opts   { dryRun: boolean, actor: string }
 * @returns report
 */
async function fixTiers(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system';

  await guild.members.fetch().catch(() => null);
  const members = guild.members.cache;

  const report = {
    mode: dryRun ? 'dry-run' : 'apply',
    scanned: 0,
    morador: 0,
    aligned: 0,
    dbUpdated: 0,
    channelRenamed: 0,
    failed: 0,
    details: [],
  };

  for (const [, gm] of members) {
    if (gm.user.bot) continue;
    report.scanned++;

    const inferredTier = inferTierFromRoles(gm);
    if (!inferredTier) continue; // não é morador
    report.morador++;

    // Buscar linha na DB
    const res = await query(
      `SELECT id, tier, channel_id, nickname, display_name
         FROM members
        WHERE discord_id = $1 AND role = 'morador'`,
      [gm.id]
    );
    const dbRow = res.rows[0];
    if (!dbRow) continue;

    const needsDbUpdate = dbRow.tier !== inferredTier;
    const expectedChannelName = dbRow.channel_id
      ? formatResidentChannelName(inferredTier, dbRow.nickname || dbRow.display_name)
      : null;
    let currentChannel = null;
    if (dbRow.channel_id) {
      currentChannel = await guild.channels.fetch(dbRow.channel_id).catch(() => null);
    }
    const needsChannelRename = currentChannel && expectedChannelName && currentChannel.name !== expectedChannelName;

    if (!needsDbUpdate && !needsChannelRename) {
      report.aligned++;
      continue;
    }

    const detail = {
      member: gm.id,
      displayName: gm.displayName,
      fromTier: dbRow.tier,
      toTier: inferredTier,
      dbUpdate: needsDbUpdate,
      channelRename: needsChannelRename ? expectedChannelName : null,
      error: null,
    };

    if (!dryRun) {
      try {
        if (needsDbUpdate) {
          await query(
            `UPDATE members SET tier = $1, updated_at = NOW() WHERE id = $2`,
            [inferredTier, dbRow.id]
          );
          report.dbUpdated++;
        }
        if (needsChannelRename) {
          await queueChannelOp(() => currentChannel.setName(expectedChannelName));
          await query(
            `UPDATE resident_channels SET channel_name = $1 WHERE channel_id = $2 AND status = 'active'`,
            [expectedChannelName, dbRow.channel_id]
          );
          report.channelRenamed++;
        }
        await logAudit({
          action: 'tier_sync',
          entityType: 'member',
          entityId: gm.id,
          actorId: actor,
          beforeState: { tier: dbRow.tier, channelName: currentChannel?.name },
          afterState: { tier: inferredTier, channelName: expectedChannelName },
          context: 'sync DB ↔ Discord role',
        });
      } catch (e) {
        warn(`[FIX-TIERS] Falha em ${gm.id}: ${e.message}`);
        detail.error = e.message;
        report.failed++;
      }
    }

    report.details.push(detail);
  }

  log(`[FIX-TIERS] ${report.mode}: scan=${report.scanned} morador=${report.morador} aligned=${report.aligned} db=${report.dbUpdated} ch=${report.channelRenamed} fail=${report.failed}`);
  return report;
}

module.exports = { fixTiers, inferTierFromRoles };
