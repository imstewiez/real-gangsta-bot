'use strict';
/**
 * Unit tests para withAdvisoryLock em src/db.js.
 *
 * Stubamos o pool para interceptar as queries. Validamos:
 *   - String key → pg_advisory_xact_lock(hashtext($1)::int)
 *   - Number key → pg_advisory_xact_lock($1)
 *   - BEGIN antes do lock, COMMIT depois do callback
 *   - ROLLBACK se callback atira
 *   - Rejeita key de tipo inválido
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';
process.env.DISCORD_BOT_TOKEN ||= 'test';
process.env.DISCORD_GUILD_ID ||= 'test';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

// Stub pool antes de carregar db.js.
const _captured = [];
require.cache[resolvedPath('db.js')] = undefined;

// Não conseguimos stubar o `pg` global fácil; em vez disso mockamos o module
// depois de carregar o ficheiro real. O module exporta `pool`; substituímos
// o `connect` pelo nosso mock.
const db = require('../src/db');

function installMockConnect() {
  _captured.length = 0;
  const fakeClient = {
    query: async (sql, values) => {
      _captured.push({ sql, values });
      // Respostas esperadas:
      //   BEGIN → void
      //   pg_advisory_xact_lock → single row
      //   COMMIT → void
      //   ROLLBACK → void
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };
  db.pool.connect = async () => fakeClient;
}

describe('withAdvisoryLock', () => {
  beforeEach(() => installMockConnect());

  it('string key: chama pg_advisory_xact_lock com hashtext', async () => {
    const result = await db.withAdvisoryLock('promote:123', async () => 'done');
    assert.equal(result, 'done');

    const sqls = _captured.map(c => c.sql);
    assert.equal(sqls[0], 'BEGIN');
    assert.match(sqls[1], /pg_advisory_xact_lock\(hashtext\(\$1\)::int\)/);
    assert.deepEqual(_captured[1].values, ['promote:123']);
    assert.equal(sqls[sqls.length - 1], 'COMMIT');
  });

  it('number key: chama pg_advisory_xact_lock com bigint', async () => {
    await db.withAdvisoryLock(42, async () => null);

    const sqls = _captured.map(c => c.sql);
    assert.match(sqls[1], /pg_advisory_xact_lock\(\$1\)/);
    assert.ok(!sqls[1].includes('hashtext'));
    assert.deepEqual(_captured[1].values, [42]);
  });

  it('callback throw → ROLLBACK, não COMMIT', async () => {
    await assert.rejects(
      () =>
        db.withAdvisoryLock('err-test', async () => {
          throw new Error('boom');
        }),
      /boom/
    );
    const sqls = _captured.map(c => c.sql);
    assert.equal(sqls[sqls.length - 1], 'ROLLBACK');
    assert.ok(!sqls.includes('COMMIT'));
  });

  it('key não-string nem number → rejeita sem tocar na DB', async () => {
    await assert.rejects(() => db.withAdvisoryLock({ weird: true }, async () => 'x'), /key deve ser string ou number/);
    // BEGIN aconteceu (queryWithTransaction wrapper), mas o callback não.
    // Tem que haver ROLLBACK para limpar a transação.
    const sqls = _captured.map(c => c.sql);
    assert.ok(sqls.includes('BEGIN'));
    assert.ok(sqls.includes('ROLLBACK'));
  });

  it('retorna o valor do callback', async () => {
    const r = await db.withAdvisoryLock('return-test', async () => ({ ok: true, n: 7 }));
    assert.deepEqual(r, { ok: true, n: 7 });
  });

  it('callback recebe client com .query', async () => {
    let seen = null;
    await db.withAdvisoryLock('client-passed', async client => {
      seen = client;
      await client.query('SELECT 1');
    });
    assert.ok(seen);
    assert.equal(typeof seen.query, 'function');
  });
});
