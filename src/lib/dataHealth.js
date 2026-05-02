'use strict';
/**
 * Data health — agrega indicadores de drift/stale/backlog.
 *
 * Fontes:
 *   - sheet_sync_state (staleness de tabs)
 *   - reconcile drivers (em dry-run)
 *   - archival_log (últimas acções)
 *   - job_runs (stuck jobs)
 *   - tabelas raw (size tracking)
 *
 * Usado por:
 *   - /rg-data-health (ephemeral report para chefia)
 *   - scheduler (actualiza gauges Prometheus)
 */

// const CONFIG = require('../config');
const { query } = require('../db');
const metrics = require('./metrics');

async function collect({ guild = null } = {}) {
  const t0 = Date.now();
  const report = { timestamp: new Date().toISOString() };

  // ── Sheet staleness ────────────────────────────────────────────────────────
  try {
    const { runReconcile } = require('../reconcile');
    const r = await runReconcile({ domain: 'sheet', dryRun: true });
    const s = r.per_domain.sheet?.check || {};
    report.sheet = {
      total_checked: s.total_checked || 0,
      ok: s.ok || 0,
      stale: s.stale?.length || 0,
      errors: s.errors?.length || 0,
      never_synced: s.never_synced?.length || 0,
      has_drift: s.has_drift || false,
    };
    metrics.sheetStaleTabs.set(report.sheet.stale);
    metrics.sheetErrorTabs.set(report.sheet.errors);
  } catch (e) {
    report.sheet = { error: e.message };
  }

  // ── Members drift (se guild disponível) ────────────────────────────────────
  if (guild) {
    try {
      const driver = require('../reconcile/drivers/members');
      const c = await driver.check(guild);
      report.members = {
        total_checked: c.total_checked,
        ok: c.ok,
        role_mismatch: c.role_mismatch?.length || 0,
        tier_mismatch: c.tier_mismatch?.length || 0,
        missing_in_db: c.missing_in_db?.length || 0,
        orphan_in_db: c.orphan_in_db?.length || 0,
      };
      metrics.driftedMembers.set(report.members.role_mismatch + report.members.tier_mismatch);
    } catch (e) {
      report.members = { error: e.message };
    }

    try {
      const driver = require('../reconcile/drivers/channels');
      const c = await driver.check(guild);
      report.channels = {
        total_checked: c.total_checked,
        ok: c.ok,
        orphan_in_db: c.orphan_in_db?.length || 0,
      };
      metrics.orphanChannels.set(report.channels.orphan_in_db);
    } catch (e) {
      report.channels = { error: e.message };
    }
  }

  // ── Stuck jobs ─────────────────────────────────────────────────────────────
  try {
    const r = await query(
      `SELECT job_name, started_at FROM job_runs
        WHERE status = 'running' AND started_at < NOW() - INTERVAL '2 hours'
        ORDER BY started_at`
    );
    report.stuck_jobs = r.rows.map(x => ({ job_name: x.job_name, stuck_since: x.started_at }));
    metrics.staleJobRuns.set(r.rows.length);
  } catch (e) {
    report.stuck_jobs = [];
  }

  // ── Retention pending ──────────────────────────────────────────────────────
  try {
    const { runRetention } = require('../jobs/retentionJob');
    const r = await runRetention({ dryRun: true });
    report.retention = {
      policies: r.actions.length,
      total_eligible: r.actions.reduce((a, x) => a + (x.count || 0), 0),
      details: r.actions.map(a => ({ key: a.key, count: a.count, error: a.error })),
    };
    metrics.pendingRetentionRows.set(report.retention.total_eligible);
  } catch (e) {
    report.retention = { error: e.message };
  }

  // ── Table sizes (ordem decrescente) ────────────────────────────────────────
  try {
    const r = await query(`
      SELECT c.relname AS table_name,
             n_live_tup::bigint AS rows,
             pg_size_pretty(pg_total_relation_size(c.oid)) AS size
        FROM pg_stat_user_tables s
        JOIN pg_class c ON c.relname = s.relname
       WHERE s.schemaname = 'public'
       ORDER BY n_live_tup DESC
       LIMIT 10
    `);
    report.table_sizes = r.rows;
  } catch (e) {
    report.table_sizes = [];
  }

  // ── Archival history (últimas 5) ───────────────────────────────────────────
  try {
    const r = await query(
      `SELECT domain, action, row_count, actor, reason, created_at
         FROM archival_log ORDER BY created_at DESC LIMIT 5`
    );
    report.recent_archival = r.rows;
  } catch (e) {
    report.recent_archival = [];
  }

  report.ms = Date.now() - t0;
  return report;
}

function formatDiscord(report) {
  const lines = [`🏥 **Data Health** · ${report.timestamp}`, ''];

  if (report.sheet && !report.sheet.error) {
    const s = report.sheet;
    const status = s.has_drift ? '⚠️' : '✅';
    lines.push(
      `${status} **Sheet** · ${s.ok}/${s.total_checked} ok · stale:${s.stale} · error:${s.errors} · never:${s.never_synced}`
    );
  } else if (report.sheet?.error) {
    lines.push(`❌ **Sheet**: ${report.sheet.error}`);
  }

  if (report.members && !report.members.error) {
    const m = report.members;
    const drift = m.role_mismatch + m.tier_mismatch + m.missing_in_db + m.orphan_in_db;
    const status = drift > 0 ? '⚠️' : '✅';
    lines.push(
      `${status} **Members** · ${m.ok}/${m.total_checked} ok · role:${m.role_mismatch} · tier:${m.tier_mismatch} · missing:${m.missing_in_db} · orphan:${m.orphan_in_db}`
    );
  }

  if (report.channels && !report.channels.error) {
    const c = report.channels;
    const status = c.orphan_in_db > 0 ? '⚠️' : '✅';
    lines.push(`${status} **Channels** · ${c.ok}/${c.total_checked} ok · orphans:${c.orphan_in_db}`);
  }

  const stuck = report.stuck_jobs?.length || 0;
  lines.push(
    stuck > 0
      ? `⚠️ **Stuck Jobs**: ${stuck}  (${report.stuck_jobs.map(j => j.job_name).join(', ')})`
      : '✅ **Jobs** sem stucks'
  );

  if (report.retention && !report.retention.error) {
    const r = report.retention;
    lines.push(
      r.total_eligible > 0
        ? `🗑 **Retention** · ${r.total_eligible} rows elegíveis para purge`
        : '✅ **Retention** · nada para purgar'
    );
  }

  if (report.table_sizes?.length) {
    lines.push('', '**Top tabelas por linhas:**');
    for (const t of report.table_sizes.slice(0, 5)) {
      lines.push(`  • \`${t.table_name}\` — ${t.rows?.toLocaleString?.('pt-PT') || t.rows} rows · ${t.size}`);
    }
  }

  if (report.recent_archival?.length) {
    lines.push('', '**Últimas acções archival:**');
    for (const a of report.recent_archival) {
      const when = new Date(a.created_at).toISOString().slice(0, 16).replace('T', ' ');
      lines.push(`  • \`${when}\` ${a.domain}/${a.action} → ${a.row_count} rows (${a.actor})`);
    }
  }

  lines.push('', `_recolha em ${report.ms}ms_`);
  return lines.join('\n').slice(0, 1990);
}

module.exports = { collect, formatDiscord };
