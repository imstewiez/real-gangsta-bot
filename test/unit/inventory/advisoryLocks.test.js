'use strict';
/**
 * Unit tests para withAdvisoryLock em src/shared/advisoryLocks.js.
 *
 * Stubamos queryWithTransaction para interceptar as queries. Validamos:
 *   - hashLockKey gera valor consistente e no intervalo [0, 2^31)
 *   - pg_try_advisory_xact_lock é chamado com a key hashed
 *   - Se lock adquirido → callback executa, COMMIT
 *   - Se lock não adquirido → throw, ROLLBACK
 *   - Se callback atirar → ROLLBACK
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', '..', '..', 'src', rel));
}

let _lockAcquired = true;
const _captured = [];

require.cache[resolvedPath('db.js')] = {
  exports: {
    queryWithTransaction: async fn => {
      _captured.push({ sql: 'BEGIN' });
      try {
        const result = await fn({
          query: async (sql, values) => {
            _captured.push({ sql, values });
            if (sql.includes('pg_try_advisory_xact_lock')) {
              return { rows: [{ acquired: _lockAcquired }] };
            }
            return { rows: [] };
          },
        });
        _captured.push({ sql: 'COMMIT' });
        return result;
      } catch (err) {
        _captured.push({ sql: 'ROLLBACK' });
        throw err;
      }
    },
  },
};

const { withAdvisoryLock, hashLockKey } = require('../../../src/shared/advisoryLocks');

describe('advisoryLocks', () => {
  beforeEach(() => {
    _captured.length = 0;
    _lockAcquired = true;
  });

  it('hashLockKey gera valor consistente e positivo', () => {
    const h1 = hashLockKey('inventory:123');
    const h2 = hashLockKey('inventory:123');
    assert.equal(h1, h2);
    assert.ok(Number.isInteger(h1));
    assert.ok(h1 >= 0);
    assert.ok(h1 < 2 ** 31);
  });

  it('hashLockKey strings diferentes geram valores diferentes', () => {
    const h1 = hashLockKey('inventory:123');
    const h2 = hashLockKey('inventory:124');
    assert.notEqual(h1, h2);
  });

  it('withAdvisoryLock adquire lock e executa callback', async () => {
    const result = await withAdvisoryLock('inventory:42', async () => 'done');
    assert.equal(result, 'done');
    const lockQuery = _captured.find(c => c.sql && c.sql.includes('pg_try_advisory_xact_lock'));
    assert.ok(lockQuery, 'deve chamar pg_try_advisory_xact_lock');
    assert.equal(lockQuery.values.length, 1);
    assert.equal(lockQuery.values[0], hashLockKey('inventory:42'));
    assert.ok(_captured.some(c => c.sql === 'COMMIT'));
  });

  it('withAdvisoryLock atira se lock não for adquirido', async () => {
    _lockAcquired = false;
    await assert.rejects(
      () => withAdvisoryLock('inventory:99', async () => 'done'),
      /Não foi possível adquirir o lock/
    );
    assert.ok(_captured.some(c => c.sql === 'ROLLBACK'));
    assert.ok(!_captured.some(c => c.sql === 'COMMIT'));
  });

  it('withAdvisoryLock faz ROLLBACK se callback atirar', async () => {
    await assert.rejects(
      () => withAdvisoryLock('inventory:1', async () => { throw new Error('boom'); }),
      /boom/
    );
    assert.ok(_captured.some(c => c.sql === 'ROLLBACK'));
    assert.ok(!_captured.some(c => c.sql === 'COMMIT'));
  });

  it('callback recebe client com .query', async () => {
    let seen = null;
    await withAdvisoryLock('inventory:2', async client => {
      seen = client;
      await client.query('SELECT 1');
    });
    assert.ok(seen);
    assert.equal(typeof seen.query, 'function');
  });
});
