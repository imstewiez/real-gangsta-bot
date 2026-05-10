'use strict';
/**
 * Unit tests para computePercentileRanks — matemática de percentil.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computePercentileRanks } = require('../../../src/rankings/normalize');

describe('computePercentileRanks — matemática de percentil', () => {
  it('array vazio retorna vazio', () => {
    assert.deepEqual(computePercentileRanks([]), []);
  });

  it('topo recebe 1000 pontos', () => {
    const members = [
      { id: 1, hybridScore: 100 },
      { id: 2, hybridScore: 50 },
      { id: 3, hybridScore: 10 },
    ];
    const result = computePercentileRanks(members);
    assert.equal(result[0].id, 1);
    assert.equal(result[0].normalized_score, 1000);
    assert.equal(result[0].rank, 1);
  });

  it('último recebe 1000 / total', () => {
    const members = [
      { id: 1, hybridScore: 100 },
      { id: 2, hybridScore: 50 },
      { id: 3, hybridScore: 10 },
    ];
    const result = computePercentileRanks(members);
    const last = result[result.length - 1];
    assert.equal(last.id, 3);
    assert.equal(last.rank, 3);
    assert.equal(last.normalized_score, Math.round((1 / 3) * 1000 * 100) / 100);
  });

  it('ordena por hybridScore descendente', () => {
    const members = [
      { id: 1, hybridScore: 10 },
      { id: 2, hybridScore: 100 },
      { id: 3, hybridScore: 50 },
    ];
    const result = computePercentileRanks(members);
    assert.deepEqual(
      result.map(r => r.id),
      [2, 3, 1]
    );
  });

  it('fallback para weighted_value quando hybridScore é 0', () => {
    const members = [
      { id: 1, hybridScore: 0, weighted_value: 200 },
      { id: 2, hybridScore: 0, weighted_value: 100 },
    ];
    const result = computePercentileRanks(members);
    assert.equal(result[0].id, 1);
    assert.equal(result[0].normalized_score, 1000);
    assert.equal(result[1].id, 2);
    assert.equal(result[1].normalized_score, 500);
  });

  it('não altera objectos originais (retorna novos)', () => {
    const members = [{ id: 1, hybridScore: 10 }];
    const result = computePercentileRanks(members);
    assert.equal(result[0].normalized_score, 1000);
    assert.equal(members[0].normalized_score, undefined);
  });
});
