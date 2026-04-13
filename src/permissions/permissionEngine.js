'use strict';
const CONFIG = require('../config');

const ROLE_HIERARCHY = ['chefia', 'chefe_moradores', 'oficial', 'morador'];

function getMemberRoles(member) {
  const roles = new Set();
  const roleIds = member.roles?.cache?.map(r => r.id) || [];

  if (roleIds.includes(CONFIG.CHEFIA_ROLE_ID)) roles.add('chefia');
  if (roleIds.includes(CONFIG.CHEFE_MORADORES_ROLE_ID)) roles.add('chefe_moradores');
  if (roleIds.includes(CONFIG.OFICIAL_ROLE_ID)) roles.add('oficial');
  if (roleIds.includes(CONFIG.MORADOR_ROLE_ID)) roles.add('morador');

  return roles;
}

function getHighestRole(member) {
  const roles = getMemberRoles(member);
  for (const role of ROLE_HIERARCHY) {
    if (roles.has(role)) return role;
  }
  return null;
}

function isChefia(member) {
  return getMemberRoles(member).has('chefia');
}

function isChefeMoradores(member) {
  const roles = getMemberRoles(member);
  return roles.has('chefe_moradores') || roles.has('chefia');
}

function isOficial(member) {
  const roles = getMemberRoles(member);
  return roles.has('oficial') || roles.has('chefia');
}

function isMorador(member) {
  return getMemberRoles(member).has('morador');
}

function canManageInventory(member) {
  return isChefia(member) || isChefeMoradores(member);
}

function canManageOperations(member) {
  return isChefia(member);
}

function canViewAllMembers(member) {
  return isChefeMoradores(member);
}

function canRegisterMaterial(member) {
  const roles = getMemberRoles(member);
  return roles.size > 0;
}

function requireRole(member, ...allowedRoles) {
  const roles = getMemberRoles(member);
  return allowedRoles.some(r => roles.has(r));
}

module.exports = {
  getMemberRoles,
  getHighestRole,
  isChefia,
  isChefeMoradores,
  isOficial,
  isMorador,
  canManageInventory,
  canManageOperations,
  canViewAllMembers,
  canRegisterMaterial,
  requireRole,
  ROLE_HIERARCHY,
};
