'use strict';
/**
 * Role/member reconciliation — regras que o bot garante em todas as operações.
 *
 * Invariantes Discord:
 *   - qualquer membro com tier operacional tem role base Bairristas;
 *   - no máximo um tier operacional simultâneo.
 *
 * Reconciliação DB:
 *   - qualquer membro ativo na DB que já não existe no Discord fica inativo/removido.
 */

const CONFIG = require('../config');
const { query } = require('../db');
const { queueMemberOp } = require('../discordQueue');
const { logAudit } = require('../audit/auditEngine');
const { log, warn } = require('../logger');

function hasAnyTier(guildMember) {
  const ids = CONFIG.BAIRRISTA_TIER_ROLE_IDS;
  return ids.some(id => id && guildMember.roles.cache.has(id));
}

function hasBairristasBase(guildMember) {
  const baseId = CONFIG.BAIRRISTAS_BASE_ROLE_ID;
  return baseId ? guildMember.roles.cache.has(baseId) : true;
}

async function ensureInvariants(guildMember, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system';
  const reason = opts.reason || 'Invariant enforcement';

  const violations = [];
  const fixes = [];

  if (hasAnyTier(guildMember) && !hasBairristasBase(guildMember)) {
    violations.push('tier_without_bairristas_base');
    if (!dryRun && CONFIG.BAIRRISTAS_BASE_ROLE_ID && CONFIG.ENFORCE_ROLE_INVARIANTS) {
      try {
        await queueMemberOp(() => guildMember.roles.add(CONFIG.BAIRRISTAS_BASE_ROLE_ID, reason));
        fixes.push('added_bairristas_base');
        await logAudit({
          action: 'invariant_fix',
          entityType: 'member',
          entityId: guildMember.id,
          actorId: actor,
          context: 'tier_without_bairristas_base → added Bairristas base',
        });
      } catch (e) {
        warn(`[INVARIANT] Falha ao aplicar base Bairristas em ${guildMember.id}: ${e.message}`);
      }
    }
  }

  const tierIds = CONFIG.BAIRRISTA_TIER_ROLE_IDS.filter(id => id && guildMember.roles.cache.has(id));
  if (tierIds.length > 1) {
    violations.push('multiple_tiers');
    if (!dryRun && CONFIG.ENFORCE_ROLE_INVARIANTS) {
      const order = [CONFIG.GANGSTER_FODIDO_ROLE_ID, CONFIG.O_GUNAO_ROLE_ID, CONFIG.YOUNG_BLOOD_ROLE_ID];
      const keep = order.find(id => id && guildMember.roles.cache.has(id));
      for (const id of tierIds) {
        if (id === keep) continue;
        try {
          await queueMemberOp(() => guildMember.roles.remove(id, `${reason} (múltiplos tiers)`));
          fixes.push(`removed_duplicate_tier:${id}`);
        } catch (e) {
          warn(`[INVARIANT] Falha ao remover tier duplicado ${id}: ${e.message}`);
        }
      }
      await logAudit({
        action: 'invariant_fix',
        entityType: 'member',
        entityId: guildMember.id,
        actorId: actor,
        context: `multiple_tiers → kept ${keep}`,
      });
    }
  }

  return {
    needsFix: violations.length > 0,
    applied: fixes.length > 0,
    violations,
    fixes,
  };
}

async function fetchGuildMembers(guild) {
  try {
    await guild.members.fetch();
    return true;
  } catch (e) {
    warn(`[RECONCILE:members] guild.members.fetch falhou; reconciliação DB→Discord saltada: ${e.message}`);
    return false;
  }
}

async function markMissingDbMembersRemoved(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system:discord-reconcile';
  const fetched = await fetchGuildMembers(guild);
  if (!fetched) return { scanned: 0, missing: 0, updated: 0, skipped: true };

  const active = await query(
    `select id, discord_id, display_name, tier, role
       from members
      where discord_id is not null
        and deleted_at is null
        and coalesce(lifecycle_state::text, status, 'active') in ('active','ativo','promoted')
      order by id
      limit 1000`
  );

  const missing = active.rows.filter(row => row.discord_id && !guild.members.cache.has(row.discord_id));
  if (!missing.length) {
    log(`[RECONCILE:members] DB↔Discord OK: ${active.rows.length} ativos verificados, 0 órfãos.`);
    return { scanned: active.rows.length, missing: 0, updated: 0, skipped: false };
  }

  const ids = missing.map(row => row.id);
  const discordIds = missing.map(row => row.discord_id);

  if (!dryRun) {
    await query(
      `update members
          set role = 'inativo',
              status = 'inativo',
              lifecycle_state = 'removed',
              lifecycle_changed_at = now(),
              lifecycle_changed_by = $2,
              lifecycle_notes = 'Removido automaticamente: já não está no Discord',
              deleted_at = now(),
              channel_id = null,
              updated_at = now()
        where id = any($1::int[])`,
      [ids, actor]
    );

    await query(
      `delete from user_roles ur
        using profiles p
        where ur.user_id = p.user_id
          and p.discord_id = any($1::text[])
          and ur.role in ('admin','superadmin')`,
      [discordIds]
    ).catch(e => warn(`[RECONCILE:members] Falha a limpar user_roles de órfãos: ${e.message}`));

    await logAudit({
      action: 'members_auto_removed_missing_discord',
      entityType: 'member',
      entityId: 'bulk',
      actorId: actor,
      afterState: {
        count: missing.length,
        members: missing.map(m => ({ id: m.id, discord_id: m.discord_id, name: m.display_name, tier: m.tier, role: m.role })),
      },
    }).catch(e => warn(`[RECONCILE:members] Audit falhou: ${e.message}`));
  }

  log(
    `[RECONCILE:members] Marcados como removidos: ${missing.length}/${active.rows.length} ` +
      missing.map(m => `${m.display_name || m.discord_id}#${m.id}`).slice(0, 10).join(', ')
  );

  return { scanned: active.rows.length, missing: missing.length, updated: dryRun ? 0 : missing.length, skipped: false };
}

async function reconcileAllMembers(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system';

  const fetched = await fetchGuildMembers(guild);
  if (!fetched) return { scanned: 0, violations: 0, fixed: 0, details: [], skipped: true };

  const members = guild.members.cache;

  const report = {
    scanned: members.size,
    violations: 0,
    fixed: 0,
    details: [],
  };

  for (const [, gm] of members) {
    if (gm.user.bot) continue;
    const result = await ensureInvariants(gm, { dryRun, actor, reason: 'Reconciliation' });
    if (result.needsFix) {
      report.violations++;
      if (result.applied) report.fixed++;
      report.details.push({
        member: gm.id,
        displayName: gm.displayName,
        violations: result.violations,
        fixes: result.fixes,
      });
    }
  }

  log(
    `[INVARIANT] Reconciliação: ${report.scanned} scan, ${report.violations} violações, ${report.fixed} corrigidas (dry=${dryRun})`
  );
  return report;
}

async function reconcileDiscordMembership(guild, opts = {}) {
  const [invariants, missing] = await Promise.all([
    reconcileAllMembers(guild, opts),
    markMissingDbMembersRemoved(guild, opts),
  ]);
  return { invariants, missing };
}

module.exports = {
  hasAnyTier,
  hasBairristasBase,
  ensureInvariants,
  reconcileAllMembers,
  markMissingDbMembersRemoved,
  reconcileDiscordMembership,
};
