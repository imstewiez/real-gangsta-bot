'use strict';
const { hostname } = require('os');
// const { publishWeeklyTop, publishDailySummary, publishBairristaWeeklyPrize } = require('../rankings/rankingJobs');
const { processRetries } = require('./sheetsRetryJob');
// const {
//   publishBairristaDailySummary,
//   publishBairristaWeeklySummary,
//   publishBairristaMonthlySummary,
// } = require('../rankings/bairristaSummaryJobs');
const { jobRepo } = require('../repositories');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const CONFIG = require('../config');

const jobs = [];
let _client = null;
const _activeJobs = new Map();
const _heartbeats = new Map();
let _shuttingDown = false;

const JOB_TIMEOUT_MS = parseInt(process.env.JOB_TIMEOUT_MS, 10) || 60000;
const INSTANCE_ID = `${hostname()}:${process.pid}:${Date.now()}`;

function registerJob(name, intervalMs, fn, opts = {}) {
  jobs.push({ name, intervalMs, fn, timer: null, _running: false, runOnStart: opts.runOnStart || false });
}

async function runJob(job) {
  if (_shuttingDown) {
    log(`[SCHEDULER] Job '${job.name}' skipped — shutdown in progress.`);
    return;
  }
  if (job._running) {
    log(`[SCHEDULER] Job '${job.name}' still running — skipped overlap.`);
    return;
  }
  job._running = true;
  const promise = (async () => {
    let jobId = await jobRepo.pickJob(job.name, INSTANCE_ID);
    if (!jobId) {
      jobId = await jobRepo.startJob(job.name, INSTANCE_ID);
    }
    metrics.jobRunsTotal.inc();
    metrics.jobsByName.inc({ job: job.name });

    const heartbeat = setInterval(async () => {
      try {
        await jobRepo.renewLease(jobId);
      } catch (e) {
        warn(`[SCHEDULER] Heartbeat failed for job '${job.name}': ${e.message}`);
      }
    }, 60000);
    _heartbeats.set(job.name, heartbeat);

    try {
      await Promise.race([
        job.fn(_client),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Job ${job.name} timeout após ${JOB_TIMEOUT_MS}ms`)), JOB_TIMEOUT_MS)
        ),
      ]);
      await jobRepo.completeJob(jobId, {});
    } catch (e) {
      metrics.jobErrorsTotal.inc();
      await jobRepo.failJob(jobId, e.message);
      warn(`[SCHEDULER] Job '${job.name}' failed: ${e.message}`);
    } finally {
      const hb = _heartbeats.get(job.name);
      if (hb) {
        clearInterval(hb);
        _heartbeats.delete(job.name);
      }
      job._running = false;
    }
  })();
  _activeJobs.set(job.name, promise);
  try {
    await promise;
  } finally {
    _activeJobs.delete(job.name);
  }
}

async function drainActiveJobs(timeoutMs = 30000) {
  _shuttingDown = true;
  for (const [name, hb] of _heartbeats) {
    clearInterval(hb);
    _heartbeats.delete(name);
  }
  if (!_activeJobs.size) return;
  log(`[SCHEDULER] Draining ${_activeJobs.size} active jobs...`);
  await Promise.allSettled(
    Array.from(_activeJobs.values()).map(p => Promise.race([p, new Promise(r => setTimeout(r, timeoutMs))]))
  );
  log('[SCHEDULER] Drain complete.');
}

function startAll(client) {
  _client = client;

  if (!CONFIG.ENABLE_BACKGROUND_JOBS) {
    log('[SCHEDULER] Background jobs disabled.');
    return;
  }

  // Ranking/prize embed publishing REMOVED — user wants only entrada + radio panels.
  // if (CONFIG.AUTO_PUBLISH_WEEKLY_TOP) {
  //   registerJob('weekly_rankings', 30 * 60 * 1000, publishWeeklyTop);
  // }
  // registerJob('daily_summary', 30 * 60 * 1000, publishDailySummary);
  // registerJob('bairrista_weekly_prize', 30 * 60 * 1000, publishBairristaWeeklyPrize);

  // Reconciliação de invariantes de roles (diário, 4h da manhã aprox)
  registerJob('role_invariants', 24 * 60 * 60 * 1000, async discordClient => {
    try {
      const guild = discordClient.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
      if (!guild) return;
      const { reconcileAllMembers } = require('../members/roleInvariants');
      return reconcileAllMembers(guild, { actor: 'system:daily-job' });
    } catch (e) {
      warn(`[SCHEDULER] role_invariants failed: ${e.message}`);
    }
  });

  // Job perms_apply REMOVIDO — permissões geridas manualmente no Discord.
  // O template em structureTemplate.js serve como referência documental.
  // Canais individuais de bairrista continuam protegidos pelo onboarding
  // (buildBairristaChannelOverwrites) e promoção.

  // (Sheets sync periódico removido — a projecção é event-driven em
  // src/sheets/projections.js, que debounce eventos de domínio em syncs
  // por tab. Ver docs/ARCHITECTURE.md.)

  // DLQ retry para falhas de sync do Google Sheets
  registerJob('sheets_retry', 60 * 1000, async () => {
    return processRetries();
  });

  // Retention — corre 1x por dia (24h interval). Remove audit_logs > 365d,
  // job_runs > 90d, radio_history > 365d. Soft-delete availability > 180d.
  registerJob('retention', 24 * 60 * 60 * 1000, async () => {
    const { runRetention } = require('./retentionJob');
    return runRetention({ dryRun: false, actor: 'system:scheduler' });
  });

  // Reconcile drift Discord↔DB — corre 1x por dia (ativa).
  // Cria membros em falta na DB, sincroniza roles/tiers, e mantém
  // gauges Prometheus + relatório de drift em /versao (data health).
  registerJob(
    'reconcile_daily',
    24 * 60 * 60 * 1000,
    async discordClient => {
      const guild = discordClient?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
      if (!guild) return { skipped: 'no_guild' };
      const { runReconcile } = require('../reconcile');
      return runReconcile({ domain: 'all', guild, dryRun: false, actor: 'system:scheduler' });
    },
    { runOnStart: true }
  );

  // Data health — actualiza gauges Prometheus (stale tabs, drift, retention
  // pending, stuck jobs). Corre a cada 5 min, barato.
  registerJob(
    'data_health_collect',
    5 * 60 * 1000,
    async discordClient => {
      const guild = discordClient?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
      const { collect } = require('../lib/dataHealth');
      const r = await collect({ guild });
      return {
        stale: r.sheet?.stale,
        errors: r.sheet?.errors,
        members_drift: (r.members?.role_mismatch || 0) + (r.members?.tier_mismatch || 0),
        stuck_jobs: r.stuck_jobs?.length || 0,
      };
    },
    { runOnStart: true }
  );

  // Stock alerts REMOVED — user wants only entrada + radio panels.
  // registerJob(
  //   'stock_alerts',
  //   60 * 60 * 1000,
  //   async discordClient => {
  //     const { setClient, checkAndAlert } = require('../inventory/stockAlertEngine');
  //     setClient(discordClient);
  //     return checkAndAlert({ dryRun: false });
  //   },
  //   { runOnStart: true }
  // );

  // Rankings mensais + all-time snapshot — corre a cada 6h (idempotente).
  // No primeiro dia do mês apanha o mês anterior; resto dos dias actualiza
  // o mês corrente e mantém all_time_stats frescas.
  registerJob(
    'monthly_rankings',
    6 * 60 * 60 * 1000,
    async () => {
      const { computeMonthlyRankings, recomputeAllTimeStats } = require('../rankings/monthlyRankingEngine');
      const m = await computeMonthlyRankings();
      const a = await recomputeAllTimeStats();
      log(`[SCHEDULER] monthly_rankings: ${m.count} mês + ${a.count} all-time`);
    },
    { runOnStart: true }
  );

  // Recalcular rankings semanais na web app — corre a cada 30 min (idempotente).
  registerJob('webapp_recalc', 30 * 60 * 1000, async () => {
    const { triggerRecalc } = require('../lib/webAppClient');
    const r = await triggerRecalc('scheduled');
    log(`[SCHEDULER] webapp_recalc: ${JSON.stringify(r)}`);
  });

  // Backfill de tópicos — cria canais em falta para bairristas sem canal individual.
  // Corre 1x por dia (idempotente).
  registerJob(
    'backfill_topicos',
    24 * 60 * 60 * 1000,
    async discordClient => {
      const guild = discordClient?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
      if (!guild) return { skipped: 'no_guild' };
      const { backfill } = require('../topics/backfillTopicosJob');
      return backfill(guild, { dryRun: false });
    },
    { runOnStart: false }
  );

  // Cleanup de tópicos — arquiva canais de ex-bairristas (promovidos, saídos).
  // Corre 1x por dia (idempotente).
  registerJob(
    'cleanup_topicos',
    24 * 60 * 60 * 1000,
    async discordClient => {
      const guild = discordClient?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
      if (!guild) return { skipped: 'no_guild' };
      const { cleanup } = require('../topics/cleanupTopicosJob');
      return cleanup(guild, { dryRun: false });
    },
    { runOnStart: false }
  );

  // Sticky time refresh REMOVED — user wants only entrada + radio panels.
  // registerJob('sticky_time_refresh', 60 * 1000, async discordClient => {
  //   const { runTimeBasedRefresh } = require('../sticky/stickyEngine');
  //   return runTimeBasedRefresh(discordClient);
  // });

  // Stock summary REMOVED — user wants only entrada + radio panels.
  // if (CONFIG.STOCK_NOTIFY_ENABLED) {
  //   const intervalMs = (CONFIG.STOCK_SUMMARY_INTERVAL_HOURS || 4) * 60 * 60 * 1000;
  //   registerJob('stock_summary', intervalMs, async () => {
  //     const { publishStockSummary } = require('../inventory/stockNotifier');
  //     return publishStockSummary();
  //   });
  // }

  // ── Bairrista summary jobs REMOVED — user wants only entrada + radio panels.
  // registerJob('bairrista_daily_summary', ...);
  // registerJob('bairrista_weekly_summary', ...);
  // registerJob('bairrista_monthly_summary', ...);

  // Spot cooldown expirer — 1/min. Edita mensagem para "livre" e apaga
  // rows com expires_at <= NOW(). Índice em expires_at torna o DELETE
  // barato mesmo com muitos rows históricos.
  registerJob(
    'spot_cooldown_expirer',
    60 * 1000,
    async discordClient => {
      const { runExpirer } = require('../saidas/spotCooldown');
      return runExpirer(discordClient);
    },
    { runOnStart: true }
  );

  // Saida request expirer — 1/min. Auto-rejeita pedidos 'requested' com
  // idade > SAIDA_REQUEST_TTL_MINUTES (default 15min). DM ao requester.
  registerJob('saida_request_expirer', 60 * 1000, async discordClient => {
    const { expireStaleRequests } = require('../saidas/saidaEngine');
    return expireStaleRequests(discordClient);
  });

  // Leaderboard live refresh REMOVED — user wants only entrada + radio panels.
  // registerJob(
  //   'leaderboard_refresh',
  //   5 * 60 * 1000,
  //   async discordClient => {
  //     const { publishOrRefresh, setClient } = require('../leaderboard/leaderboardPublisher');
  //     setClient(discordClient);
  //     return publishOrRefresh(discordClient, { force: true });
  //   },
  //   { runOnStart: true }
  // );

  for (const job of jobs) {
    job.timer = setInterval(() => runJob(job), job.intervalMs);
    job.timer.unref();
    log(`[SCHEDULER] Job '${job.name}' registered (${job.intervalMs / 1000}s interval).`);
  }

  // Run critical jobs immediately at boot (don't wait for first interval)
  const onStartJobs = jobs.filter(j => j.runOnStart);
  if (onStartJobs.length) {
    log(`[SCHEDULER] Running ${onStartJobs.length} jobs on start...`);
    for (const job of onStartJobs) {
      runJob(job).catch(e => warn(`[SCHEDULER] on-start '${job.name}' failed: ${e.message}`));
    }
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

module.exports = { startAll, stopAll, registerJob, drainActiveJobs };
