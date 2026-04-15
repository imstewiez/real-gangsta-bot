'use strict';
/**
 * Testes ao cálculo de hybrid_score — valida os pesos e a forma da fórmula.
 */

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolvedPath(rel) { return require.resolve(path.join(__dirname, '..', 'src', rel)); }
require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
  },
};
require.cache[resolvedPath('repositories/index.js')] = {
  exports: {
    memberRepo: {}, inventoryRepo: {}, saidaRepo: {}, operationRepo: {},
    killRepo: {}, spotStatsRepo: {}, memberSaidaStatsRepo: {},
    rankingRepo: {}, auditRepo: {}, jobRepo: {}, availabilityRepo: {},
    radioRepo: {}, stickyRepo: {},
  },
};

const { computeHybridScore, WEIGHTS } = require('../src/rankings/rankingEngine');

describe('rankingEngine — hybrid_score', () => {
  it('pesos somam 1', () => {
    const total = WEIGHTS.contribuicao + WEIGHTS.performance + WEIGHTS.fiabilidade;
    assert.ok(Math.abs(total - 1.0) < 0.0001, `pesos devem somar 1, somam ${total}`);
  });

  it('só contribuição produz score positivo', () => {
    const s = computeHybridScore({
      weightedValue: 10000, killsCount: 0, winsCount: 0, lossCount: 0,
      netProfit: 0, saidasCount: 0, returnRate: 0, survivalRate: 0,
    });
    assert.ok(s > 0);
    // 10000 * 0.4 = 4000
    assert.equal(s, 4000);
  });

  it('só kills produz performance positiva', () => {
    const s = computeHybridScore({
      weightedValue: 0, killsCount: 5, winsCount: 0, lossCount: 0,
      netProfit: 0, saidasCount: 0, returnRate: 0, survivalRate: 0,
    });
    // performance = 5*10 = 50 → 50 * 0.4 = 20
    assert.equal(s, 20);
  });

  it('wins e losses têm sinal correcto', () => {
    const wins = computeHybridScore({
      weightedValue: 0, killsCount: 0, winsCount: 3, lossCount: 0,
      netProfit: 0, saidasCount: 0, returnRate: 0, survivalRate: 0,
    });
    const losses = computeHybridScore({
      weightedValue: 0, killsCount: 0, winsCount: 0, lossCount: 3,
      netProfit: 0, saidasCount: 0, returnRate: 0, survivalRate: 0,
    });
    assert.ok(wins > losses);
    assert.ok(losses < 0);
  });

  it('fiabilidade soma à escala correcta', () => {
    const s = computeHybridScore({
      weightedValue: 0, killsCount: 0, winsCount: 0, lossCount: 0,
      netProfit: 0, saidasCount: 0, returnRate: 100, survivalRate: 100,
    });
    // fiabilidade = 100*0.5 + 100*0.3 = 80 → 80 * 0.2 = 16
    assert.equal(s, 16);
  });

  it('membro com perfil equilibrado > membro só de contribuição', () => {
    const balanced = computeHybridScore({
      weightedValue: 5000, killsCount: 5, winsCount: 2, lossCount: 0,
      netProfit: 500, saidasCount: 3, returnRate: 80, survivalRate: 90,
    });
    const onlyContrib = computeHybridScore({
      weightedValue: 5000, killsCount: 0, winsCount: 0, lossCount: 0,
      netProfit: 0, saidasCount: 0, returnRate: 0, survivalRate: 0,
    });
    assert.ok(balanced > onlyContrib);
  });
});
