'use strict';
const { publishWeeklyTop, publishDailySummary } = require('../rankings/rankingJobs');
const { jobRepo } = require('../repositories');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const CONFIG = require('../config');

const jobs = [];
let _client = null;

function registerJob(name, intervalMs, fn) {
  jobs.push({ name, intervalMs, fn, timer: null });
}

async function runJob(job) {
  const jobId = await jobRepo.startJob(job.name);
  metrics.jobRunsTotal.inc();

  try {
    const result = await job.fn(_client);
    await jobRepo.completeJob(jobId, result || {});
  } catch (e) {
    metrics.jobErrorsTotal.inc();
    await jobRepo.failJob(jobId, e.message);
    warn(`[SCHEDULER] Job '${job.name}' failed: ${e.message}`);
  }
}

function startAll(client) {
  _client = client;

  if (!CONFIG.ENABLE_BACKGROUND_JOBS) {
    log('[SCHEDULER] Background jobs disabled.');
    return;
  }

  if (CONFIG.AUTO_PUBLISH_WEEKLY_TOP) {
    registerJob('weekly_rankings', 30 * 60 * 1000, publishWeeklyTop);
  }
  registerJob('daily_summary', 30 * 60 * 1000, publishDailySummary);

  // Reconciliação de invariantes de roles (diário, 4h da manhã aprox)
  registerJob('role_invariants', 24 * 60 * 60 * 1000, async (client) => {
    try {
      const guild = client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
      if (!guild) return;
      const { reconcileAllMembers } = require('../members/roleInvariants');
      return await reconcileAllMembers(guild, { actor: 'system:daily-job' });
    } catch (e) {
      warn(`[SCHEDULER] role_invariants failed: ${e.message}`);
    }
  });

  // Sync do Google Sheet (dashboard premium). Intervalo configurável via
  // SHEETS_SYNC_INTERVAL_MIN (default 15). Suporta SPREADSHEET_ID legado.
  if (CONFIG.SPREADSHEET_ID || CONFIG.GOOGLE_SHEET_ID || CONFIG.SHEET_ID) {
    const { syncAll } = require('../sheets/syncEngine');
    const minutes = Number(CONFIG.SHEETS_SYNC_INTERVAL_MIN) || 15;
    registerJob('sheets_sync', minutes * 60 * 1000, async () => { await syncAll(); });
  }

  // Retention — corre 1x por dia (24h interval). Remove audit_logs > 365d,
  // job_runs > 90d, radio_history > 365d. Soft-delete availability > 180d.
  registerJob('retention', 24 * 60 * 60 * 1000, async () => {
    const { runRetention } = require('./retentionJob');
    return await runRetention({ dryRun: false, actor: 'system:scheduler' });
  });

  // Reconcile drift Discord↔DB — corre 1x por dia (dry-run apenas por
  // padrão). Chefia corre com /rg-reconcile apply se quiser corrigir.
  registerJob('reconcile_daily', 24 * 60 * 60 * 1000, async (client) => {
    const guild = client?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
    if (!guild) return { skipped: 'no_guild' };
    const { runReconcile } = require('../reconcile');
    return await runReconcile({ domain: 'all', guild, dryRun: true, actor: 'system:scheduler' });
  });

  // Data health — actualiza gauges Prometheus (stale tabs, drift, retention
  // pending, stuck jobs). Corre a cada 5 min, barato.
  registerJob('data_health_collect', 5 * 60 * 1000, async (client) => {
    const guild = client?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
    const { collect } = require('../lib/dataHealth');
    const r = await collect({ guild });
    return {
      stale: r.sheet?.stale, errors: r.sheet?.errors,
      members_drift: (r.members?.role_mismatch || 0) + (r.members?.tier_mismatch || 0),
      stuck_jobs: r.stuck_jobs?.length || 0,
    };
  });

  // Stock alerts — corre hourly. Verifica items com alert_threshold definido
  // e posta no canal alertas-stock se balance < threshold. Throttle 24h.
  registerJob('stock_alerts', 60 * 60 * 1000, async (client) => {
    const { setClient, checkAndAlert } = require('../inventory/stockAlertEngine');
    setClient(client);
    return await checkAndAlert({ dryRun: false });
  });

  // Rankings mensais + all-time snapshot — corre a cada 6h (idempotente).
  // No primeiro dia do mês apanha o mês anterior; resto dos dias actualiza
  // o mês corrente e mantém all_time_stats frescas.
  registerJob('monthly_rankings', 6 * 60 * 60 * 1000, async () => {
    const { computeMonthlyRankings, recomputeAllTimeStats } = require('../rankings/monthlyRankingEngine');
    const m = await computeMonthlyRankings();
    const a = await recomputeAllTimeStats();
    log(`[SCHEDULER] monthly_rankings: ${m.count} mês + ${a.count} all-time`);
  });

  // Sticky messages — refresh time-based (modo repost com threshold_minutes)
  registerJob('sticky_time_refresh', 60 * 1000, async (client) => {
    const { runTimeBasedRefresh } = require('../sticky/stickyEngine');
    return await runTimeBasedRefresh(client);
  });

  // Stock summary — snapshot periódico no canal resumo-stock
  if (CONFIG.STOCK_NOTIFY_ENABLED) {
    const intervalMs = (CONFIG.STOCK_SUMMARY_INTERVAL_HOURS || 4) * 60 * 60 * 1000;
    registerJob('stock_summary', intervalMs, async () => {
      const { publishStockSummary } = require('../inventory/stockNotifier');
      return await publishStockSummary();
    });
  }

  // Auto-publish disponibilidade diária — corre de 5 em 5 min e age só na hora
  // configurada (idempotente por canal+data via índice único da DB).
  if (CONFIG.AVAILABILITY_AUTO_PUBLISH_ENABLED && CONFIG.AVAILABILITY_CHANNEL_ID) {
    const { availabilityRepo } = require('../repositories');
    const { createSession, todayDateString } = require('../availability/availabilityEngine');
    registerJob('availability_auto_publish', 5 * 60 * 1000, async (client) => {
      const now = new Date();
      if (now.getHours() !== CONFIG.AVAILABILITY_AUTO_PUBLISH_HOUR) return { skipped: 'wrong_hour' };
      const date = todayDateString();
      const existing = await availabilityRepo.getOpenSession(CONFIG.AVAILABILITY_CHANNEL_ID, date);
      if (existing) return { skipped: 'already_open', sessionId: existing.id };
      const { session } = await createSession({
        client,
        channelId: CONFIG.AVAILABILITY_CHANNEL_ID,
        createdBy: 'system:auto-publish',
      });
      return { sessionId: session.id };
    });
  }

  for (const job of jobs) {
    job.timer = setInterval(() => runJob(job), job.intervalMs);
    job.timer.unref();
    log(`[SCHEDULER] Job '${job.name}' registered (${job.intervalMs / 1000}s interval).`);
  }
}

function stopAll() {
  for (const job of jobs) {
    if (job.timer) {
      clearInterval(job.timer);
      job.timer = null;
    }
  }
  log('[SCHEDULER] All jobs stopped.');
}

module.exports = { startAll, stopAll, registerJob };
