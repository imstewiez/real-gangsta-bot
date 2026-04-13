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

function toPrometheusText() {
  const lines = [];
  lines.push(`# Real Gangsta \u2014 metrics snapshot ${new Date().toISOString()}\n`);

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

const membersActive = gauge('rg_members_active', 'Active members');
const discordPingMs = gauge('rg_discord_ping_ms', 'Discord WS ping ms');

module.exports = {
  counter, gauge, toPrometheusText, toJson,
  commandInvocationsTotal, discordEventsTotal,
  jobRunsTotal, jobErrorsTotal,
  panelRefreshSuccess, panelRefreshFail,
  inventoryMovements, operationsCreated, operationsClosed, membersOnboarded,
  advisoryLockAcquired, advisoryLockTimeout,
  membersActive, discordPingMs,
};
