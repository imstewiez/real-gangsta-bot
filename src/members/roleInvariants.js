'use strict';
/**
 * Role/member reconciliation — regras que o bot garante em todas as operações.
 *
 * Invariantes Discord:
 *   - qualquer membro com tier operacional tem role base Bairristas;
 *   - no máximo um tier operacional simultâneo.
 *
 * Reconciliação DB:
 *   - a DB é a fonte principal quando já existe membro ativo;
 *   - o Discord é sincronizado para o tier da DB antes do backfill;
 *   - importa para a DB membros do Discord com cargo operacional válido;
 *   - qualquer membro ativo na DB que já não existe no Discord fica inativo/removido;
 *   - qualquer membro ativo na DB que existe mas só tem tags não-operacionais
 *     também fica inativo/removido.
 */

const CONFIG = require('../config');
const { query } = require('../db');
const { queueMemberOp } = require('../discordQueue');
const { logAudit } = require('../audit/auditEngine');
const { log, warn } = require('../logger');
const { detectRoleFromGuildMember, backfillMembers } = require('./backfill');

const VALID_SYNC_TIERS = new Set([
  'young_blood',
  'o_gunao',
  'gangster_fodido',
  'patrao_di_zona',
  'real_gangster',
  'og',
  'kingpin',
  'manda_chuva',
]);

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
        await logAudit({ action: 'invariant_fix', entityType: 'member', entityId: guildMember.id, actorId: actor, context: 'tier_without_bairristas_base → added Bairristas base' });
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
      await logAudit({ action: 'invariant_fix', entityType: 'member', entityId: guildMember.id, actorId: actor, context: `multiple_tiers → kept ${keep}` });
    }
  }

  return { needsFix: violations.length > 0, applied: fixes.length > 0, violations, fixes };
}

async function fetchGuildMembers(guild) {
  try {
    await guild.members.fetch();
    return true;
  } catch (e) {
    warn(`[RECONCILE:members] guild.members.fetch falhou; fallback individual será usado: ${e.message}`);
    return false;
  }
}

async function getGuildMember(guild, discordId) {
  if (!discordId) return null;
  if (guild.members.cache.has(discordId)) return guild.members.cache.get(discordId);
  try {
    return await guild.members.fetch({ user: discordId, force: true }).catch(() => null);
  } catch (_) {
    return null;
  }
}

async function syncActiveDbMembersToDiscord(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system:db-to-discord-sync';
  const { syncMemberDiscordState } = require('./syncMemberDiscordState');

  const active = await query(
    `select id, discord_id, display_name, tier, role
       from members
      where discord_id is not null
        and deleted_at is null
        and coalesce(lifecycle_state::text, status, 'active') in ('active','ativo','promoted')
      order by id
      limit 2000`
  );

  let scanned = 0;
  let synced = 0;
  let skipped = 0;
  let missing = 0;
  const errors = [];

  for (const row of active.rows) {
    scanned++;
    const tier = String(row.tier || row.role || '').toLowerCase().trim();
    if (!VALID_SYNC_TIERS.has(tier)) {
      skipped++;
      continue;
    }

    const gm = await getGuildMember(guild, row.discord_id);
    if (!gm) {
      missing++;
      continue;
    }

    if (dryRun) {
      synced++;
      continue;
    }

    try {
      const result = await syncMemberDiscordState(null, { memberId: row.id, discordId: row.discord_id });
      if (!result?.ok) throw new Error(result?.error || 'sync_failed');
      synced++;
    } catch (e) {
      errors.push({ id: row.id, discord_id: row.discord_id, error: e.message });
      warn(`[RECONCILE:members] Falha DB→Discord ${row.display_name || row.discord_id}: ${e.message}`);
    }
  }

  log(`[RECONCILE:members] DB→Discord: scanned=${scanned} synced=${synced} skipped=${skipped} missing=${missing} errors=${errors.length} actor=${actor}`);
  return { scanned, synced, skipped, missing, errors };
}

async function markMissingDbMembersRemoved(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system:discord-reconcile';
  if (!opts.skipFetch) await fetchGuildMembers(guild);

  const active = await query(
    `select id, discord_id, display_name, tier, role
       from members
      where discord_id is not null
        and deleted_at is null
        and coalesce(lifecycle_state::text, status, 'active') in ('active','ativo','promoted')
      order by id
      limit 2000`
  );

  const missing = [];
  const noOperationalRole = [];
  let checked = 0;

  for (const row of active.rows) {
    checked++;
    const gm = await getGuildMember(guild, row.discord_id);
    if (!gm) {
      missing.push(row);
      continue;
    }
    const detected = detectRoleFromGuildMember(gm);
    if (!detected) noOperationalRole.push(row);
  }

  const toRemove = [...missing, ...noOperationalRole];
  if (!toRemove.length) {
    log(`[RECONCILE:members] DB↔Discord OK: ${checked} ativos verificados, 0 órfãos/sem cargo operacional.`);
    return { scanned: checked, missing: 0, no_operational_role: 0, updated: 0, skipped: false };
  }

  const ids = toRemove.map(row => row.id);
  const discordIds = toRemove.map(row => row.discord_id);

  if (!dryRun) {
    await query(
      `update members
          set role = 'inativo',
              status = 'inativo',
              lifecycle_state = 'removed',
              lifecycle_changed_at = now(),
              lifecycle_changed_by = $2,
              lifecycle_notes = case
                when id = any($3::int[]) then 'Removido automaticamente: existe no Discord mas sem cargo operacional da Ballas'
                else 'Removido automaticamente: já não está no Discord'
              end,
              deleted_at = now(),
              channel_id = null,
              updated_at = now()
        where id = any($1::int[])`,
      [ids, actor, noOperationalRole.map(row => row.id)]
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
      action: 'members_auto_removed_no_operational_discord_role',
      entityType: 'member',
      entityId: 'bulk',
      actorId: actor,
      afterState: {
        missing_count: missing.length,
        no_operational_role_count: noOperationalRole.length,
        members: toRemove.map(m => ({ id: m.id, discord_id: m.discord_id, name: m.display_name, tier: m.tier, role: m.role })),
      },
    }).catch(e => warn(`[RECONCILE:members] Audit falhou: ${e.message}`));
  }

  log(
    `[RECONCILE:members] Marcados como removidos: ${toRemove.length}/${checked} ` +
      `(missing=${missing.length}, no_operational_role=${noOperationalRole.length}) ` +
      toRemove.map(m => `${m.display_name || m.discord_id}#${m.id}`).slice(0, 10).join(', ')
  );

  return { scanned: checked, missing: missing.length, no_operational_role: noOperationalRole.length, updated: dryRun ? 0 : toRemove.length, skipped: false };
}

async function reconcileAllMembers(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system';

  if (!opts.skipFetch) await fetchGuildMembers(guild);
  const members = guild.members.cache;

  const report = { scanned: members.size, violations: 0, fixed: 0, details: [] };

  for (const [, gm] of members) {
    if (gm.user.bot) continue;
    const result = await ensureInvariants(gm, { dryRun, actor, reason: 'Reconciliation' });
    if (result.needsFix) {
      report.violations++;
      if (result.applied) report.fixed++;
      report.details.push({ member: gm.id, displayName: gm.displayName, violations: result.violations, fixes: result.fixes });
    }
  }

  log(`[INVARIANT] Reconciliação: ${report.scanned} scan, ${report.violations} violações, ${report.fixed} corrigidas (dry=${dryRun})`);
  return report;
}

async function reconcileDiscordMembership(guild, opts = {}) {
  const actor = opts.actor || 'system:discord-reconcile';
  await fetchGuildMembers(guild);

  // 1) A DB manda quando já existe membro ativo.
  // Isto impede que o Discord antigo (ex.: Young Blood) volte a baixar a DB após uma promoção por XP.
  const dbToDiscord = await syncActiveDbMembersToDiscord(guild, { ...opts, actor, skipFetch: true });

  // 2) Depois importa/reativa quem está no Discord mas ainda não existe na DB.
  const backfill = await backfillMembers(guild, { ...opts, actor, skipFetch: true });

  // 3) Garante invariantes de roles no Discord.
  const invariants = await reconcileAllMembers(guild, { ...opts, actor, skipFetch: true });

  // 4) Por fim remove/inativa da DB quem já não tem cargo operacional.
  const missing = await markMissingDbMembersRemoved(guild, { ...opts, actor, skipFetch: true });

  return { dbToDiscord, backfill, invariants, missing };
}

module.exports = { hasAnyTier, hasBairristasBase, ensureInvariants, syncActiveDbMembersToDiscord, reconcileAllMembers, markMissingDbMembersRemoved, reconcileDiscordMembership };
