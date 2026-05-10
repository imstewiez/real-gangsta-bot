'use strict';
/**
 * Testes unitários do Smart Team Selector.
 */

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', '..', '..', 'src', rel));
}

// Stub DB
require.cache[resolvedPath('db.js')] = {
  exports: {
    query: async () => ({ rows: [] }),
    queryWithTransaction: async fn => fn({ query: async () => ({ rows: [] }) }),
  },
};

// Stub PvP Rating
require.cache[resolvedPath('saidas/saidaPvPRating.js')] = {
  exports: {
    getRating: async () => ({ rating: 1000, tier: 'E' }),
  },
};

const { selectTeams, persistSelection, MAX_FIGHTERS } = require('../../../src/saidas/saidaTeamSelector');

describe('saidaTeamSelector — selectTeams', () => {
  it('sem participantes devolve arrays vazios', async () => {
    const db = require('../../../src/db');
    const origQuery = db.query;
    db.query = async () => ({ rows: [] });

    const result = await selectTeams(999);
    assert.deepStrictEqual(result.fighters, []);
    assert.deepStrictEqual(result.workers, []);

    db.query = origQuery;
  });

  it('respeita MAX_FIGHTERS = 12', () => {
    assert.strictEqual(MAX_FIGHTERS, 12);
  });
});

describe('saidaTeamSelector — persistSelection', () => {
  it('atualiza fighters e workers na DB', async () => {
    const db = require('../../../src/db');
    const origTx = db.queryWithTransaction;
    const calls = [];
    db.queryWithTransaction = async fn => {
      const client = { query: async (sql, params) => {
        calls.push({ sql: sql.slice(0, 60), params });
        return { rows: [{ id: 1 }] };
      }};
      return fn(client);
    };

    await persistSelection(1, {
      fighters: [{ participant: { member_id: 1 }, score: 100, stats: { pvp_rating: 1000 } }],
      workers: [{ participant: { member_id: 2 }, score: 50 }],
      scored: [
        { participant: { member_id: 1 }, score: 100 },
        { participant: { member_id: 2 }, score: 50 },
      ],
    });

    // Deve haver UPDATEs para fighters e workers
    const updates = calls.filter(c => c.sql.includes('UPDATE'));
    assert.ok(updates.length >= 2, `Esperava >=2 UPDATEs, obtive ${updates.length}`);

    db.queryWithTransaction = origTx;
  });
});
