'use strict';
const CONFIG = require('../config');

/**
 * Hierarquia Bot di Zona:
 *   1. Manda-Chuva      ─┐
 *   2. Kingpin           ├─ Comando Total  (isCommand / isChefia)
 *   3. OG                ┐
 *   4. Real Gangster     ├─ Supervisão     (isSupervisor / isOficial)
 *   5. Patrão di Zona    ── Chefe do Bairro (isPatraoDiZona)
 *   6. Gangster Fodido   ┐
 *   7. O Gunão           ├─ Bairristas     (isBairrista)
 *   8. Young Blood       ┘
 *
 * Roles flavor (não-core): Tropinhas do Guetto, Patrulha Pata
 */

function memberRoleIds(member) {
  const cache = member?.roles?.cache;
  if (!cache) return new Set();
  // Discord.js Collection has .map, plain Map only has .values()
  const ids = typeof cache.map === 'function' ? cache.map(r => r.id) : [...cache.values()].map(r => r.id);
  return new Set(ids);
}

function hasAny(roleIds, list) {
  return list.some(id => id && roleIds.has(id));
}

function getMemberRoles(member) {
  const ids = memberRoleIds(member);
  const roles = new Set();
  if (hasAny(ids, CONFIG.COMMAND_ROLE_IDS)) roles.add('command');
  if (hasAny(ids, CONFIG.SUPERVISOR_ROLE_IDS)) roles.add('supervisor');
  if (hasAny(ids, CONFIG.PATRAO_DI_ZONA_ROLE_IDS)) roles.add('patrao_di_zona');
  if (hasAny(ids, CONFIG.BAIRRISTA_TIER_ROLE_IDS)) roles.add('bairrista');
  return roles;
}

function getBairristaTier(member) {
  const ids = memberRoleIds(member);
  if (ids.has(CONFIG.GANGSTER_FODIDO_ROLE_ID)) return 'gangster_fodido';
  if (ids.has(CONFIG.O_GUNAO_ROLE_ID)) return 'o_gunao';
  if (ids.has(CONFIG.YOUNG_BLOOD_ROLE_ID)) return 'young_blood';
  return null;
}

function getExactRole(member) {
  const ids = memberRoleIds(member);
  if (ids.has(CONFIG.MANDA_CHUVA_ROLE_ID)) return 'manda_chuva';
  if (ids.has(CONFIG.KINGPIN_ROLE_ID)) return 'kingpin';
  if (ids.has(CONFIG.OG_ROLE_ID)) return 'og';
  if (ids.has(CONFIG.REAL_GANGSTER_ROLE_ID)) return 'real_gangster';
  if (ids.has(CONFIG.PATRAO_DI_ZONA_ROLE_ID)) return 'patrao_di_zona';
  if (ids.has(CONFIG.GANGSTER_FODIDO_ROLE_ID)) return 'gangster_fodido';
  if (ids.has(CONFIG.O_GUNAO_ROLE_ID)) return 'o_gunao';
  if (ids.has(CONFIG.YOUNG_BLOOD_ROLE_ID)) return 'young_blood';
  return null;
}

// ── Predicados semânticos ─────────────────────────────────────────────────

/** Comando total: Manda-Chuva, Kingpin. */
function isCommand(member) {
  return hasAny(memberRoleIds(member), CONFIG.COMMAND_ROLE_IDS);
}

/** Supervisão: OG, Real Gangster. */
function isSupervisor(member) {
  return hasAny(memberRoleIds(member), CONFIG.SUPERVISOR_ROLE_IDS);
}

/** Chefia = Comando total (compatibilidade com código existente). */
function isChefia(member) {
  return isCommand(member);
}

/** Oficial = Supervisão OU Comando (quem manda acima da linha dos bairristas). */
function isOficial(member) {
  return isCommand(member) || isSupervisor(member);
}

/** Patrão di Zona ou qualquer escalão acima. */
function isPatraoDiZona(member) {
  return hasAny(memberRoleIds(member), CONFIG.PATRAO_DI_ZONA_ROLE_IDS) || isCommand(member) || isSupervisor(member);
}
function isBairrista(member) {
  return hasAny(memberRoleIds(member), CONFIG.BAIRRISTA_TIER_ROLE_IDS);
}

function isAnyMember(member) {
  return isCommand(member) || isSupervisor(member) || isPatraoDiZona(member) || isBairrista(member);
}

// ── Capacidades (intent-level) ────────────────────────────────────────────

function canManageInventory(member) {
  return isCommand(member) || isSupervisor(member);
}
function canManageOperations(member) {
  return isCommand(member) || isSupervisor(member);
}

/**
 * Abrir uma sessão de saída (criar + publicar painel vivo) requer
 * OG ou acima — exclui Real Gangster, que participa mas não abre.
 * Ordem: Manda-Chuva (1) > Kingpin (2) > OG (3) > Real Gangster (4).
 */
function canOpenSession(member) {
  return isCommand(member) || memberRoleIds(member).has(CONFIG.OG_ROLE_ID);
}
function canManageBairro(member) {
  return isCommand(member) || isSupervisor(member) || hasAny(memberRoleIds(member), CONFIG.PATRAO_DI_ZONA_ROLE_IDS);
}
function canViewAllMembers(member) {
  return canManageBairro(member);
}
function canRegisterMaterial(member) {
  return isAnyMember(member);
}
function canManageStructure(member) {
  return isCommand(member);
}
function canBootstrapStock(member) {
  return isCommand(member);
}
function canRegisterKill(member) {
  return isAnyMember(member);
}

module.exports = {
  getMemberRoles,
  getBairristaTier,
  getExactRole,
  isCommand,
  isSupervisor,
  isChefia,
  isOficial,
  isPatraoDiZona,
  isBairrista,
  isAnyMember,
  canManageInventory,
  canManageOperations,
  canOpenSession,
  canManageBairro,
  canViewAllMembers,
  canRegisterMaterial,
  canManageStructure,
  canBootstrapStock,
  canRegisterKill,
};
