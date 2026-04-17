'use strict';
/**
 * End-to-end de saídas — fecho completo com participantes reais, scoring,
 * MVP, actualização de projections (spot_stats + member_saida_stats),
 * reconciliação, e publish ticker.
 *
 * Usa stubs de repos, mas valida que closeSaida propaga tudo correctamente
 * em vez de testar peças isoladas.
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

// Estado mutável partilhado pelos stubs — simula tabelas em memória.
const state = {
  summary: {},
  participants: [],
  participantUpdates: [],
  closedPayload: null,
  spotIncrements: [],
  memberIncrements: [],
  publishCalls: [],
};

require.cache[resolved('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async fn => fn({ query: async () => ({ rows: [] }) }),
  },
};

const stubSaidaRepo = {
  getMaterialSummary: async () => state.summary,
  getParticipants: async () => state.participants,
  // findById — devolve saída em status 'em_liquidacao' por default (permite finalizeSaida).
  // Testes podem override state.saidaStatus e state.saidaFields para testar outros caminhos.
  findById: async id => ({ id, status: state.saidaStatus || 'em_liquidacao', result: null, spot: null, ...state.saidaFields }),
  closeSaida: async (id, data) => {
    state.closedPayload = { id, ...data };
    // Simula retorno da row completa (inclui campos pré-existentes como spot).
    return { id, status: 'concluida', ...state.saidaFields, ...data };
  },
  updateParticipant: async (id, mid, fields) => {
    state.participantUpdates.push({ saidaId: id, memberId: mid, fields });
    // Reflecte no estado para que getParticipants subsequentes mostrem o delta.
    const idx = state.participants.findIndex(p => p.member_id === mid);
    if (idx >= 0) Object.assign(state.participants[idx], fields);
    return { id: mid, ...fields };
  },
  addMaterial: async () => ({}),
  addParticipant: async () => ({}),
  findOpen: async () => [],
  findRecent: async () => [],
};

const stubSpotStatsRepo = {
  applyIncrement: async delta => {
    state.spotIncrements.push(delta);
    return {};
  },
};

const stubMemberSaidaStatsRepo = {
  applyIncrement: async delta => {
    state.memberIncrements.push(delta);
    return {};
  },
};

require.cache[resolved('repositories/index.js')] = {
  exports: {
    memberRepo: { findByDiscordId: async () => null, findById: async () => null, create: async x => ({ id: 1, ...x }) },
    inventoryRepo: {
      recordMovement: async () => ({}),
      getItemById: async () => ({ id: 1, name: 'mock', estimated_value: 100 }),
      getStockForItem: async () => 0,
    },
    saidaRepo: stubSaidaRepo,
    operationRepo: stubSaidaRepo,
    killRepo: {},
    spotStatsRepo: stubSpotStatsRepo,
    memberSaidaStatsRepo: stubMemberSaidaStatsRepo,
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

const { finalizeSaida } = require('../src/saidas/saidaEngine');

describe('saida end-to-end — vitória com 3 participantes', () => {
  beforeEach(() => {
    state.summary = {};
    state.participants = [];
    state.participantUpdates = [];
    state.closedPayload = null;
    state.spotIncrements = [];
    state.memberIncrements = [];
    state.saidaStatus = 'em_liquidacao';
    state.saidaFields = {};
  });

  it('calcula valores, scores, MVP, e dispara os 2 projections', async () => {
    state.summary = {
      fornecido: { total: 6, weightedTotal: 600 },
      devolvido: { total: 4, weightedTotal: 400 },
      perdido: { total: 1, weightedTotal: 100 },
      consumido: { total: 1, weightedTotal: 50 },
    };
    state.participants = [
      {
        member_id: 10,
        display_name: 'Killer',
        kills: 4,
        survived: true,
        died: false,
        issued_value: 200,
        returned_value: 200,
        lost_value: 0,
        consumed_value: 0,
      },
      {
        member_id: 20,
        display_name: 'Vivo',
        kills: 1,
        survived: true,
        died: false,
        issued_value: 200,
        returned_value: 150,
        lost_value: 0,
        consumed_value: 50,
      },
      {
        member_id: 30,
        display_name: 'Morto',
        kills: 0,
        survived: false,
        died: true,
        issued_value: 200,
        returned_value: 50,
        lost_value: 100,
        consumed_value: 0,
      },
    ];

    state.saidaFields = {
      result: 'vitoria',
      had_fight: true,
      spot: 'Docks',
      our_kills: 5,
      deaths: 1,
    };

    const result = await finalizeSaida(123, 'actor-1');

    // Valores económicos na saída fechada
    assert.equal(result.values.supplied, 600);
    assert.equal(result.values.returned, 400);
    assert.equal(result.values.lost, 100);
    assert.equal(result.values.consumed, 50);
    assert.equal(result.values.net, 400 - 100 - 50);
    assert.equal(result.values.was_profitable, true);

    // Scores/MVP foram persistidos para cada participante
    assert.equal(state.participantUpdates.length, 3);
    const mvpUpdate = state.participantUpdates.find(u => u.fields.mvp_flag);
    assert.ok(mvpUpdate, 'pelo menos um MVP');
    assert.equal(mvpUpdate.memberId, 10, 'MVP é o Killer (5 kills, devolveu tudo)');

    // spot_stats actualizado 1 vez
    assert.equal(state.spotIncrements.length, 1);
    assert.equal(state.spotIncrements[0].spot, 'Docks');
    assert.equal(state.spotIncrements[0].result, 'vitoria');
    assert.equal(state.spotIncrements[0].net, 250);
    assert.equal(state.spotIncrements[0].bestMemberId, 10);

    // member_saida_stats actualizado 1x por participante
    assert.equal(state.memberIncrements.length, 3);
    const killerInc = state.memberIncrements.find(i => i.memberId === 10);
    assert.equal(killerInc.kills, 4);
    assert.equal(killerInc.mvp, true);
    const mortoInc = state.memberIncrements.find(i => i.memberId === 30);
    assert.equal(mortoInc.survived, false);
  });

  it('fecho sem spot não incrementa spot_stats', async () => {
    state.summary = { fornecido: { weightedTotal: 100 }, devolvido: { weightedTotal: 100 } };
    state.participants = [{ member_id: 1, kills: 0, survived: true, died: false }];
    state.saidaFields = { result: 'sem_conflito' };
    const closed = await finalizeSaida(200, 'a');
    assert.equal(closed.values.net, 100);
    assert.equal(state.spotIncrements.length, 0, 'sem spot → no-op');
    assert.equal(state.memberIncrements.length, 1, 'member stats sempre');
  });

  it('reconciliação detecta material unaccounted no resultado', async () => {
    state.summary = {
      fornecido: { total: 10, weightedTotal: 1000 },
      devolvido: { total: 5, weightedTotal: 500 },
      perdido: { total: 2, weightedTotal: 200 },
      consumido: { total: 0, weightedTotal: 0 },
    };
    state.participants = [];
    state.saidaFields = { result: 'empate', spot: 'Warehouse' };
    const closed = await finalizeSaida(300, 'a');
    assert.equal(closed.reconciliation.unaccounted, 3, '10-5-2-0=3 unaccounted');
  });

  it('derrota com mortos — net negativo marca was_profitable=false', async () => {
    state.summary = {
      fornecido: { weightedTotal: 500 },
      devolvido: { weightedTotal: 100 },
      perdido: { weightedTotal: 400 },
      consumido: { weightedTotal: 0 },
    };
    state.participants = [
      { member_id: 1, kills: 0, survived: false, died: true, issued_value: 250, returned_value: 0, lost_value: 250 },
      { member_id: 2, kills: 0, survived: false, died: true, issued_value: 250, returned_value: 0, lost_value: 150 },
    ];
    state.saidaFields = { result: 'derrota', spot: 'Ambush' };
    const closed = await finalizeSaida(400, 'a');
    assert.equal(closed.values.net, 100 - 400 - 0);
    assert.equal(closed.values.was_profitable, false);
    // member stats incrementados com survived=false
    const allDead = state.memberIncrements.every(i => i.survived === false);
    assert.ok(allDead);
  });

  it('MVP com empate de kills — bonus de sobrevivência decide', async () => {
    // Dois nomes com mesma performance bruta, mas um sobreviveu.
    state.summary = { fornecido: { weightedTotal: 200 }, devolvido: { weightedTotal: 200 } };
    state.participants = [
      { member_id: 1, kills: 2, survived: false, died: true, issued_value: 100, returned_value: 0, lost_value: 100 },
      { member_id: 2, kills: 2, survived: true, died: false, issued_value: 100, returned_value: 100 },
    ];
    state.saidaFields = { result: 'vitoria', spot: 'Plaza' };
    const closed = await finalizeSaida(500, 'a');
    const mvpUpdate = state.participantUpdates.find(u => u.fields.mvp_flag);
    assert.ok(mvpUpdate, 'há MVP');
    assert.equal(mvpUpdate.memberId, 2, 'empate de kills → vivo com disciplina 100% ganha');
    assert.equal(state.spotIncrements[0].bestMemberId, 2);
  });

  it('MVP premia morto com muito mais kills que vivo passivo', async () => {
    // Morto com 10 kills é lenda — supera vivo passivo. O bot regista-o.
    state.summary = { fornecido: { weightedTotal: 200 }, devolvido: { weightedTotal: 100 } };
    state.participants = [
      { member_id: 1, kills: 10, survived: false, died: true, issued_value: 100, returned_value: 0, lost_value: 100 },
      { member_id: 2, kills: 0, survived: true, died: false, issued_value: 100, returned_value: 100 },
    ];
    state.saidaFields = { result: 'vitoria', spot: 'Plaza2' };
    const closed = await finalizeSaida(510, 'a');
    const mvpUpdate = state.participantUpdates.find(u => u.fields.mvp_flag);
    assert.ok(mvpUpdate, 'há MVP');
    assert.equal(mvpUpdate.memberId, 1, 'morto com 10 kills > vivo sem kills');
  });
});
