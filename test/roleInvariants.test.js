'use strict';
/**
 * Testes de invariantes de roles — sem Discord, sem DB.
 * Substitui `queueMemberOp` e `logAudit` por stubs dentro do require cache
 * ANTES de carregar o módulo testado.
 */

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';

// Stub antes do require do módulo testado
function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

const queueOps = [];
require.cache[resolvedPath('discordQueue.js')] = {
  exports: {
    queueMemberOp: async (fn) => { queueOps.push('memberOp'); return fn && fn(); },
    queueChannelOp: async (fn) => { queueOps.push('channelOp'); return fn && fn(); },
  },
};

const auditCalls = [];
require.cache[resolvedPath('audit/auditEngine.js')] = {
  exports: {
    logAudit: async (entry) => { auditCalls.push(entry); },
    sendAuditToChannel: async () => {},
    getRecentLogs: async () => [],
  },
};

// CONFIG — garantir IDs coerentes para o teste
const CONFIG = require('../src/config');
CONFIG.MORADORES_BASE_ROLE_ID = 'R_MOR_BASE';
CONFIG.YOUNG_BLOOD_ROLE_ID = 'R_YB';
CONFIG.O_GUNAO_ROLE_ID = 'R_GUN';
CONFIG.GANGSTER_FODIDO_ROLE_ID = 'R_GF';
CONFIG.ENFORCE_ROLE_INVARIANTS = true;

const { ensureInvariants } = require('../src/members/roleInvariants');

function fakeGuildMember({ id = '123', roleIds = [] } = {}) {
  const calls = { add: [], remove: [] };
  const cache = new Map(roleIds.map(r => [r, { id: r }]));
  return {
    id,
    roles: {
      cache,
      add: async (roleId, reason) => {
        calls.add.push({ roleId, reason });
        cache.set(roleId, { id: roleId });
      },
      remove: async (roleId, reason) => {
        calls.remove.push({ roleId, reason });
        cache.delete(roleId);
      },
    },
    _calls: calls,
  };
}

describe('roleInvariants', () => {
  it('adiciona base Moradores quando falta e há tier', async () => {
    const gm = fakeGuildMember({ roleIds: ['R_YB'] });
    const result = await ensureInvariants(gm, { actor: 'test' });
    assert.equal(result.needsFix, true);
    assert.deepEqual(result.violations, ['tier_without_base_moradores']);
    assert.deepEqual(result.fixes, ['added_base_moradores']);
    assert.equal(gm._calls.add[0].roleId, 'R_MOR_BASE');
  });

  it('não mexe quando tem base + tier', async () => {
    const gm = fakeGuildMember({ roleIds: ['R_YB', 'R_MOR_BASE'] });
    const result = await ensureInvariants(gm);
    assert.equal(result.needsFix, false);
    assert.equal(gm._calls.add.length, 0);
    assert.equal(gm._calls.remove.length, 0);
  });

  it('remove tiers duplicados mantendo o mais alto', async () => {
    const gm = fakeGuildMember({ roleIds: ['R_YB', 'R_GUN', 'R_GF', 'R_MOR_BASE'] });
    const result = await ensureInvariants(gm);
    assert.equal(result.violations.includes('multiple_tiers'), true);
    // Keeps gangster_fodido (R_GF), removes young_blood + o_gunao
    const removed = gm._calls.remove.map(r => r.roleId).sort();
    assert.deepEqual(removed, ['R_GUN', 'R_YB']);
  });

  it('com YB+Gun (sem GF) mantém O Gunão (mid > entry YB)', async () => {
    const gm = fakeGuildMember({ roleIds: ['R_YB', 'R_GUN', 'R_MOR_BASE'] });
    const result = await ensureInvariants(gm);
    assert.equal(result.violations.includes('multiple_tiers'), true);
    const removed = gm._calls.remove.map(r => r.roleId);
    assert.deepEqual(removed, ['R_YB']);
    assert.equal(gm.roles.cache.has('R_GUN'), true);
  });

  it('dry-run não aplica mudanças', async () => {
    const gm = fakeGuildMember({ roleIds: ['R_YB'] });
    const result = await ensureInvariants(gm, { dryRun: true });
    assert.equal(result.needsFix, true);
    assert.equal(result.applied, false);
    assert.equal(gm._calls.add.length, 0);
  });
});
