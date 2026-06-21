'use strict';
/**
 * Backfill — importa para a DB todos os membros do Discord que têm
 * cargo operacional ou role base de acesso da Ballas.
 */

const CONFIG = require('../config');
const { memberRepo } = require('../repositories');
const { log, warn } = require('../logger');
const { logAudit } = require('../audit/auditEngine');

const CHEFIA_TIERS = [
  { key: 'manda_chuva', getId: () => CONFIG.MANDA_CHUVA_ROLE_ID },
  { key: 'kingpin', getId: () => CONFIG.KINGPIN_ROLE_ID },
];
const OFICIAL_TIERS = [
  { key: 'og', getId: () => CONFIG.OG_ROLE_ID },
  { key: 'real_gangster', getId: () => CONFIG.REAL_GANGSTER_ROLE_ID },
];
const BAIRRISTA_TIERS = [
  { key: 'gangster_fodido', getId: () => CONFIG.GANGSTER_FODIDO_ROLE_ID },
  { key: 'o_gunao', getId: () => CONFIG.O_GUNAO_ROLE_ID },
  { key: 'young_blood', getId: () => CONFIG.YOUNG_BLOOD_ROLE_ID },
];

function _resolveTier(roles, tierList) {
  for (const t of tierList) {
    const id = t.getId();
    if (id && roles.has(id)) return t.key;
  }
  return null;
}

function _pickDisplayName(gm) {
  const candidates = [gm.displayName, gm.nickname, gm.user?.globalName, gm.user?.username];
  for (const c of candidates) {
    if (!c) continue;
    const clean = String(c).replace(/[^\p{L}\p{N}]+/gu, '');
    if (clean.length >= 2) return c;
  }
  return gm.user?.username || gm.id;
}

function detectRoleFromGuildMember(gm) {
  const roles = gm.roles.cache;

  const chefiaTier = _resolveTier(roles, CHEFIA_TIERS);
  if (chefiaTier) return { role: 'chefia', tier: chefiaTier };

  const oficialTier = _resolveTier(roles, OFICIAL_TIERS);
  if (oficialTier) return { role: 'oficial', tier: oficialTier };

  if (CONFIG.PATRAO_DI_ZONA_ROLE_ID && roles.has(CONFIG.PATRAO_DI_ZONA_ROLE_ID)) {
    return { role: 'patrao_di_zona', tier: 'patrao_di_zona' };
  }

  const bairristaTier = _resolveTier(roles, BAIRRISTA_TIERS);
  if (bairristaTier) return { role: 'bairrista', tier: bairristaTier };

  // Acesso base: estas roles não dão permissões de gestão/inventário,
  // mas permitem entrar na webapp e manter o membro ativo na DB.
  if (CONFIG.BAIRRISTAS_BASE_ROLE_ID && roles.has(CONFIG.BAIRRISTAS_BASE_ROLE_ID)) {
    return { role: 'bairrista', tier: 'bairrista' };
  }

  if (CONFIG.BALLAS_ROLE_ID && roles.has(CONFIG.BALLAS_ROLE_ID)) {
    return { role: 'ballas', tier: 'ballas' };
  }

  return null;
}

async function backfillMembers(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system:backfill';
  const skipFetch = Boolean(opts.skipFetch);

  const report = {
    scanned: 0,
    skippedBot: 0,
    skippedNoRole: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
    fetch_failed: false,
  };

  if (!skipFetch) {
    try {
      await guild.members.fetch();
    } catch (e) {
      report.fetch_failed = true;
      warn(
        `[BACKFILL] guild.members.fetch falhou; vou usar a cache atual e tentar novamente no próximo reconcile: ${e.message}`
      );
    }
  }

  for (const [, gm] of guild.members.cache) {
    report.scanned += 1;
    if (gm.user.bot) {
      report.skippedBot += 1;
      continue;
    }

    const detected = detectRoleFromGuildMember(gm);
    if (!detected) {
      report.skippedNoRole += 1;
      continue;
    }

    try {
      const existing = await memberRepo.findByDiscordId(gm.id);
      const displayName = _pickDisplayName(gm);
      const username = gm.user.username;

      if (!existing) {
        if (dryRun) {
          report.created += 1;
          continue;
        }
        await memberRepo.create({ discordId: gm.id, username, displayName, role: detected.role });
        const created = await memberRepo.findByDiscordId(gm.id);
        if (created && created.tier !== detected.tier) await memberRepo.update(created.id, { tier: detected.tier });
        await logAudit({
          action: 'member_backfilled',
          entityType: 'member',
          entityId: gm.id,
          actorId: actor,
          afterState: { role: detected.role, tier: detected.tier, display_name: displayName },
          context: 'backfill from Discord roles',
        }).catch(() => {});
        report.created += 1;
        continue;
      }

      const changes = {};
      if (existing.role !== detected.role) changes.role = detected.role;
      if (existing.tier !== detected.tier) changes.tier = detected.tier;
      if (existing.display_name !== displayName) changes.display_name = displayName;
      if (existing.username !== username) changes.username = username;
      if (existing.status === 'inativo' || existing.deleted_at) {
        changes.status = 'ativo';
        changes.deleted_at = null;
        changes.lifecycle_state = 'active';
        changes.lifecycle_changed_at = new Date();
        changes.lifecycle_changed_by = actor;
        changes.lifecycle_notes = 'Reativado automaticamente: voltou a ter cargo de acesso no Discord';
      }

      if (Object.keys(changes).length === 0) {
        report.unchanged += 1;
        continue;
      }

      if (!dryRun) {
        await memberRepo.update(existing.id, changes);
        await logAudit({
          action: 'member_synced',
          entityType: 'member',
          entityId: gm.id,
          actorId: actor,
          beforeState: {
            role: existing.role,
            tier: existing.tier,
            display_name: existing.display_name,
            username: existing.username,
            status: existing.status,
          },
          afterState: changes,
          context: 'backfill from Discord roles',
        }).catch(() => {});
      }
      report.updated += 1;
    } catch (e) {
      warn(`[BACKFILL] Falhou para ${gm.id} (${gm.displayName}): ${e.message}`);
      report.errors.push({ discordId: gm.id, message: e.message });
    }
  }

  log(
    `[BACKFILL] scanned=${report.scanned} bot=${report.skippedBot} no_access_role=${report.skippedNoRole} created=${report.created} updated=${report.updated} unchanged=${report.unchanged} errors=${report.errors.length} fetch_failed=${report.fetch_failed} dry=${dryRun}`
  );
  return report;
}

module.exports = { backfillMembers, detectRoleFromGuildMember };
