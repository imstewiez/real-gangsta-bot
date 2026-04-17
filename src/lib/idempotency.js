'use strict';
const { query } = require('../db');

async function isAlreadyExecuted(dedupeKey) {
  const res = await query("SELECT id FROM idempotency_ops WHERE dedupe_key = $1 AND status = 'completed' LIMIT 1", [
    dedupeKey,
  ]);
  return res.rows.length > 0;
}

async function startOperation({ dedupeKey, entityType, entityId, source = '', data = {} }) {
  const id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    const result = await query(
      `INSERT INTO idempotency_ops (id, dedupe_key, entity_type, entity_id, source, status, data, created_at)
       VALUES ($1, $2, $3, $4, $5, 'running', $6, NOW())
       ON CONFLICT (dedupe_key) WHERE status IN ('running', 'completed')
       DO NOTHING
       RETURNING id`,
      [id, dedupeKey, entityType, entityId, source, JSON.stringify(data)]
    );
    if (result.rows.length === 0) return null;
    return id;
  } catch (e) {
    const { warn } = require('../logger');
    warn(`[IDEMPOTENCY] startOperation failed for ${dedupeKey}: ${e.message}`);
    return null;
  }
}

async function completeOperation(operationId) {
  if (!operationId) return;
  await query('UPDATE idempotency_ops SET status = $1, completed_at = NOW() WHERE id = $2', ['completed', operationId]);
}

async function failOperation(operationId, error = '') {
  if (!operationId) return;
  await query('UPDATE idempotency_ops SET status = $1, error = $2, completed_at = NOW() WHERE id = $3', [
    'failed',
    error,
    operationId,
  ]);
}

async function executeOnce(opts, fn) {
  const operationId = await startOperation(opts);
  if (!operationId) return { result: null, skipped: true, operationId: null };
  try {
    const result = await fn();
    await completeOperation(operationId);
    return { result, skipped: false, operationId };
  } catch (e) {
    await failOperation(operationId, e?.message || String(e));
    throw e;
  }
}

async function pruneOperations(keepDays = 30) {
  await query("DELETE FROM idempotency_ops WHERE created_at < NOW() - INTERVAL '1 day' * $1", [keepDays]);
}

module.exports = { isAlreadyExecuted, startOperation, completeOperation, failOperation, executeOnce, pruneOperations };
