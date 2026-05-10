'use strict';
/**
 * Testes unitários do PvP Rating System.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  TIERS, BASE_RATING, RATING_FLOOR,
  calculateTier, calculateSessionDelta,
} = require('../../../src/saidas/saidaPvPRating');

describe('saidaPvPRating — calculateTier', () => {
  it('S tier para 1800+', () => {
    assert.strictEqual(calculateTier(1800).tier, 'S');
    assert.strictEqual(calculateTier(2000).tier, 'S');
  });

  it('A tier para 1500–1799', () => {
    assert.strictEqual(calculateTier(1500).tier, 'A');
    assert.strictEqual(calculateTier(1799).tier, 'A');
  });

  it('B tier para 1200–1499', () => {
    assert.strictEqual(calculateTier(1200).tier, 'B');
    assert.strictEqual(calculateTier(1499).tier, 'B');
  });

  it('C tier para 900–1199', () => {
    assert.strictEqual(calculateTier(900).tier, 'C');
    assert.strictEqual(calculateTier(1199).tier, 'C');
  });

  it('D tier para 600–899', () => {
    assert.strictEqual(calculateTier(600).tier, 'D');
    assert.strictEqual(calculateTier(899).tier, 'D');
  });

  it('E tier para 200–599 e abaixo', () => {
    assert.strictEqual(calculateTier(200).tier, 'E');
    assert.strictEqual(calculateTier(599).tier, 'E');
    assert.strictEqual(calculateTier(0).tier, 'E');
  });
});

describe('saidaPvPRating — calculateSessionDelta', () => {
  it('base: vivo, 0 kills, sem vitória = 20 (survived bonus)', () => {
    assert.strictEqual(calculateSessionDelta({ kills: 0, survived: true, victory: null, mvp: false, hadFight: true }), 20);
  });

  it('vivo, 2 kills, vitória = 20 + 30 + 25 = 75', () => {
    assert.strictEqual(calculateSessionDelta({ kills: 2, survived: true, victory: true, mvp: false, hadFight: true }), 75);
  });

  it('morto, 1 kill, derrota = 15 - 30 - 10 = -25', () => {
    assert.strictEqual(calculateSessionDelta({ kills: 1, survived: false, victory: false, mvp: false, hadFight: true }), -25);
  });

  it('mvp adiciona +50', () => {
    const base = calculateSessionDelta({ kills: 0, survived: true, victory: true, mvp: false, hadFight: true });
    const mvp  = calculateSessionDelta({ kills: 0, survived: true, victory: true, mvp: true,  hadFight: true });
    assert.strictEqual(mvp - base, 50);
  });

  it('sem combate = 0 delta', () => {
    assert.strictEqual(calculateSessionDelta({ kills: 5, survived: true, victory: true, mvp: true, hadFight: false }), 0);
  });

  it('death penalty é -30 mesmo com kills', () => {
    const delta = calculateSessionDelta({ kills: 1, survived: false, victory: null, mvp: false, hadFight: true });
    assert.strictEqual(delta, -15); // 15 - 30
  });
});

describe('saidaPvPRating — constantes', () => {
  it('BASE_RATING = 1000', () => assert.strictEqual(BASE_RATING, 1000));
  it('RATING_FLOOR = 200', () => assert.strictEqual(RATING_FLOOR, 200));
  it('TIERS tem 6 tiers', () => assert.strictEqual(TIERS.length, 6));
  it('TIERS ordenados desc por min', () => {
    for (let i = 1; i < TIERS.length; i++) {
      assert.ok(TIERS[i - 1].min > TIERS[i].min, `TIERS[${i-1}].min > TIERS[${i}].min`);
    }
  });
});
