'use strict';
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

// We test the cache module directly
const cache = require('../src/cache');

describe('cache', () => {
  beforeEach(() => {
    cache.flush();
  });

  describe('get/set/del', () => {
    it('returns null for missing key', () => {
      assert.equal(cache.get('nonexistent'), null);
    });

    it('stores and retrieves a value', () => {
      cache.set('foo', { bar: 1 }, cache.TTL.SHORT);
      const v = cache.get('foo');
      assert.deepEqual(v, { bar: 1 });
    });

    it('returns null after TTL expires', async () => {
      cache.set('expiring', 'value', 10); // 10ms TTL
      await new Promise(r => setTimeout(r, 20));
      assert.equal(cache.get('expiring'), null);
    });

    it('deletes a key', () => {
      cache.set('todel', 42, cache.TTL.SHORT);
      cache.del('todel');
      assert.equal(cache.get('todel'), null);
    });
  });

  describe('delPattern', () => {
    it('deletes all keys matching prefix', () => {
      cache.set('ranking:weekly:2024-01-01', [1, 2, 3], cache.TTL.LONG);
      cache.set('ranking:monthly:2024-01', [4, 5, 6], cache.TTL.LONG);
      cache.set('stock:item:1', 100, cache.TTL.SHORT);

      cache.delPattern('ranking:');

      assert.equal(cache.get('ranking:weekly:2024-01-01'), null);
      assert.equal(cache.get('ranking:monthly:2024-01'), null);
      assert.equal(cache.get('stock:item:1'), 100); // untouched
    });
  });

  describe('getOrSet', () => {
    it('calls fn on cache miss and caches result', async () => {
      let calls = 0;
      const fn = async () => { calls++; return { data: 'fresh' }; };

      const v1 = await cache.getOrSet('mykey', fn, cache.TTL.SHORT);
      const v2 = await cache.getOrSet('mykey', fn, cache.TTL.SHORT);

      assert.deepEqual(v1, { data: 'fresh' });
      assert.deepEqual(v2, { data: 'fresh' });
      assert.equal(calls, 1, 'fn should only be called once');
    });

    it('does not cache null values', async () => {
      let calls = 0;
      const fn = async () => { calls++; return null; };

      await cache.getOrSet('nullkey', fn, cache.TTL.SHORT);
      await cache.getOrSet('nullkey', fn, cache.TTL.SHORT);

      assert.equal(calls, 2, 'fn should be called each time for null results');
    });
  });

  describe('stats', () => {
    it('tracks hits and misses', () => {
      cache.set('tracked', 'value', cache.TTL.SHORT);
      cache.get('tracked');   // hit
      cache.get('tracked');   // hit
      cache.get('missing');   // miss

      const s = cache.stats();
      assert.ok(s.hits >= 2);
      assert.ok(s.misses >= 1);
    });
  });

  describe('invalidateStock', () => {
    it('removes stock and ranking keys', () => {
      cache.set(cache.KEYS.stockItem(1), 100, cache.TTL.SHORT);
      cache.set(cache.KEYS.stockAll(), { total: 500 }, cache.TTL.SHORT);
      cache.set(cache.KEYS.weeklyRanking('2024-01-01'), [], cache.TTL.LONG);

      cache.invalidateStock(1);

      assert.equal(cache.get(cache.KEYS.stockItem(1)), null);
      assert.equal(cache.get(cache.KEYS.stockAll()), null);
      assert.equal(cache.get(cache.KEYS.weeklyRanking('2024-01-01')), null);
    });
  });

  describe('invalidateMember', () => {
    it('removes member profile and ranking keys', () => {
      const discordId = 'user123';
      cache.set(cache.KEYS.memberProfile(discordId), { name: 'Test' }, cache.TTL.MEDIUM);
      cache.set(cache.KEYS.weeklyRanking('2024-01-01'), [], cache.TTL.LONG);

      cache.invalidateMember(discordId);

      assert.equal(cache.get(cache.KEYS.memberProfile(discordId)), null);
      assert.equal(cache.get(cache.KEYS.weeklyRanking('2024-01-01')), null);
    });
  });
});
