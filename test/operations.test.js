'use strict';
/**
 * Testes do operationEngine — foco em reconcileOperationMaterials, que
 * detecta material não contabilizado no fecho.
 */

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

const repoState = { summary: {} };

require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
  },
};
require.cache[resolvedPath('repositories/index.js')] = {
  exports: {
    memberRepo: {}, inventoryRepo: { recordMovement: async () => ({}) },
    operationRepo: {
      getMaterialSummary: async () => repoState.summary,
      closeOperation: async (id) => ({ id, status: 'concluida' }),
    },
    rankingRepo: {}, auditRepo: {}, jobRepo: {}, availabilityRepo: {},
    radioRepo: {}, stickyRepo: {},
  },
};
require.cache[resolvedPath('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {} },
};
require.cache[resolvedPath('lib/metrics.js')] = {
  exports: new Proxy({}, { get: () => ({ inc: () => {}, set: () => {} }) }),
};

const { reconcileOperationMaterials, closeOperation } = require('../src/operations/operationEngine');

describe('operationEngine — reconcileOperationMaterials', () => {
  it('soma cero quando tudo bate certo', async () => {
    repoState.summary = {
      fornecido: { total: 10, weightedTotal: 0 },
      devolvido: { total: 10, weightedTotal: 0 },
    };
    const r = await reconcileOperationMaterials(99);
    assert.equal(r.fornecido, 10);
    assert.equal(r.devolvido, 10);
    assert.equal(r.unaccounted, 0);
  });

  it('detecta material não contabilizado', async () => {
    repoState.summary = {
      fornecido: { total: 50, weightedTotal: 0 },
      devolvido: { total: 30, weightedTotal: 0 },
      perdido: { total: 5, weightedTotal: 0 },
      consumido: { total: 5, weightedTotal: 0 },
    };
    const r = await reconcileOperationMaterials(99);
    // 50 - 30 - 5 - 5 = 10
    assert.equal(r.unaccounted, 10);
  });

  it('soma 0 quando direcção devolvido > fornecido (clamp)', async () => {
    repoState.summary = {
      fornecido: { total: 5, weightedTotal: 0 },
      devolvido: { total: 10, weightedTotal: 0 },
    };
    const r = await reconcileOperationMaterials(99);
    assert.equal(r.unaccounted, 0); // clamp Math.max(0, ...)
  });

  it('zero entries', async () => {
    repoState.summary = {};
    const r = await reconcileOperationMaterials(99);
    assert.equal(r.fornecido, 0);
    assert.equal(r.unaccounted, 0);
  });
});

describe('operationEngine — closeOperation devolve reconciliation', () => {
  it('inclui reconciliation no resultado', async () => {
    repoState.summary = {
      fornecido: { total: 20, weightedTotal: 0 },
      devolvido: { total: 15, weightedTotal: 0 },
    };
    const op = await closeOperation(123, {}, 'actor-1');
    assert.ok(op.reconciliation);
    assert.equal(op.reconciliation.unaccounted, 5);
  });
});
