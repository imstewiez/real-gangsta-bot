'use strict';
/**
 * withRetry — exponential backoff retry wrapper for transient failures.
 *
 * Usage:
 *   const { withRetry } = require('../middleware/withRetry');
 *
 *   const result = await withRetry(() => someDbOperation(), {
 *     maxAttempts: 3,
 *     baseDelayMs: 200,
 *     shouldRetry: (err) => err.code === 'ECONNRESET',
 *   });
 */

const { warn } = require('../logger');

/**
 * Default retry predicate — retries on transient DB/network errors.
 *
 * @param {Error} err
 * @returns {boolean}
 */
function defaultShouldRetry(err) {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || '');
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    msg.includes('connection timeout') ||
    msg.includes('too many clients') ||
    msg.includes('connection terminated')
  );
}

/**
 * Retry an async function with exponential backoff.
 *
 * @param {() => Promise<any>} fn - Async function to retry
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts=3] - Maximum number of attempts
 * @param {number} [opts.baseDelayMs=200] - Base delay in ms (doubles each retry)
 * @param {number} [opts.maxDelayMs=5000] - Maximum delay cap in ms
 * @param {(err: Error) => boolean} [opts.shouldRetry] - Predicate to decide if error is retryable
 * @param {string} [opts.label=''] - Label for log messages
 * @returns {Promise<any>}
 */
async function withRetry(fn, opts = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 5000,
    shouldRetry = defaultShouldRetry,
    label = '',
  } = opts;

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !shouldRetry(err)) {
        throw err;
      }
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      warn(`[RETRY${label ? ':' + label : ''}] Attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

module.exports = { withRetry, defaultShouldRetry };
