'use strict';
/**
 * Retention job — limpa dados antigos de tabelas append-only de forma
 * controlada, registando cada acção em archival_log para auditabilidade.
 *
 * Políticas (hard-coded mas documentadas em docs/DATA_LIFECYCLE.md):
 *
 *   audit_logs              > 365 dias  → DELETE (summary em archival_log)
 *   job_runs                >  90 dias  → DELETE
 *   availability_sessions   > 180 dias fechadas → deleted_at = NOW()
 *   radio_history           > 365 dias  → DELETE
 *   sticky_messages         inactive + updated_at < 30d → hard DELETE
 *
 * Movimentos de inventário (inventory_movements) NÃO são purgados — valor
 * contabilístico. Rankings semanais/mensais NÃO são purgados — snapshots.
 *
 * Uso:
 *   const r = await runRetention({ dryRun: true })
 *   → { scanned, actions: [...], ms }
 */

const { query } = require('../db');
const { log, warn } = require('../logger');

const POLICIES = [
  {
    key: 'audit_logs_365',
    domain: 'audit_logs',
    action: 'hard_delete',
    description: 'audit_logs com created_at > 365 dias',
    countSql: "SELECT COUNT(*)::int AS n FROM audit_logs WHERE created_at < NOW() - INTERVAL '365 days'",
    applySql: "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '365 days' RETURNING id",
  },
  {
    key: 'job_runs_90',
    domain: 'job_runs',
    action: 'hard_delete',
    description: 'job_runs com finished_at (ou started_at) > 90 dias',
    countSql:
      "SELECT COUNT(*)::int AS n FROM job_runs WHERE COALESCE(finished_at, started_at) < NOW() - INTERVAL '90 days'",
    applySql: "DELETE FROM job_runs WHERE COALESCE(finished_at, started_at) < NOW() - INTERVAL '90 days' RETURNING id",
  },
  {
    key: 'availability_180',
    domain: 'availability_sessions',
    action: 'soft_delete',
    description: 'availability_sessions fechadas > 180 dias (soft-delete)',
    countSql:
      "SELECT COUNT(*)::int AS n FROM availability_sessions WHERE status='closed' AND deleted_at IS NULL AND created_at < NOW() - INTERVAL '180 days'",
    applySql:
      "UPDATE availability_sessions SET deleted_at = NOW(), deleted_by = 'system:retention', record_version = record_version + 1 WHERE status='closed' AND deleted_at IS NULL AND created_at < NOW() - INTERVAL '180 days' RETURNING id",
  },
  {
    key: 'radio_history_365',
    domain: 'radio_history',
    action: 'hard_delete',
    description: 'radio_history com created_at > 365 dias',
    countSql: "SELECT COUNT(*)::int AS n FROM radio_history WHERE created_at < NOW() - INTERVAL '365 days'",
    applySql: "DELETE FROM radio_history WHERE created_at < NOW() - INTERVAL '365 days' RETURNING id",
  },
  {
    key: 'sticky_inactive_30',
    domain: 'sticky_messages',
    action: 'hard_delete',
    description: 'sticky_messages inactive com updated_at > 30 dias',
    countSql:
      "SELECT COUNT(*)::int AS n FROM sticky_messages WHERE active = false AND updated_at < NOW() - INTERVAL '30 days'",
    applySql:
      "DELETE FROM sticky_messages WHERE active = false AND updated_at < NOW() - INTERVAL '30 days' RETURNING id",
  },
];

async function _recordArchival({ domain, action, rowCount, actor, reason, payload = {} }) {
  await query(
    `INSERT INTO archival_log (domain, action, row_count, actor, reason, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [domain, action, rowCount, actor, reason, payload]
  );
}

async function runRetention({ dryRun = true, actor = 'system:retention' } = {}) {
  const t0 = Date.now();
  const actions = [];

  for (const p of POLICIES) {
    let count = 0;
    try {
      const r = await query(p.countSql);
      count = r.rows[0]?.n || 0;
    } catch (e) {
      warn(`[RETENTION] ${p.key} count falhou: ${e.message}`);
      actions.push({ key: p.key, domain: p.domain, action: p.action, count: null, applied: false, error: e.message });
      continue;
    }

    if (count === 0) {
      actions.push({ key: p.key, domain: p.domain, action: p.action, count: 0, applied: false });
      continue;
    }

    if (dryRun) {
      actions.push({ key: p.key, domain: p.domain, action: p.action, count, applied: false, dryRun: true });
      continue;
    }

    try {
      const res = await query(p.applySql);
      const affected = res.rowCount || res.rows?.length || 0;
      await _recordArchival({
        domain: p.domain,
        action: p.action,
        rowCount: affected,
        actor,
        reason: p.description,
        payload: { policy_key: p.key, apply_sql: p.applySql.replace(/\s+/g, ' ').slice(0, 500) },
      });
      actions.push({ key: p.key, domain: p.domain, action: p.action, count: affected, applied: true });
    } catch (e) {
      warn(`[RETENTION] ${p.key} apply falhou: ${e.message}`);
      actions.push({ key: p.key, domain: p.domain, action: p.action, count, applied: false, error: e.message });
    }
  }

  const ms = Date.now() - t0;
  const summary = actions.reduce(
    (a, x) => {
      if (x.error) a.errors += 1;
      else if (x.applied) {
        a.appliedCount += 1;
        a.totalRows += x.count || 0;
      }
      return a;
    },
    { errors: 0, appliedCount: 0, totalRows: 0 }
  );

  log(
    `[RETENTION] dry=${dryRun} · ${actions.length} políticas · ${summary.totalRows} rows afectados · ${summary.errors} erros · ${ms}ms`
  );
  return { dryRun, actions, summary, ms };
}

async function getArchivalHistory(limit = 50) {
  const r = await query(
    `SELECT id, domain, action, row_count, actor, reason, created_at
       FROM archival_log ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return r.rows;
}

module.exports = { runRetention, getArchivalHistory, POLICIES };
