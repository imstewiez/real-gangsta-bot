'use strict';
/**
 * Valida a máquina de estados das saídas — transições permitidas vs proibidas.
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolved(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

const state = { status: 'aberta' };

require.cache[resolved('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async fn => fn({ query: async () => ({ rows: [] }) }),
  },
};

require.cache[resolved('repositories/index.js')] = {
  exports: {
    memberRepo: {},
    inventoryRepo: {},
    saidaRepo: {
      findById: async id => (id === 999 ? null : { id, status: state.status }),
      updateStatus: async (id, status) => ({ id, status }),
      getMaterialSummary: async () => ({}),
      getParticipants: async () => [],
      closeSaida: async (id, data) => ({ id, status: 'concluida', ...data }),
    },
    operationRepo: {},
    killRepo: {},
    spotStatsRepo: { applyIncrement: async () => ({}) },
    memberSaidaStatsRepo: { applyIncrement: async () => ({}) },
    memberAnalyticsRepo: {},
    rankingRepo: {},
    auditRepo: {},
    jobRepo: {},
    availabilityRepo: {},
    radioRepo: {},
    stickyRepo: {},
  },
};
require.cache[resolved('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {}, sendAuditToChannel: async () => {} },
};
require.cache[resolved('lib/metrics.js')] = {
  exports: new Proxy({}, { get: () => ({ inc: () => {}, set: () => {} }) }),
};
require.cache[resolved('inventory/stockNotifier.js')] = {
  exports: { notifyMovement: async () => {}, setClient: () => {}, publishStockSummary: async () => {} },
};

const {
  startSaida,
  closeSaida,
  cancelSaida,
  _assertTransition,
  ALLOWED_TRANSITIONS,
} = require('../src/saidas/saidaEngine');

describe('saida state machine — transições', () => {
  beforeEach(() => {
    state.status = 'aberta';
  });

  it('ALLOWED_TRANSITIONS mapeia estados corretamente', () => {
    assert.ok(ALLOWED_TRANSITIONS.aberta.has('em_curso'));
    assert.ok(ALLOWED_TRANSITIONS.aberta.has('cancelada'));
    assert.ok(ALLOWED_TRANSITIONS.em_curso.has('concluida'));
    assert.equal(ALLOWED_TRANSITIONS.concluida.size, 0);
    assert.equal(ALLOWED_TRANSITIONS.cancelada.size, 0);
  });

  it('aberta → em_curso: ok', async () => {
    state.status = 'aberta';
    const r = await _assertTransition(1, 'em_curso');
    assert.equal(r.status, 'aberta');
  });

  it('concluida → aberta: proibido', async () => {
    state.status = 'concluida';
    await assert.rejects(_assertTransition(1, 'aberta'), /Transição proibida/);
  });

  it('cancelada → concluida: proibido', async () => {
    state.status = 'cancelada';
    await assert.rejects(_assertTransition(1, 'concluida'), /Transição proibida/);
  });

  it('em_curso → em_curso: rejeita (evita re-entrância)', async () => {
    state.status = 'em_curso';
    await assert.rejects(_assertTransition(1, 'em_curso'), /Transição proibida/);
  });

  it('saída inexistente atira', async () => {
    await assert.rejects(_assertTransition(999, 'concluida'), /não existe/);
  });

  it('closeSaida numa saída já concluída rejeita', async () => {
    state.status = 'concluida';
    await assert.rejects(closeSaida(1, { result: 'vitoria' }, 'a'), /Transição proibida/);
  });

  it('startSaida em cancelada rejeita', async () => {
    state.status = 'cancelada';
    await assert.rejects(startSaida(1, 'a'), /Transição proibida/);
  });
});
