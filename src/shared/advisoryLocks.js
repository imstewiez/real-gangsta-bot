'use strict';
/**
 * Advisory locks não-bloqueantes com pg_try_advisory_xact_lock.
 * O lock liberta-se automaticamente no COMMIT/ROLLBACK.
 */

const { queryWithTransaction } = require('../db');

function hashLockKey(lockKey) {
  const hashed = Array.from(lockKey).reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
  return Math.abs(hashed % (2 ** 31));
}

async function withAdvisoryLock(lockKey, fn) {
  const lockId = hashLockKey(lockKey);
  return queryWithTransaction(async client => {
    const res = await client.query('SELECT pg_try_advisory_xact_lock($1) AS acquired', [lockId]);
    if (!res.rows[0].acquired) {
      throw new Error(`Não foi possível adquirir o lock para ${lockKey}`);
    }
    return fn(client);
  });
}

module.exports = {
  withAdvisoryLock,
  hashLockKey,
};
