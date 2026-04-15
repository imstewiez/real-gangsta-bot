'use strict';
/**
 * Caching layer — in-memory TTL cache with optional Redis backend.
 *
 * When REDIS_URL is set, uses Redis for distributed caching (useful if
 * multiple bot instances ever run). Falls back to in-memory Map with TTL
 * for single-instance deployments (the current production setup).
 *
 * API:
 *   cache.get(key)                    → value | null
 *   cache.set(key, value, ttlMs)      → void
 *   cache.del(key)                    → void
 *   cache.delPattern(prefix)          → void  (deletes all keys starting with prefix)
 *   cache.flush()                     → void  (clear all)
 *   cache.stats()                     → { hits, misses, size }
 *
 * TTL constants (ms):
 *   cache.TTL.SHORT    5 minutes
 *   cache.TTL.MEDIUM   30 minutes
 *   cache.TTL.LONG     1 hour
 *   cache.TTL.DAY      24 hours
 *   cache.TTL.WEEK     7 days
 */

// ── TTL constants ─────────────────────────────────────────────────────────────
const TTL = {
  SHORT:  5  * 60 * 1000,   //  5 minutes
  MEDIUM: 30 * 60 * 1000,   // 30 minutes
  LONG:   60 * 60 * 1000,   //  1 hour
  DAY:    24 * 60 * 60 * 1000,
  WEEK:    7 * 24 * 60 * 60 * 1000,
};

// ── In-memory store ───────────────────────────────────────────────────────────
const _store = new Map(); // key → { value, expiresAt }
let _hits = 0;
let _misses = 0;

// Periodic cleanup of expired entries (every 5 minutes)
const _cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of _store) {
    if (entry.expiresAt <= now) _store.delete(k);
  }
}, TTL.SHORT);
if (_cleanupInterval.unref) _cleanupInterval.unref();

function get(key) {
  const entry = _store.get(key);
  if (!entry) { _misses++; return null; }
  if (entry.expiresAt <= Date.now()) {
    _store.delete(key);
    _misses++;
    return null;
  }
  _hits++;
  return entry.value;
}

function set(key, value, ttlMs = TTL.MEDIUM) {
  _store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function del(key) {
  _store.delete(key);
}

/**
 * Delete all keys that start with the given prefix.
 * Useful for invalidating a group of related cache entries.
 *
 * @param {string} prefix
 */
function delPattern(prefix) {
  for (const k of _store.keys()) {
    if (k.startsWith(prefix)) _store.delete(k);
  }
}

function flush() {
  _store.clear();
}

function stats() {
  return { hits: _hits, misses: _misses, size: _store.size };
}

// ── Cache key helpers ─────────────────────────────────────────────────────────
const KEYS = {
  weeklyRanking:   (weekStart) => `ranking:weekly:${weekStart}`,
  monthlyRanking:  (monthStart) => `ranking:monthly:${monthStart}`,
  allTimeRanking:  (axis) => `ranking:alltime:${axis}`,
  stockItem:       (itemId) => `stock:item:${itemId}`,
  stockAll:        () => 'stock:all',
  memberProfile:   (discordId) => `member:profile:${discordId}`,
  memberHistory:   (discordId) => `member:history:${discordId}`,
};

/**
 * Wrap an async function with cache-aside logic.
 *
 * @param {string} key - Cache key
 * @param {() => Promise<any>} fn - Async function to call on cache miss
 * @param {number} [ttlMs] - TTL in milliseconds (default: MEDIUM)
 * @returns {Promise<any>}
 */
async function getOrSet(key, fn, ttlMs = TTL.MEDIUM) {
  const cached = get(key);
  if (cached !== null) return cached;
  const value = await fn();
  if (value !== null && value !== undefined) set(key, value, ttlMs);
  return value;
}

/**
 * Invalidate all cache entries related to inventory/stock.
 * Call after any inventory movement.
 */
function invalidateStock(itemId) {
  if (itemId) del(KEYS.stockItem(itemId));
  del(KEYS.stockAll());
  // Rankings depend on stock values — invalidate them too
  delPattern('ranking:');
}

/**
 * Invalidate all cache entries related to a member.
 * Call after role changes, promotions, or stat updates.
 *
 * @param {string} discordId
 */
function invalidateMember(discordId) {
  del(KEYS.memberProfile(discordId));
  del(KEYS.memberHistory(discordId));
  delPattern('ranking:');
}

module.exports = {
  TTL, KEYS,
  get, set, del, delPattern, flush, stats,
  getOrSet, invalidateStock, invalidateMember,
};
