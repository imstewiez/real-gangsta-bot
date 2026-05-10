'use strict';
const { query } = require('../db');
const { log, warn } = require('../logger');
const { syncOne } = require('../sheets/syncEngine');

const MAX_ATTEMPTS = 10;

async function processRetries() {
  const pending = await query(
    `
    SELECT id, tab, attempts, last_error
    FROM sync_retries
    WHERE resolved_at IS NULL
      AND next_retry_at <= NOW()
      AND attempts < $1
    ORDER BY next_retry_at
    LIMIT 5
  `,
    [MAX_ATTEMPTS]
  );

  for (const row of pending.rows) {
    const delay = Math.min(Math.pow(2, row.attempts) * 5000, 3600000);
    try {
      await syncOne(row.tab);
      await query('UPDATE sync_retries SET resolved_at = NOW() WHERE id = $1', [row.id]);
      log(`[SHEETS:DLQ] Tab '${row.tab}' resolvida após retry.`);
    } catch (err) {
      await query(
        `
        UPDATE sync_retries
        SET attempts = attempts + 1,
            last_error = $1,
            next_retry_at = NOW() + ($2 || ' milliseconds')::interval
        WHERE id = $3
      `,
        [err.message?.slice(0, 500) || 'unknown', delay, row.id]
      );
      warn(`[SHEETS:DLQ] Retry ${row.attempts + 1} falhou para '${row.tab}': ${err.message}`);
    }
  }
}

module.exports = { processRetries };
