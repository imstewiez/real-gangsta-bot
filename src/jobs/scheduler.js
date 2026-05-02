'use strict';
const { publishWeeklyTop, publishDailySummary } = require('../rankings/rankingJobs');
const {
  publishBairristaDailySummary,
  publishBairristaWeeklySummary,
  publishBairristaMonthlySummary,
} = require('../rankings/bairristaSummaryJobs');
const { jobRepo } = require('../repositories');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const CONFIG = require('../config');

const jobs = [];
let _client = null;

function registerJob(name, intervalMs, fn, opts = {}) {
  jobs.push({ name, intervalMs, fn, timer: null, _running: false, runOnStart: opts.runOnStart || false });
}

async function runJob(job) {
  if (job._running) {
    log(`[SCHEDULER] Job '${job.name}' still running — skipped overlap.`);
    return;
  }
  job._running = true;
  const jobId = await jobRepo.startJob(job.name);
  metrics.jobRunsTotal.inc();
  metrics.jobsByName.inc({ job: job.name });

  try {
    const result = await job.fn(_client);
    await jobRepo.completeJob(jobId, result || {});
  } catch (e) {
    metrics.jobErrorsTotal.inc();
    await jobRepo.failJob(jobId, e.message);
    warn(`[SCHEDULER] Job '${job.name}' failed: ${e.message}`);
  } finally {
    job._running = false;
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
  registerJob('role_invariants', 24 * 60 * 60 * 1000, async client => {
    try {
      const guild = client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
      if (!guild) return;
      const { reconcileAllMembers } = require('../members/roleInvariants');
      return await reconcileAllMembers(guild, { actor: 'system:daily-job' });
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

  // Retention — corre 1x por dia (24h interval). Remove audit_logs > 365d,
  // job_runs > 90d, radio_history > 365d. Soft-delete availability > 180d.
  registerJob('retention', 24 * 60 * 60 * 1000, async () => {
    const { runRetention } = require('./retentionJob');
    return await runRetention({ dryRun: false, actor: 'system:scheduler' });
  });

  // Reconcile drift Discord↔DB — corre 1x por dia (dry-run). Os fixes
  // aplicam-se diariamente via `role_invariants` acima. Este job existe
  // para gauges Prometheus + relatório de drift em /versao (data health).
  registerJob('reconcile_daily', 24 * 60 * 60 * 1000, async client => {
    const guild = client?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
    if (!guild) return { skipped: 'no_guild' };
    const { runReconcile } = require('../reconcile');
    return await runReconcile({ domain: 'all', guild, dryRun: true, actor: 'system:scheduler' });
  });

  // Data health — actualiza gauges Prometheus (stale tabs, drift, retention
  // pending, stuck jobs). Corre a cada 5 min, barato.
  registerJob(
    'data_health_collect',
    5 * 60 * 1000,
    async client => {
      const guild = client?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
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

  // Stock alerts — corre hourly. Verifica items com alert_threshold definido
  // e posta no canal alertas-stock se balance < threshold. Throttle 24h.
  registerJob(
    'stock_alerts',
    60 * 60 * 1000,
    async client => {
      const { setClient, checkAndAlert } = require('../inventory/stockAlertEngine');
      setClient(client);
      return await checkAndAlert({ dryRun: false });
    },
    { runOnStart: true }
  );

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

  // Backfill de tópicos — cria canais em falta para bairristas sem canal individual.
  // Corre 1x por dia (idempotente).
  registerJob(
    'backfill_topicos',
    24 * 60 * 60 * 1000,
    async client => {
      const guild = client?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
      if (!guild) return { skipped: 'no_guild' };
      const { backfill } = require('../topics/backfillTopicosJob');
      return await backfill(guild, { dryRun: false });
    },
    { runOnStart: false }
  );

  // Cleanup de tópicos — arquiva canais de ex-bairristas (promovidos, saídos).
  // Corre 1x por dia (idempotente).
  registerJob(
    'cleanup_topicos',
    24 * 60 * 60 * 1000,
    async client => {
      const guild = client?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
      if (!guild) return { skipped: 'no_guild' };
      const { cleanup } = require('../topics/cleanupTopicosJob');
      return await cleanup(guild, { dryRun: false });
    },
    { runOnStart: false }
  );

  // Catalog prices — DESACTIVADO. O precário agora é gerido via
  // scripts/manual/importPriceList.js a partir de lista_precos_corrigida.json.
  // Removido para evitar sobrescrever preços importados manualmente.
  // registerJob(
  //   'catalog_prices',
  //   7 * 24 * 60 * 60 * 1000,
  //   async () => {
  //     const { runCatalogPricesSync } = require('./catalogPricesJob');
  //     return await runCatalogPricesSync();
  //   },
  //   { runOnStart: true }
  // );

  // Sticky messages — refresh time-based (modo repost com threshold_minutes)
  registerJob('sticky_time_refresh', 60 * 1000, async client => {
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
    const { createSession, closeSession, todayDateString } = require('../availability/availabilityEngine');
    registerJob('availability_auto_publish', 5 * 60 * 1000, async client => {
      const now = new Date();
      const lisbonHour = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: 'numeric', hour12: false }).format(now)
      );
      if (lisbonHour !== CONFIG.AVAILABILITY_AUTO_PUBLISH_HOUR) return { skipped: 'wrong_hour' };
      const date = todayDateString();

      // Fecha qualquer sessão aberta do dia anterior ANTES de criar a nova.
      // Reset diário completo às 07:00 — os votos do dia ficam congelados
      // (historial) e uma sessão fresca substitui-a.
      const prevOpen = await availabilityRepo.findOpenBefore(CONFIG.AVAILABILITY_CHANNEL_ID, date).catch(() => []);
      for (const sess of prevOpen) {
        await closeSession({ client, sessionId: sess.id, actorId: 'system:daily-reset' }).catch(() => {});
      }

      const existing = await availabilityRepo.getOpenSession(CONFIG.AVAILABILITY_CHANNEL_ID, date);
      if (existing) return { skipped: 'already_open', sessionId: existing.id, closedPrev: prevOpen.length };
      const { session } = await createSession({
        client,
        channelId: CONFIG.AVAILABILITY_CHANNEL_ID,
        createdBy: 'system:auto-publish',
      });
      return { sessionId: session.id, closedPrev: prevOpen.length };
    });
  }

  // ── Bairrista summary jobs ────────────────────────────────────────────
  // Resumo diário: corre de 30 em 30 min, publica 1x por dia no canal
  // log-bairristas (idempotente — se totalQty=0 faz skip).
  registerJob('bairrista_daily_summary', 30 * 60 * 1000, async () => {
    const now = new Date();
    const lisbonHour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: 'numeric', hour12: false }).format(now)
    );
    if (lisbonHour !== (CONFIG.BAIRRISTA_DAILY_SUMMARY_HOUR || 23)) return { skipped: 'wrong_hour' };
    return await publishBairristaDailySummary();
  });

  // Resumo semanal: corre de 6 em 6h, publica na sexta (dia 5).
  registerJob('bairrista_weekly_summary', 6 * 60 * 60 * 1000, async () => {
    const now = new Date();
    if (now.getDay() !== (CONFIG.BAIRRISTA_WEEKLY_SUMMARY_DAY || 5)) return { skipped: 'wrong_day' };
    return await publishBairristaWeeklySummary();
  });

  // Resumo mensal: corre de 12 em 12h, publica no dia 1 de cada mês.
  registerJob('bairrista_monthly_summary', 12 * 60 * 60 * 1000, async () => {
    const now = new Date();
    if (now.getDate() !== 1) return { skipped: 'not_first_day' };
    return await publishBairristaMonthlySummary();
  });

  // Spot cooldown expirer — 1/min. Edita mensagem para "livre" e apaga
  // rows com expires_at <= NOW(). Índice em expires_at torna o DELETE
  // barato mesmo com muitos rows históricos.
  registerJob(
    'spot_cooldown_expirer',
    60 * 1000,
    async client => {
      const { runExpirer } = require('../saidas/spotCooldown');
      return await runExpirer(client);
    },
    { runOnStart: true }
  );

  // Saida request expirer — 1/min. Auto-rejeita pedidos 'requested' com
  // idade > SAIDA_REQUEST_TTL_MINUTES (default 15min). DM ao requester.
  registerJob('saida_request_expirer', 60 * 1000, async client => {
    const { expireStaleRequests } = require('../saidas/saidaEngine');
    return await expireStaleRequests(client);
  });

  // Leaderboard live refresh — 5 min. runOnStart garante panel publicado
  // sem esperar pelo 1º intervalo após reboot. Idempotente via DB state.
  registerJob(
    'leaderboard_refresh',
    5 * 60 * 1000,
    async client => {
      const { publishOrRefresh, setClient } = require('../leaderboard/leaderboardPublisher');
      setClient(client);
      // force=true: scheduler sempre refresca no tick (ignora debounce
      // global que só protege path manual contra burst de N users).
      return await publishOrRefresh(client, { force: true });
    },
    { runOnStart: true }
  );

  // Price list embed refresh — 30 min. Atualiza o embed de preços e fórmulas.
  registerJob(
    'price_list_refresh',
    30 * 60 * 1000,
    async client => {
      const { publishPriceListEmbed } = require('../prices/priceListPublisher');
      return await publishPriceListEmbed(client);
    },
    { runOnStart: true }
  );

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

module.exports = { startAll, stopAll, registerJob };
