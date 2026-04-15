'use strict';
/**
 * withCache — adds cache-aside logic to any async function.
 *
 * Usage:
 *   const { withCache } = require('../middleware/withCache');
 *   const cache = require('../cache');
 *
 *   const cachedGetRankings = withCache(
 *     (weekStart) => cache.KEYS.weeklyRanking(weekStart),
 *     getRankings,
 *     cache.TTL.LONG
 *   );
 *
 *   const rankings = await cachedGetRankings('2024-01-01');
 */

const cache = require('../cache');

/**
 * Wraps an async function with cache-aside logic.
 *
 * @param {(...args: any[]) => string} keyFn - Function that derives cache key from args
 * @param {Function} fn - Async function to wrap
 * @param {number} [ttlMs] - TTL in milliseconds (default: cache.TTL.MEDIUM)
 * @returns {Function} Wrapped async function with same signature as fn
 */
function withCache(keyFn, fn, ttlMs = cache.TTL.MEDIUM) {
  return async function cachedFn(...args) {
    const key = keyFn(...args);
    return cache.getOrSet(key, () => fn(...args), ttlMs);
  };
}

module.exports = { withCache };
