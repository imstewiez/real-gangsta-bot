'use strict';

const _startedAt = Date.now();
const _counters = new Map();
const _gauges = new Map();

function _ensureCounter(name, help) {
  if (!_counters.has(name)) _counters.set(name, { value: 0, help: help || '' });
}
function _ensureGauge(name, help) {
  if (!_gauges.has(name)) _gauges.set(name, { value: 0, help: help || '' });
}

function counter(name, help) {
  _ensureCounter(name, help);
  return {
    inc(n = 1) { _counters.get(name).value += n; },
    get() { return _counters.get(name).value; },
    reset() { _counters.get(name).value = 0; },
  };
}

function gauge(name, help) {
  _ensureGauge(name, help);
  return {
    set(v) { _gauges.get(name).value = v; },
    inc(n = 1) { _gauges.get(name).value += n; },
    dec(n = 1) { _gauges.get(name).value -= n; },
    get() { return _gauges.get(name).value; },
  };
}

function _snapshotPoolStats() {
  // Lazy require para evitar que o módulo metrics dependa de db.js no load.
  try {
    const { pool } = require('../db');
    if (!pool) return;
    dbPoolTotal.set(pool.totalCount || 0);
    dbPoolIdle.set(pool.idleCount || 0);
    dbPoolWaiting.set(pool.waitingCount || 0);
  } catch { /* db ainda não carregado */ }
}

function toPrometheusText() {
  _snapshotPoolStats();
  const lines = [];
  const CONFIG = require('../config');
  lines.push(`# ${CONFIG.BOT_INTERNAL_NAME} \u2014 metrics snapshot ${new Date().toISOString()}\n`);

  const mem = process.memoryUsage();
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds ${((Date.now() - _startedAt) / 1000).toFixed(1)}`);
  lines.push('# TYPE process_memory_rss_bytes gauge');
  lines.push(`process_memory_rss_bytes ${mem.rss}\n`);

  for (const [name, c] of _counters) {
    if (c.help) lines.push(`# HELP ${name} ${c.help}`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${c.value}\n`);
  }
  for (const [name, g] of _gauges) {
    if (g.help) lines.push(`# HELP ${name} ${g.help}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${g.value}\n`);
  }
  return lines.join('\n');
}

function toJson() {
  const counters = {};
  const gauges = {};
  for (const [k, v] of _counters) counters[k] = v.value;
  for (const [k, v] of _gauges) gauges[k] = v.value;
  return { ts: new Date().toISOString(), uptimeSeconds: (Date.now() - _startedAt) / 1000, counters, gauges };
}

// Pre-defined metrics
const commandInvocationsTotal = counter('rg_command_invocations_total', 'Slash command invocations');
const discordEventsTotal = counter('rg_discord_events_total', 'Discord events received');
const jobRunsTotal = counter('rg_job_runs_total', 'Background job executions');
const jobErrorsTotal = counter('rg_job_errors_total', 'Background job errors');
const panelRefreshSuccess = counter('rg_panel_refresh_success_total', 'Successful panel refreshes');
const panelRefreshFail = counter('rg_panel_refresh_fail_total', 'Failed panel refreshes');
const inventoryMovements = counter('rg_inventory_movements_total', 'Inventory movements recorded');
const operationsCreated = counter('rg_operations_created_total', 'Operations created');
const operationsClosed = counter('rg_operations_closed_total', 'Operations closed');
const membersOnboarded = counter('rg_members_onboarded_total', 'Members onboarded');
const advisoryLockAcquired = counter('rg_advisory_lock_acquired_total', 'Advisory locks acquired');
const advisoryLockTimeout = counter('rg_advisory_lock_timeout_total', 'Advisory lock timeouts');
const interactionErrorsTotal = counter('rg_interaction_errors_total', 'Unhandled interaction handler errors');
const logRotationsTotal = counter('rg_log_rotations_total', 'Log file rotations performed');
const permDenialsTotal = counter('rg_perm_denials_total', 'Permission checks denied');
const rateLimitDenialsTotal = counter('rg_rate_limit_denials_total', 'Rate limit denials');
const sheetsSyncTotal = counter('rg_sheets_sync_total', 'Google Sheets syncs executed');
const sheetsSyncErrorsTotal = counter('rg_sheets_sync_errors_total', 'Google Sheets sync errors');

const membersActive = gauge('rg_members_active', 'Active members');
const discordPingMs = gauge('rg_discord_ping_ms', 'Discord WS ping ms');
const dbPoolTotal = gauge('rg_db_pool_total', 'DB connections currently in pool (total)');
const dbPoolIdle = gauge('rg_db_pool_idle', 'DB connections currently idle');
const dbPoolWaiting = gauge('rg_db_pool_waiting', 'Queries waiting for DB connection');

module.exports = {
  counter, gauge, toPrometheusText, toJson,
  commandInvocationsTotal, discordEventsTotal,
  jobRunsTotal, jobErrorsTotal,
  panelRefreshSuccess, panelRefreshFail,
  inventoryMovements, operationsCreated, operationsClosed, membersOnboarded,
  advisoryLockAcquired, advisoryLockTimeout,
  interactionErrorsTotal, logRotationsTotal,
  permDenialsTotal, rateLimitDenialsTotal,
  sheetsSyncTotal, sheetsSyncErrorsTotal,
  membersActive, discordPingMs,
  dbPoolTotal, dbPoolIdle, dbPoolWaiting,
};
