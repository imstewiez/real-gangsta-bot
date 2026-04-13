'use strict';
const CONFIG = require('../config');

// ── Hierarquia ──────────────────────────────────────────────────────────────
// Manda-Chuva > Kingpin > OG > Real Gangster > Patrão di Zona > Gangster Fodido > O Gunão > Young Blood

function getMemberRoles(member) {
  const roleIds = new Set(member.roles?.cache?.map(r => r.id) || []);
  const roles = new Set();

  if (CONFIG.CHEFIA_ROLE_IDS.some(id => roleIds.has(id))) roles.add('chefia');
  if (CONFIG.OFICIAL_ROLE_IDS.some(id => roleIds.has(id))) roles.add('oficial');
  if (CONFIG.CHEFE_MORADORES_ROLE_IDS.some(id => roleIds.has(id))) roles.add('chefe_moradores');
  if (CONFIG.MORADOR_ROLE_IDS.some(id => roleIds.has(id))) roles.add('morador');

  return roles;
}

function getMoradorTier(member) {
  const roleIds = new Set(member.roles?.cache?.map(r => r.id) || []);
  if (roleIds.has(CONFIG.GANGSTER_FODIDO_ROLE_ID)) return 'gangster_fodido';
  if (roleIds.has(CONFIG.O_GUNAO_ROLE_ID)) return 'o_gunao';
  if (roleIds.has(CONFIG.YOUNG_BLOOD_ROLE_ID)) return 'young_blood';
  return null;
}

function getExactRole(member) {
  const roleIds = new Set(member.roles?.cache?.map(r => r.id) || []);
  if (roleIds.has(CONFIG.MANDA_CHUVA_ROLE_ID)) return 'manda_chuva';
  if (roleIds.has(CONFIG.KINGPIN_ROLE_ID)) return 'kingpin';
  if (roleIds.has(CONFIG.OG_ROLE_ID)) return 'og';
  if (roleIds.has(CONFIG.REAL_GANGSTER_ROLE_ID)) return 'real_gangster';
  if (roleIds.has(CONFIG.PATRAO_DI_ZONA_ROLE_ID)) return 'patrao_di_zona';
  if (roleIds.has(CONFIG.GANGSTER_FODIDO_ROLE_ID)) return 'gangster_fodido';
  if (roleIds.has(CONFIG.O_GUNAO_ROLE_ID)) return 'o_gunao';
  if (roleIds.has(CONFIG.YOUNG_BLOOD_ROLE_ID)) return 'young_blood';
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

module.exports = {
  getMemberRoles,
  getMoradorTier,
  getExactRole,
  isChefia,
  isChefeMoradores,
  isOficial,
  isMorador,
  canManageInventory,
  canManageOperations,
  canViewAllMembers,
  canRegisterMaterial,
};
