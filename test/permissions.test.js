'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= '12345678901234567';

const CONFIG = require('../src/config');
const {
  getMemberRoles,
  getExactRole,
  getBairristaTier,
  isCommand,
  isSupervisor,
  isPatraoDiZona,
  isBairrista,
  isOficial,
  canManageStructure,
  canManageBairro,
  canRegisterMaterial,
} = require('../src/permissions/permissionEngine');

CONFIG.MANDA_CHUVA_ROLE_ID = 'R_MC';
CONFIG.KINGPIN_ROLE_ID = 'R_KP';
CONFIG.OG_ROLE_ID = 'R_OG';
CONFIG.REAL_GANGSTER_ROLE_ID = 'R_RG';
CONFIG.PATRAO_DI_ZONA_ROLE_ID = 'R_PZ';
CONFIG.YOUNG_BLOOD_ROLE_ID = 'R_YB';
CONFIG.O_GUNAO_ROLE_ID = 'R_GUN';
CONFIG.GANGSTER_FODIDO_ROLE_ID = 'R_GF';
CONFIG.BAIRRISTAS_BASE_ROLE_ID = 'R_MOR_BASE';

function fakeMember(...roleIds) {
  return { roles: { cache: new Map(roleIds.map(id => [id, { id }])) } };
}

describe('permissionEngine predicates', () => {
  it('Manda-Chuva is command and officer, but not exact Patrao di Zona', () => {
    const member = fakeMember('R_MC');
    assert.equal(isCommand(member), true);
    assert.equal(isOficial(member), true);
    assert.equal(isPatraoDiZona(member), false);
    assert.equal(canManageBairro(member), true);
    assert.equal(isBairrista(member), false);
  });

  it('OG is supervisor and officer but not command', () => {
    const member = fakeMember('R_OG');
    assert.equal(isCommand(member), false);
    assert.equal(isSupervisor(member), true);
    assert.equal(isOficial(member), true);
  });

  it('Patrao di Zona is the exact neighbourhood manager role', () => {
    const member = fakeMember('R_PZ');
    assert.equal(isPatraoDiZona(member), true);
    assert.equal(isCommand(member), false);
    assert.equal(isSupervisor(member), false);
  });

  it('Young Blood is bairrista tier 1', () => {
    const member = fakeMember('R_YB', 'R_MOR_BASE');
    assert.equal(isBairrista(member), true);
    assert.equal(getBairristaTier(member), 'young_blood');
    assert.equal(getExactRole(member), 'young_blood');
  });

  it('Gangster Fodido returns the correct tier', () => {
    const member = fakeMember('R_GF', 'R_MOR_BASE');
    assert.equal(getBairristaTier(member), 'gangster_fodido');
    assert.equal(getExactRole(member), 'gangster_fodido');
  });
});

describe('permissionEngine capabilities', () => {
  it('canManageStructure is command-only', () => {
    assert.equal(canManageStructure(fakeMember('R_MC')), true);
    assert.equal(canManageStructure(fakeMember('R_OG')), false);
    assert.equal(canManageStructure(fakeMember('R_PZ')), false);
  });

  it('canManageBairro includes Patrao di Zona, supervisors, and command', () => {
    assert.equal(canManageBairro(fakeMember('R_PZ')), true);
    assert.equal(canManageBairro(fakeMember('R_OG')), true);
    assert.equal(canManageBairro(fakeMember('R_MC')), true);
    assert.equal(canManageBairro(fakeMember('R_YB', 'R_MOR_BASE')), false);
  });

  it('canRegisterMaterial stays disabled in the minimal runtime', () => {
    assert.equal(canRegisterMaterial(fakeMember('R_YB')), false);
    assert.equal(canRegisterMaterial(fakeMember('R_MC')), false);
    assert.equal(canRegisterMaterial(fakeMember()), false);
  });
});

describe('permissionEngine getMemberRoles', () => {
  it('resolves supervisor and member tier groups together', () => {
    const roles = getMemberRoles(fakeMember('R_OG', 'R_GF', 'R_MOR_BASE'));
    assert.equal(roles.has('supervisor'), true);
    assert.equal(roles.has('member_tier'), true);
  });
});
