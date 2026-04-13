'use strict';
/**
 * /rg-fix-tiers — migra membros para a nova ordem de tiers.
 *
 * Antes:    young_blood (entry) → o_gunao (mid) → gangster_fodido (top)
 * Depois:   o_gunao    (entry) → young_blood (mid) → gangster_fodido (top)
 *
 * Para cada morador no servidor:
 *   - se tem role YOUNG_BLOOD, swap para O_GUNAO (era entry, continua entry)
 *   - se tem role O_GUNAO,     swap para YOUNG_BLOOD (era mid pré-promoção, continua mid)
 *   - se tem role GANGSTER_FODIDO, fica como está
 * E em paralelo:
 *   - DB: tier 'young_blood' ↔ 'o_gunao'
 *   - Canal individual renomeado para refletir o novo TIER_LABEL
 *
 * Modo dry-run mostra o que seria feito sem aplicar nada.
 */

const CONFIG = require('../config');
const { query } = require('../db');
const { queueMemberOp, queueChannelOp } = require('../discordQueue');
const { logAudit } = require('../audit/auditEngine');
const { formatResidentChannelName } = require('../discord/structureTemplate');
const { log, warn } = require('../logger');

const SWAP = {
  young_blood: 'o_gunao',
  o_gunao: 'young_blood',
};

function pickAffectedRoleId(guildMember) {
  const ybId = CONFIG.YOUNG_BLOOD_ROLE_ID;
  const gunId = CONFIG.O_GUNAO_ROLE_ID;
  if (ybId && guildMember.roles.cache.has(ybId)) return { from: 'young_blood', fromRoleId: ybId, to: 'o_gunao', toRoleId: gunId };
  if (gunId && guildMember.roles.cache.has(gunId)) return { from: 'o_gunao', fromRoleId: gunId, to: 'young_blood', toRoleId: ybId };
  return null;
}

/**
 * @param guild  Discord Guild
 * @param opts   { dryRun: boolean, actor: string }
 * @returns {{ scanned, affected, swapped, channelRenamed, dbUpdated, failed, details }}
 */
async function fixTiers(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system';

  await guild.members.fetch().catch(() => null);
  const members = guild.members.cache;

  const report = {
    mode: dryRun ? 'dry-run' : 'apply',
    scanned: 0,
    affected: 0,
    swapped: 0,
    channelRenamed: 0,
    dbUpdated: 0,
    failed: 0,
    details: [],
  };

  for (const [, gm] of members) {
    if (gm.user.bot) continue;
    report.scanned++;

    const target = pickAffectedRoleId(gm);
    if (!target) continue;
    if (!target.toRoleId) {
      warn(`[FIX-TIERS] Role destino para ${target.to} não configurado — skip ${gm.id}.`);
      continue;
    }

    report.affected++;
    const detail = {
      member: gm.id,
      displayName: gm.displayName,
      from: target.from,
      to: target.to,
      roleSwap: false,
      dbUpdate: false,
      channelRename: null,
      error: null,
    };

    if (!dryRun) {
      try {
        // 1. Swap roles (add new, remove old)
        await queueMemberOp(() => gm.roles.add(target.toRoleId, `fix-tiers: ${target.from} → ${target.to}`));
        await queueMemberOp(() => gm.roles.remove(target.fromRoleId, `fix-tiers: ${target.from} → ${target.to}`));
        detail.roleSwap = true;
        report.swapped++;

        // 2. Atualizar DB
        const dbRes = await query(
          `UPDATE members SET tier = $1, updated_at = NOW()
            WHERE discord_id = $2 AND tier = $3 AND role = 'morador'
            RETURNING id, channel_id, nickname, display_name`,
          [target.to, gm.id, target.from]
        );
        const dbRow = dbRes.rows[0];
        if (dbRow) {
          detail.dbUpdate = true;
          report.dbUpdated++;

          // 3. Rename canal individual
          if (dbRow.channel_id) {
            const channel = await guild.channels.fetch(dbRow.channel_id).catch(() => null);
            if (channel) {
              const newName = formatResidentChannelName(target.to, dbRow.nickname || dbRow.display_name);
              if (channel.name !== newName) {
                await queueChannelOp(() => channel.setName(newName));
                await query(
                  `UPDATE resident_channels SET channel_name = $1 WHERE channel_id = $2 AND status = 'active'`,
                  [newName, dbRow.channel_id]
                );
                detail.channelRename = newName;
                report.channelRenamed++;
              }
            }
          }
        }

        await logAudit({
          action: 'tier_swap',
          entityType: 'member',
          entityId: gm.id,
          actorId: actor,
          beforeState: { tier: target.from, roleId: target.fromRoleId },
          afterState: { tier: target.to, roleId: target.toRoleId, channelName: detail.channelRename },
          context: 'tier-order migration (o_gunao=entry, young_blood=mid)',
        });
      } catch (e) {
        warn(`[FIX-TIERS] Falha em ${gm.id}: ${e.message}`);
        detail.error = e.message;
        report.failed++;
      }
    }

    report.details.push(detail);
  }

  log(`[FIX-TIERS] ${report.mode}: scan=${report.scanned}, affected=${report.affected}, swapped=${report.swapped}, dbUpdated=${report.dbUpdated}, channels=${report.channelRenamed}, failed=${report.failed}`);
  return report;
}

module.exports = { fixTiers };
