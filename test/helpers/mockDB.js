'use strict';
/**
 * Mock database for unit tests.
 * Provides an in-memory query function that can be configured with fixtures.
 */

const _queryHandlers = new Map();
let _defaultHandler = null;

/**
 * Register a query handler for a specific SQL pattern.
 *
 * @param {string|RegExp} pattern - SQL pattern to match
 * @param {Function|object} handler - Function(text, params) => result, or static result object
 */
function onQuery(pattern, handler) {
  _queryHandlers.set(pattern, handler);
}

/**
 * Set a default handler for unmatched queries.
 *
 * @param {Function} handler
 */
function setDefault(handler) {
  _defaultHandler = handler;
}

/**
 * Mock query function — matches registered handlers or returns empty result.
 *
 * @param {string} text
 * @param {any[]} [params]
 * @returns {Promise<{rows: any[], rowCount: number}>}
 */
async function query(text, params) {
  for (const [pattern, handler] of _queryHandlers) {
    const matches = typeof pattern === 'string'
      ? text.includes(pattern)
      : pattern.test(text);
    if (matches) {
      if (typeof handler === 'function') return handler(text, params);
      return handler;
    }
  }
  if (_defaultHandler) return _defaultHandler(text, params);
  return { rows: [], rowCount: 0 };
}

/**
 * Reset all registered handlers.
 */
function reset() {
  _queryHandlers.clear();
  _defaultHandler = null;
}

/**
 * Create a mock pool object.
 */
function mockPool() {
  return {
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
    connect: async () => ({
      query,
      release: () => {},
    }),
    end: async () => {},
    on: () => {},
  };
}

module.exports = { query, onQuery, setDefault, reset, mockPool };
