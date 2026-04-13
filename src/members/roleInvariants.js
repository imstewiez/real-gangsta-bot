'use strict';
/**
 * Role invariants — regras que o bot garante em todas as operações.
 *
 * Invariante core: qualquer membro com YB/OG/GF tem obrigatoriamente
 * de ter também a role base Moradores (`MORADORES_BASE_ROLE_ID`).
 *
 * Aplicado em:
 *   - onboardingEngine.processApproval
 *   - autoPromotionEngine.checkAndPromote
 *   - jobs/scheduler → reconcileRoles (diário)
 *   - slash command /rg-sync-roles (manual)
 */

const CONFIG = require('../config');
const { queueMemberOp } = require('../discordQueue');
const { logAudit } = require('../audit/auditEngine');
const { log, warn } = require('../logger');

function hasAnyTier(guildMember) {
  const ids = CONFIG.MORADOR_TIER_ROLE_IDS;
  return ids.some(id => id && guildMember.roles.cache.has(id));
}

function hasBaseMoradores(guildMember) {
  const baseId = CONFIG.MORADORES_BASE_ROLE_ID;
  return baseId ? guildMember.roles.cache.has(baseId) : true;
}

/**
 * Verifica e corrige invariantes num único membro.
 *
 * @param guildMember {GuildMember}
 * @param opts {{ dryRun?: boolean, actor?: string, reason?: string }}
 * @returns {{
 *   needsFix: boolean,
 *   applied: boolean,
 *   violations: string[],
 *   fixes: string[],
 * }}
 */
async function ensureInvariants(guildMember, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system';
  const reason = opts.reason || 'Invariant enforcement';

  const violations = [];
  const fixes = [];

  // Invariante 1: tier ⇒ base Moradores
  if (hasAnyTier(guildMember) && !hasBaseMoradores(guildMember)) {
    violations.push('tier_without_base_moradores');
    if (!dryRun && CONFIG.MORADORES_BASE_ROLE_ID && CONFIG.ENFORCE_ROLE_INVARIANTS) {
      try {
        await queueMemberOp(() =>
          guildMember.roles.add(CONFIG.MORADORES_BASE_ROLE_ID, reason)
        );
        fixes.push('added_base_moradores');
        await logAudit({
          action: 'invariant_fix',
          entityType: 'member',
          entityId: guildMember.id,
          actorId: actor,
          context: 'tier_without_base_moradores → added Moradores base',
        });
      } catch (e) {
        warn(`[INVARIANT] Falha ao aplicar base Moradores em ${guildMember.id}: ${e.message}`);
      }
    }
  }

  // Invariante 2: no máximo UM tier simultâneo (YB/OG/GF mutuamente exclusivos)
  const tierIds = CONFIG.MORADOR_TIER_ROLE_IDS.filter(id => id && guildMember.roles.cache.has(id));
  if (tierIds.length > 1) {
    violations.push('multiple_tiers');
    if (!dryRun && CONFIG.ENFORCE_ROLE_INVARIANTS) {
      // Mantém o tier mais alto (gangster_fodido > o_gunao > young_blood)
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

/**
 * Corre enforcement para todos os membros do servidor.
 * Usado pelo job diário e pelo slash /rg-sync-roles.
 *
 * @param guild {Guild}
 * @param opts {{ dryRun?: boolean, actor?: string }}
 */
async function reconcileAllMembers(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system';

  // Fetch todos — custoso mas diário está OK
  await guild.members.fetch().catch(() => null);
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

  log(`[INVARIANT] Reconciliação: ${report.scanned} scan, ${report.violations} violações, ${report.fixed} corrigidas (dry=${dryRun})`);
  return report;
}

module.exports = {
  hasAnyTier,
  hasBaseMoradores,
  ensureInvariants,
  reconcileAllMembers,
};
