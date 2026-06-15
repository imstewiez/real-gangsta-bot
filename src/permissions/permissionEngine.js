'use strict';
const CONFIG = require('../config');

const ROLE_RANK = Object.freeze({
  young_blood: 10,
  o_gunao: 20,
  gangster_fodido: 30,
  patrao_di_zona: 40,
  real_gangster: 50,
  og: 60,
  kingpin: 70,
  manda_chuva: 80,
});

const LOW_MEMBER_TIERS = new Set(['young_blood', 'o_gunao', 'gangster_fodido']);

function memberRoleIds(member) {
  const cache = member?.roles?.cache;
  if (!cache) return new Set();
  if (typeof cache.map === 'function') return new Set(cache.map(r => r.id));
  if (typeof cache.values === 'function') return new Set([...cache.values()].map(r => r.id));
  if (Array.isArray(cache)) return new Set(cache.map(r => r.id || r));
  return new Set();
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
  if (hasAny(ids, CONFIG.BAIRRISTA_TIER_ROLE_IDS)) roles.add('member_tier');
  return roles;
}

function getBairristaTier(member) {
  return getMemberTier(member);
}

function getMemberTier(member) {
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
  return getMemberTier(member);
}

function rankOf(memberOrRole) {
  const role = typeof memberOrRole === 'string' ? memberOrRole : getExactRole(memberOrRole);
  return ROLE_RANK[role] || 0;
}

function isCommand(member) {
  return hasAny(memberRoleIds(member), CONFIG.COMMAND_ROLE_IDS);
}

function isSupervisor(member) {
  return hasAny(memberRoleIds(member), CONFIG.SUPERVISOR_ROLE_IDS);
}

function isPatraoDiZona(member) {
  return hasAny(memberRoleIds(member), CONFIG.PATRAO_DI_ZONA_ROLE_IDS);
}

function isMemberTier(member) {
  return LOW_MEMBER_TIERS.has(getMemberTier(member));
}

function isBairrista(member) {
  return isMemberTier(member);
}

function isChefia(member) {
  return isCommand(member);
}

function isOficial(member) {
  return isCommand(member) || isSupervisor(member);
}

function isAnyMember(member) {
  return isCommand(member) || isSupervisor(member) || isPatraoDiZona(member) || isMemberTier(member);
}

function isLowManagedTier(roleOrTier) {
  const tier = typeof roleOrTier === 'string' ? roleOrTier : getMemberTier(roleOrTier);
  return LOW_MEMBER_TIERS.has(tier);
}

function canManageOnboarding(member) {
  return isCommand(member) || isSupervisor(member) || isPatraoDiZona(member);
}

function canManageMember(actor, target) {
  if (!actor || !target) return false;
  const actorRank = rankOf(actor);
  const targetRank = rankOf(target);
  if (!actorRank || !targetRank) return false;

  if (isCommand(actor) || isSupervisor(actor)) {
    return actorRank > targetRank;
  }

  if (isPatraoDiZona(actor)) {
    return isLowManagedTier(target);
  }

  return false;
}

function canPromoteDemoteMember(actor, target, targetTier) {
  if (!canManageMember(actor, target)) return false;
  if (isCommand(actor) || isSupervisor(actor)) return true;
  if (isPatraoDiZona(actor)) {
    return isLowManagedTier(target) && LOW_MEMBER_TIERS.has(targetTier);
  }
  return false;
}

function canKickTarget(actor, target) {
  return canManageMember(actor, target);
}

function canKickMembers(member) {
  return canManageOnboarding(member);
}

// Compatibilidade com módulos antigos que já não entram no runtime minimalista.
function canManageInventory(member) {
  return isCommand(member) || isSupervisor(member);
}
function canManageOperations(member) {
  return isCommand(member) || isSupervisor(member);
}
function canOpenSession(member) {
  return isCommand(member) || isSupervisor(member) || isPatraoDiZona(member);
}
function canManageBairro(member) {
  return canManageOnboarding(member);
}
function canViewAllMembers(member) {
  return canManageOnboarding(member);
}
function canRegisterMaterial() {
  return false;
}
function canManageStructure(member) {
  return isCommand(member);
}
function canBootstrapStock() {
  return false;
}
function canRegisterKill() {
  return false;
}

module.exports = {
  ROLE_RANK,
  LOW_MEMBER_TIERS,
  memberRoleIds,
  getMemberRoles,
  getBairristaTier,
  getMemberTier,
  getExactRole,
  rankOf,
  isCommand,
  isSupervisor,
  isChefia,
  isOficial,
  isPatraoDiZona,
  isMemberTier,
  canManageOnboarding,
  canManageMember,
  canPromoteDemoteMember,
  canKickTarget,
  canKickMembers,
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
