'use strict';
/**
 * Reconcile driver — members.
 * Compara DB members vs Discord roles:
 *   - membro no DB com role que não bate com Discord → drift
 *   - membro no DB com tier que não bate com Discord → drift
 *   - membro no Discord com role RP mas não no DB → missing
 *   - membro no DB sem role RP mas Discord apagou → orphan
 *
 * apply() delega ao backfill existente (é idempotente) + marca
 * last_discord_reconciled_at.
 */

// const CONFIG = require('../../config');
const { memberRepo } = require('../../repositories');
const { markMemberDiscordReconciled, softDelete } = require('../../repositories/_meta');
const { detectRoleFromGuildMember, backfillMembers } = require('../../members/backfill');

async function check(guild) {
  await guild.members.fetch().catch(() => null);
  const discordMembers = guild.members.cache;
  const dbMembers = await memberRepo.findAll('ativo');

  const byDiscordId = new Map(dbMembers.map(m => [m.discord_id, m]));
  const drift = { total_checked: 0, role_mismatch: [], tier_mismatch: [], missing_in_db: [], orphan_in_db: [], ok: 0 };

  for (const [, gm] of discordMembers) {
    if (gm.user.bot) continue;
    drift.total_checked += 1;
    const detected = detectRoleFromGuildMember(gm);
    const dbRow = byDiscordId.get(gm.id);

    if (!dbRow && detected) {
      drift.missing_in_db.push({ discord_id: gm.id, display_name: gm.displayName, detected });
      continue;
    }
    if (dbRow && !detected) {
      drift.orphan_in_db.push({
        id: dbRow.id,
        discord_id: gm.id,
        display_name: dbRow.display_name,
        db_role: dbRow.role,
        db_tier: dbRow.tier,
      });
      continue;
    }
    if (!dbRow && !detected) continue;

    let issue = false;
    if (dbRow.role !== detected.role) {
      drift.role_mismatch.push({
        discord_id: gm.id,
        display_name: dbRow.display_name,
        db_role: dbRow.role,
        discord_role: detected.role,
      });
      issue = true;
    }
    if (dbRow.tier !== detected.tier) {
      drift.tier_mismatch.push({
        discord_id: gm.id,
        display_name: dbRow.display_name,
        db_tier: dbRow.tier,
        discord_tier: detected.tier,
      });
      issue = true;
    }
    if (!issue) drift.ok += 1;
  }

  // Segunda passagem: detectar membros na DB que já não existem no Discord
  // (saíram do servidor ou foram kickados).
  for (const [discordId, dbRow] of byDiscordId) {
    if (!discordMembers.has(discordId)) {
      drift.orphan_in_db.push({
        id: dbRow.id,
        discord_id: discordId,
        display_name: dbRow.display_name,
        db_role: dbRow.role,
        db_tier: dbRow.tier,
      });
    }
  }

  drift.has_drift =
    drift.role_mismatch.length + drift.tier_mismatch.length + drift.missing_in_db.length + drift.orphan_in_db.length >
    0;
  return drift;
}

async function apply(guild, drift, { actor = 'system:reconcile' } = {}) {
  // Backfill corrige role/tier mismatch + missing_in_db (cria).
  // Orphans (membro na DB mas sem role RP no Discord = saiu do servidor)
  // são soft-deleted para manter contagem 1:1 com Discord.
  const r = await backfillMembers(guild, { dryRun: false, actor });

  const orphanErrors = [];
  for (const orphan of drift.orphan_in_db) {
    try {
      await softDelete('members', orphan.id, actor, 'orphan_in_db: left Discord');
    } catch (e) {
      orphanErrors.push({ id: orphan.id, error: e.message });
    }
  }

  // Marca last_discord_reconciled_at para todos os membros scannados.
  for (const [, gm] of guild.members.cache) {
    if (gm.user.bot) continue;
    const { memberRepo: mr } = require('../../repositories');
    const dbRow = await mr.findByDiscordId(gm.id);
    if (dbRow) await markMemberDiscordReconciled(dbRow.id);
  }

  return {
    corrected: (r.created || 0) + (r.updated || 0),
    errors: (r.errors || []).concat(orphanErrors),
    soft_deleted_orphans: drift.orphan_in_db.length - orphanErrors.length,
  };
}

module.exports = { check, apply };
