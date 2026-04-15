'use strict';
/**
 * Testes do saidaEngine e saidaScoring — foco em reconciliação de material,
 * cálculo de valores económicos no fecho, scores de participante e MVP.
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

// Shared stub state (mutável entre testes)
const repoState = { summary: {}, participants: [], updates: [] };

require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
  },
};

const stubSaidaRepo = {
  getMaterialSummary: async () => repoState.summary,
  getParticipants: async () => repoState.participants,
  findById: async (id) => ({ id, status: 'em_curso', result: null, spot: null }),
  closeSaida: async (id, data) => ({ id, status: 'concluida', ...data }),
  updateParticipant: async (id, mid, fields) => { repoState.updates.push({ mid, fields }); return { id: mid, ...fields }; },
  addMaterial: async () => ({}),
  addParticipant: async () => ({}),
  findOpen: async () => [],
  findRecent: async () => [],
};

require.cache[resolvedPath('repositories/index.js')] = {
  exports: {
    memberRepo: { findByDiscordId: async () => null, create: async (x) => ({ id: 1, ...x }), findById: async () => null },
    inventoryRepo: { recordMovement: async () => ({}), getItemById: async () => ({ id: 1, name: 'mock', estimated_value: 100 }), getStockForItem: async () => 0 },
    saidaRepo: stubSaidaRepo,
    operationRepo: stubSaidaRepo, // alias legado
    killRepo: {},
    spotStatsRepo: { applyIncrement: async () => ({}) },
    memberSaidaStatsRepo: { applyIncrement: async () => ({}) },
    rankingRepo: {}, auditRepo: {}, jobRepo: {}, availabilityRepo: {},
    radioRepo: {}, stickyRepo: {},
  },
};
require.cache[resolvedPath('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {}, sendAuditToChannel: async () => {} },
};
require.cache[resolvedPath('lib/metrics.js')] = {
  exports: new Proxy({}, { get: () => ({ inc: () => {}, set: () => {} }) }),
};
require.cache[resolvedPath('inventory/stockNotifier.js')] = {
  exports: { notifyMovement: async () => {}, setClient: () => {}, publishStockSummary: async () => {} },
};

const { reconcileSaidaMaterials, closeSaida } = require('../src/saidas/saidaEngine');
const { computeSaidaScores } = require('../src/saidas/saidaScoring');

describe('saidaEngine — reconcileSaidaMaterials', () => {
  it('soma zero quando tudo bate certo', async () => {
    repoState.summary = {
      fornecido: { total: 10 }, devolvido: { total: 10 },
    };
    const r = await reconcileSaidaMaterials(99);
    assert.equal(r.fornecido, 10);
    assert.equal(r.devolvido, 10);
    assert.equal(r.unaccounted, 0);
  });

  it('detecta material não contabilizado', async () => {
    repoState.summary = {
      fornecido: { total: 50 }, devolvido: { total: 30 },
      perdido: { total: 5 }, consumido: { total: 5 },
    };
    const r = await reconcileSaidaMaterials(99);
    assert.equal(r.unaccounted, 10);
  });

  it('clamp quando devolvido > fornecido', async () => {
    repoState.summary = { fornecido: { total: 5 }, devolvido: { total: 10 } };
    const r = await reconcileSaidaMaterials(99);
    assert.equal(r.unaccounted, 0);
  });

  it('zero entries', async () => {
    repoState.summary = {};
    const r = await reconcileSaidaMaterials(99);
    assert.equal(r.fornecido, 0);
    assert.equal(r.unaccounted, 0);
  });
});

describe('saidaEngine — closeSaida com valores económicos', () => {
  it('calcula supplied/returned/lost/consumed/gross/net e was_profitable', async () => {
    repoState.summary = {
      fornecido: { total: 5, weightedTotal: 500 },
      devolvido: { total: 3, weightedTotal: 300 },
      perdido:   { total: 1, weightedTotal: 100 },
      consumido: { total: 1, weightedTotal: 50 },
    };
    repoState.participants = [];
    repoState.updates = [];

    const closed = await closeSaida(123, { result: 'vitoria' }, 'actor-1');
    assert.equal(closed.supplied_value, 500);
    assert.equal(closed.returned_value, 300);
    assert.equal(closed.lost_value, 100);
    assert.equal(closed.consumed_value, 50);
    assert.equal(closed.gross_value, 300);
    assert.equal(closed.net_value, 300 - 100 - 50); // 150
    assert.equal(closed.was_profitable, true);
  });

  it('marca was_profitable=false quando net < 0', async () => {
    repoState.summary = {
      fornecido: { total: 10, weightedTotal: 1000 },
      devolvido: { total: 1, weightedTotal: 100 },
      perdido:   { total: 8, weightedTotal: 800 },
    };
    repoState.participants = [];
    const closed = await closeSaida(124, { result: 'derrota' }, 'actor-1');
    assert.equal(closed.net_value, 100 - 800 - 0);
    assert.equal(closed.was_profitable, false);
  });
});

describe('saidaScoring — performance, discipline, MVP', () => {
  it('sobrevivente com kills tem performance > 0', () => {
    const scored = computeSaidaScores({
      participants: [
        { member_id: 1, display_name: 'A', kills: 2, survived: true, died: false, issued_value: 100, returned_value: 80 },
        { member_id: 2, display_name: 'B', kills: 0, survived: true, died: false, issued_value: 0, returned_value: 0 },
      ],
      result: 'vitoria',
      suppliedTotal: 100,
    });
    const a = scored.find(p => p.member_id === 1);
    assert.ok(a.performance_score > 0);
    assert.equal(a.discipline_score, 80); // 80/100 * 100
  });

  it('morto tem discount de performance', () => {
    const scored = computeSaidaScores({
      participants: [
        { member_id: 1, kills: 0, survived: false, died: true, issued_value: 100, returned_value: 0, lost_value: 100 },
      ],
      result: 'derrota',
    });
    assert.ok(scored[0].performance_score < 5);
    assert.equal(scored[0].net_material_delta, -100);
  });

  it('disciplina 100 quando não recebeu material', () => {
    const scored = computeSaidaScores({
      participants: [{ member_id: 1, kills: 1, survived: true, issued_value: 0 }],
      result: 'vitoria',
    });
    assert.equal(scored[0].discipline_score, 100);
  });

  it('MVP vai para quem tem maior performance_score e kills', () => {
    const scored = computeSaidaScores({
      participants: [
        { member_id: 1, display_name: 'Killer', kills: 5, survived: true, died: false, issued_value: 100, returned_value: 100 },
        { member_id: 2, display_name: 'Passivo', kills: 0, survived: true, died: false, issued_value: 100, returned_value: 100 },
      ],
      result: 'vitoria',
    });
    const mvp = scored.find(p => p.mvp_flag);
    assert.ok(mvp, 'deve haver um MVP');
    assert.equal(mvp.member_id, 1);
  });

  it('sem kills e sem disciplina não há MVP', () => {
    const scored = computeSaidaScores({
      participants: [
        { member_id: 1, kills: 0, survived: false, died: true, issued_value: 100, returned_value: 10, lost_value: 90 },
      ],
      result: 'derrota',
    });
    const mvp = scored.find(p => p.mvp_flag);
    assert.equal(mvp, undefined);
  });
});
