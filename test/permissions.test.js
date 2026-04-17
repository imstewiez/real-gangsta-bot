'use strict';
/**
 * Testes de permissões — não tocam em DB nem Discord.
 * Sobrepõe valores no CONFIG em memória antes de chamar o engine.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Env mínimo para CONFIG carregar sem throw
process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';

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

// Override role IDs com valores de teste
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

describe('permissionEngine — predicados', () => {
  it('Manda-Chuva é command + oficial + patrão di zona', () => {
    const m = fakeMember('R_MC');
    assert.equal(isCommand(m), true);
    assert.equal(isOficial(m), true);
    assert.equal(isPatraoDiZona(m), true);
    assert.equal(isBairrista(m), false);
  });
  it('OG é supervisor + oficial mas não command', () => {
    const m = fakeMember('R_OG');
    assert.equal(isCommand(m), false);
    assert.equal(isSupervisor(m), true);
    assert.equal(isOficial(m), true);
  });
  it('Patrão di Zona é patrão', () => {
    const m = fakeMember('R_PZ');
    assert.equal(isPatraoDiZona(m), true);
    assert.equal(isCommand(m), false);
    assert.equal(isSupervisor(m), false);
  });
  it('Young Blood é bairrista tier 1', () => {
    const m = fakeMember('R_YB', 'R_MOR_BASE');
    assert.equal(isBairrista(m), true);
    assert.equal(getBairristaTier(m), 'young_blood');
    assert.equal(getExactRole(m), 'young_blood');
  });
  it('Gangster Fodido retorna tier correcto', () => {
    const m = fakeMember('R_GF', 'R_MOR_BASE');
    assert.equal(getBairristaTier(m), 'gangster_fodido');
    assert.equal(getExactRole(m), 'gangster_fodido');
  });
});

describe('permissionEngine — capabilities', () => {
  it('canManageStructure apenas para Command', () => {
    assert.equal(canManageStructure(fakeMember('R_MC')), true);
    assert.equal(canManageStructure(fakeMember('R_OG')), false);
    assert.equal(canManageStructure(fakeMember('R_PZ')), false);
  });
  it('canManageBairro inclui Patrão di Zona, supervisores e comando', () => {
    assert.equal(canManageBairro(fakeMember('R_PZ')), true);
    assert.equal(canManageBairro(fakeMember('R_OG')), true);
    assert.equal(canManageBairro(fakeMember('R_MC')), true);
    assert.equal(canManageBairro(fakeMember('R_YB', 'R_MOR_BASE')), false);
  });
  it('canRegisterMaterial é true para qualquer membro com role core', () => {
    assert.equal(canRegisterMaterial(fakeMember('R_YB')), true);
    assert.equal(canRegisterMaterial(fakeMember('R_MC')), true);
    assert.equal(canRegisterMaterial(fakeMember()), false);
  });
});

describe('permissionEngine — getMemberRoles', () => {
  it('resolve múltiplos grupos em simultâneo', () => {
    const m = fakeMember('R_OG', 'R_GF', 'R_MOR_BASE');
    const roles = getMemberRoles(m);
    assert.equal(roles.has('supervisor'), true);
    assert.equal(roles.has('bairrista'), true);
  });
});
