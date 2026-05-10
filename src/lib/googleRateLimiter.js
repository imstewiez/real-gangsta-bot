'use strict';

/**
 * Token bucket simples para rate limiting da Google Sheets API.
 * Quota: 100 requests / 100s por user → usamos 90 para margem.
 */

const MAX_QUOTA_PER_100S = 90;
let _tokens = MAX_QUOTA_PER_100S;
let _lastRefill = Date.now();

function refill() {
  const now = Date.now();
  const elapsed = now - _lastRefill;
  const toAdd = Math.floor(elapsed / 1000); // 1 token por segundo (conservador)
  if (toAdd > 0) {
    _tokens = Math.min(MAX_QUOTA_PER_100S, _tokens + toAdd);
    _lastRefill = now;
  }
}

async function acquire(tokens = 1) {
  refill();
  if (_tokens >= tokens) {
    _tokens -= tokens;
    return;
  }
  const waitMs = (tokens - _tokens) * 1000;
  await new Promise(r => setTimeout(r, waitMs));
  return acquire(tokens);
}

module.exports = { acquire };
