'use strict';
const { query, queryWithTransaction } = require('./db');
const { warn } = require('./logger');
const metrics = require('./lib/metrics');

/**
 * Generate a stable integer hash from a string key for pg_advisory_lock.
 * PostgreSQL advisory locks use bigint keys.
 */
function hashKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash;
}

/**
 * Execute a function while holding an advisory lock on the given key.
 * Uses pg_advisory_xact_lock within a transaction — lock auto-releases on commit/rollback.
 *
 * @param {string} lockKey - e.g. 'inventory:movement:123456789'
 * @param {(client: object) => Promise<any>} fn - function to execute under lock
 * @param {number} [timeoutMs=10000] - lock acquisition timeout
 * @returns {Promise<any>} result of fn
 */
async function withAdvisoryLock(lockKey, fn, timeoutMs = 10000) {
  const lockId = hashKey(lockKey);

  return queryWithTransaction(async client => {
    // Set lock timeout
    await client.query(`SET LOCAL lock_timeout = '${timeoutMs}ms'`);

    // Acquire advisory lock (blocks until available or timeout)
    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [lockId]);
      metrics.advisoryLockAcquired.inc();
    } catch (e) {
      if (e.code === '55P03') {
        // lock_not_available
        metrics.advisoryLockTimeout.inc();
        warn(`[AdvisoryLock] Timeout on '${lockKey}' (id=${lockId}) — another operation is in progress`);
        throw new Error(`Lock timeout on '${lockKey}' — another operation is in progress`);
      }
      throw e;
    }

    // Execute the protected function
    return fn(client);
  });
}

/**
 * Try to acquire an advisory lock without blocking.
 * Returns true if lock was acquired, false if another process holds it.
 */
async function tryAdvisoryLock(lockKey) {
  const lockId = hashKey(lockKey);
  const result = await query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
  return result.rows[0]?.acquired === true;
}

/**
 * Release a non-transactional advisory lock.
 */
async function releaseAdvisoryLock(lockKey) {
  const lockId = hashKey(lockKey);
  await query('SELECT pg_advisory_unlock($1)', [lockId]);
}

module.exports = {
  withAdvisoryLock,
  tryAdvisoryLock,
  releaseAdvisoryLock,
  hashKey,
};
