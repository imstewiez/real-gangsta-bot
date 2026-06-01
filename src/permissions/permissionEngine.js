'use strict';
const CONFIG = require('../config');

function memberRoleIds(member) {
  const cache = member?.roles?.cache;
  if (!cache) return new Set();
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

function isCommand(member) {
  return hasAny(memberRoleIds(member), CONFIG.COMMAND_ROLE_IDS);
}

function isSupervisor(member) {
  return hasAny(memberRoleIds(member), CONFIG.SUPERVISOR_ROLE_IDS);
}

function isChefia(member) {
  return isCommand(member);
}

function isOficial(member) {
  return isCommand(member) || isSupervisor(member);
}

function isPatraoDiZona(member) {
  return hasAny(memberRoleIds(member), CONFIG.PATRAO_DI_ZONA_ROLE_IDS) || isCommand(member) || isSupervisor(member);
}

function canManageOnboarding(member) {
  return isPatraoDiZona(member);
}

function canKickMembers(member) {
  return isPatraoDiZona(member);
}

function isBairrista(member) {
  return hasAny(memberRoleIds(member), CONFIG.BAIRRISTA_TIER_ROLE_IDS);
}

function isAnyMember(member) {
  return isCommand(member) || isSupervisor(member) || isPatraoDiZona(member) || isBairrista(member);
}

function canManageInventory(member) {
  return isCommand(member) || isSupervisor(member);
}
function canManageOperations(member) {
  return isCommand(member) || isSupervisor(member);
}

function canOpenSession(member) {
  return (
    isCommand(member) ||
    memberRoleIds(member).has(CONFIG.OG_ROLE_ID) ||
    hasAny(memberRoleIds(member), CONFIG.PATRAO_DI_ZONA_ROLE_IDS)
  );
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
  canManageOnboarding,
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
