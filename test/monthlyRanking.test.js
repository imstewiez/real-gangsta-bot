'use strict';
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolved(rel) { return require.resolve(path.join(__dirname, '..', 'src', rel)); }

require.cache[resolved('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
  },
};

const { monthBounds, prevMonthBounds } = require('../src/repositories/monthlyRanking');

describe('monthlyRanking — bounds', () => {
  it('monthBounds para meio do mês devolve início e fim correctos', () => {
    const b = monthBounds(new Date('2026-04-15T12:00:00Z'));
    assert.equal(b.start, '2026-04-01');
    assert.equal(b.end, '2026-04-30');
  });

  it('monthBounds lida com Fevereiro (28 dias)', () => {
    const b = monthBounds(new Date('2026-02-14T12:00:00Z'));
    assert.equal(b.start, '2026-02-01');
    assert.equal(b.end, '2026-02-28');
  });

  it('monthBounds lida com Fevereiro bissexto', () => {
    const b = monthBounds(new Date('2024-02-14T12:00:00Z'));
    assert.equal(b.start, '2024-02-01');
    assert.equal(b.end, '2024-02-29');
  });

  it('monthBounds lida com Dezembro → Janeiro', () => {
    const b = monthBounds(new Date('2026-12-31T23:00:00Z'));
    assert.equal(b.start, '2026-12-01');
    assert.equal(b.end, '2026-12-31');
  });

  it('prevMonthBounds retorna mês anterior', () => {
    const b = prevMonthBounds(new Date('2026-04-15T12:00:00Z'));
    assert.equal(b.start, '2026-03-01');
    assert.equal(b.end, '2026-03-31');
  });

  it('prevMonthBounds em Janeiro retorna Dezembro do ano anterior', () => {
    const b = prevMonthBounds(new Date('2026-01-15T12:00:00Z'));
    assert.equal(b.start, '2025-12-01');
    assert.equal(b.end, '2025-12-31');
  });
});
