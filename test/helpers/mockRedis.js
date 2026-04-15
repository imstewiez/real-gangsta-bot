'use strict';
/**
 * Mock Redis client for unit tests.
 * Provides an in-memory implementation of the cache interface.
 */

const _store = new Map();

const mockRedis = {
  get: async (key) => _store.get(key) ?? null,
  set: async (key, value, ...args) => { _store.set(key, value); return 'OK'; },
  del: async (key) => { _store.delete(key); return 1; },
  keys: async (pattern) => {
    const prefix = pattern.replace('*', '');
    return [..._store.keys()].filter(k => k.startsWith(prefix));
  },
  flushall: async () => { _store.clear(); return 'OK'; },
  ping: async () => 'PONG',
  quit: async () => {},
  on: () => mockRedis,
  // Test helpers
  _store,
  _reset: () => _store.clear(),
};

module.exports = { mockRedis };
