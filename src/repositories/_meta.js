'use strict';
/**
 * Metadata helpers — soft-delete, versioning, sync-state.
 *
 * Convenções:
 *   - Apenas tabelas que participam nos fluxos críticos de lifecycle
 *     (members, operations, items, resident_channels, availability_sessions,
 *     sticky_messages) expõem estas colunas.
 *   - Logs append-only (audit_logs, job_runs, inventory_movements,
 *     radio_history) NÃO usam soft-delete — são imutáveis por design.
 *     Retenção é tratada em src/jobs/retentionJob.js.
 *
 * O helper actualiza SEMPRE record_version + last_mutation_at para manter
 * optimistic locking utilizável por reconcile/drift detection.
 */

const { query } = require('../db');

const SOFT_DELETE_TABLES = new Set([
  'members',
  'operations',
  'items',
  'resident_channels',
  'availability_sessions',
  'sticky_messages',
]);

function _assertTable(table) {
  if (!SOFT_DELETE_TABLES.has(table)) {
    throw new Error(`[meta] Tabela "${table}" não suporta soft-delete/versioning`);
  }
}

/** Marca um registo como soft-deleted. Preserva histórico; queries SELECT
 *  normais continuam a devolver o row — clients têm de filtrar deleted_at IS NULL
 *  explicitamente, ou usar activeOnly() helper. */
async function softDelete(table, id, deletedBy, reason = '') {
  _assertTable(table);
  const col = table === 'resident_channels' ? 'deleted_at' : 'deleted_at';
  const r = await query(
    `UPDATE ${table}
        SET ${col} = NOW(),
            deleted_by = $1,
            record_version = record_version + 1
      WHERE id = $2 AND ${col} IS NULL
      RETURNING id, record_version`,
    [deletedBy || 'system:unknown', id]
  );
  return r.rows[0] || null;
}

/** Restaura registo soft-deleted. */
async function restore(table, id) {
  _assertTable(table);
  const r = await query(
    `UPDATE ${table}
        SET deleted_at = NULL,
            deleted_by = NULL,
            record_version = record_version + 1
      WHERE id = $1
      RETURNING id, record_version`,
    [id]
  );
  return r.rows[0] || null;
}

/** Bump record_version — chamar em mutations que não passam por softDelete/restore. */
async function bumpVersion(table, id) {
  _assertTable(table);
  await query(`UPDATE ${table} SET record_version = record_version + 1 WHERE id = $1`, [id]);
}

// ─── Sheet sync state ────────────────────────────────────────────────────────
// Tracking por TAB (não per-record) — updated após cada sync bem/mal-sucedido.

async function recordSheetSync(tabKey, { result, ops, ms, error, dataHash }) {
  const res = String(result || 'unknown');
  // consecutive_errors: incrementa em 'error', reseta em 'ok', preserva em 'skipped'.
  // CASE nativo evita read-modify-write em dois statements (sem race).
  await query(
    `INSERT INTO sheet_sync_state (tab_key, last_synced_at, last_result, last_ops, last_ms, last_error, last_data_hash, consecutive_errors, updated_at)
     VALUES ($1, NOW(), $2, $3, $4, $5, $6,
             CASE WHEN $2 = 'error' THEN 1 ELSE 0 END,
             NOW())
     ON CONFLICT (tab_key) DO UPDATE SET
       last_synced_at      = EXCLUDED.last_synced_at,
       last_result         = EXCLUDED.last_result,
       last_ops            = EXCLUDED.last_ops,
       last_ms             = EXCLUDED.last_ms,
       last_error          = EXCLUDED.last_error,
       last_data_hash      = EXCLUDED.last_data_hash,
       consecutive_errors  = CASE
                               WHEN EXCLUDED.last_result = 'error' THEN sheet_sync_state.consecutive_errors + 1
                               WHEN EXCLUDED.last_result = 'ok'    THEN 0
                               ELSE sheet_sync_state.consecutive_errors
                             END,
       updated_at          = NOW()`,
    [tabKey, res, ops || null, ms || null, error || null, dataHash || null]
  );
}

async function getSheetSyncState(tabKey = null) {
  if (tabKey) {
    const r = await query('SELECT * FROM sheet_sync_state WHERE tab_key = $1', [tabKey]);
    return r.rows[0] || null;
  }
  const r = await query('SELECT * FROM sheet_sync_state ORDER BY tab_key');
  return r.rows;
}

// ─── Discord reconcile tracking (members) ────────────────────────────────────

async function markMemberDiscordReconciled(memberId) {
  await query('UPDATE members SET last_discord_reconciled_at = NOW() WHERE id = $1', [memberId]);
}

async function getStaleMembers(staleThresholdMinutes = 60 * 24) {
  const r = await query(
    `SELECT id, discord_id, display_name, last_discord_reconciled_at
       FROM members
      WHERE deleted_at IS NULL
        AND (last_discord_reconciled_at IS NULL
             OR last_discord_reconciled_at < NOW() - ($1 || ' minutes')::interval)
      ORDER BY last_discord_reconciled_at NULLS FIRST`,
    [String(staleThresholdMinutes)]
  );
  return r.rows;
}

module.exports = {
  softDelete,
  restore,
  bumpVersion,
  recordSheetSync,
  getSheetSyncState,
  markMemberDiscordReconciled,
  getStaleMembers,
  SOFT_DELETE_TABLES,
};
