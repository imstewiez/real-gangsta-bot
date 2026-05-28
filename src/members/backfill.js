'use strict';
/**
 * Backfill — importa para a DB todos os membros do Discord que têm pelo
 * menos uma role de RP (chefia, oficial, patrao_di_zona, bairrista tier).
 *
 * Útil quando o bot é instalado num servidor onde já existem membros com
 * tags atribuídas antes do sistema de onboarding ter sido usado.
 *
 * Também actualiza role/tier dos membros já existentes em caso de mismatch
 * (Discord é a fonte de verdade para ROLE; tier permanece como está na DB
 * excepto se o membro ainda não tinha tier definido).
 */

const CONFIG = require('../config');
const { memberRepo } = require('../repositories');
const { log, warn } = require('../logger');
const { logAudit } = require('../audit/auditEngine');

// Ordem de prioridade dentro de cada classe (topo → base). Topo ganha.
// Hierarquia completa:
//   CHEFIA:         manda_chuva > kingpin
//   OFICIAL:        og > real_gangster
//   PATRÃO DI ZONA: patrao_di_zona (chefe do bairro, classe separada)
//   BAIRRISTA:      gangster_fodido > o_gunao > young_blood
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

// Fallback para display_names Discord com < 2 caracteres alfanuméricos reais
// (ex: ".", "᲼᲼᲼", espaços invisíveis). Evita que apareçam sem nome no Sheet.
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
  // Hierarquia: Chefia > Oficial > Patrão di Zona > Bairrista > Inativo
  // Chefia — topo da hierarquia
  if (CONFIG.CHEFIA_ROLE_IDS.some(id => id && roles.has(id))) {
    return { role: 'chefia', tier: _resolveTier(roles, CHEFIA_TIERS) };
  }
  // Oficial
  if (CONFIG.OFICIAL_ROLE_IDS.some(id => id && roles.has(id))) {
    return { role: 'oficial', tier: _resolveTier(roles, OFICIAL_TIERS) };
  }
  // Patrão di Zona
  if (CONFIG.PATRAO_DI_ZONA_ROLE_IDS.some(id => id && roles.has(id))) {
    return { role: 'patrao_di_zona', tier: 'patrao_di_zona' };
  }
  // Bairrista com tier — detecta o mais alto
  const bairristaTier = _resolveTier(roles, BAIRRISTA_TIERS);
  if (bairristaTier) return { role: 'bairrista', tier: bairristaTier };
  // Base bairristas sem tier específico — assume entry
  if (CONFIG.BAIRRISTAS_BASE_ROLE_ID && roles.has(CONFIG.BAIRRISTAS_BASE_ROLE_ID)) {
    return { role: 'bairrista', tier: CONFIG.BAIRRISTA_DEFAULT_TIER || 'young_blood' };
  }
  return null; // Sem role RP — ignorar
}

/**
 * Percorre todos os membros do Discord e upserta na DB os que têm role RP.
 * Retorna relatório { scanned, skippedBot, skippedNoRole, created, updated, unchanged, errors }.
 */
async function backfillMembers(guild, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const actor = opts.actor || 'system:backfill';

  try {
    await guild.members.fetch();
  } catch (e) {
    throw new Error(`guild.members.fetch failed during backfill: ${e.message}`);
  }
  const report = {
    scanned: 0,
    skippedBot: 0,
    skippedNoRole: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    errors: [],
  };

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
        await memberRepo.create({
          discordId: gm.id,
          username,
          displayName,
          role: detected.role,
        });
        // Sincroniza tier detectado (memberRepo.create não aceita tier,
        // cria com DB default 'young_blood' — pode não corresponder).
        const created = await memberRepo.findByDiscordId(gm.id);
        if (created && created.tier !== detected.tier) {
          await memberRepo.update(created.id, { tier: detected.tier });
        }
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

      // Existe — verificar se role/tier/displayName precisa de sync.
      // Tier é SEMPRE sincronizado com o Discord (fonte de verdade).
      const changes = {};
      if (existing.role !== detected.role) changes.role = detected.role;
      if (existing.tier !== detected.tier) changes.tier = detected.tier;
      if (existing.display_name !== displayName) changes.display_name = displayName;
      if (existing.username !== username) changes.username = username;
      if (existing.status === 'inativo') changes.status = 'ativo'; // reactivar se voltou a ter role

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
    `[BACKFILL] scanned=${report.scanned} bot=${report.skippedBot} no_role=${report.skippedNoRole} created=${report.created} updated=${report.updated} unchanged=${report.unchanged} errors=${report.errors.length} dry=${dryRun}`
  );
  return report;
}

module.exports = { backfillMembers, detectRoleFromGuildMember };
