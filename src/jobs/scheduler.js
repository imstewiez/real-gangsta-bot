'use strict';
const { hostname } = require('os');
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

  // Pós-migração para webapp:
  // - sem Google Sheets;
  // - sem dashboards/painéis/rankings publicados pelo bot;
  // - sem backfill/cleanup de tópicos;
  // - sem data-health pesado no arranque.
  // O bot mantém apenas tarefas que dependem do Discord/eventos em tempo real.

  if (CONFIG.ENFORCE_ROLE_INVARIANTS) {
    registerJob(
      'discord_membership_reconcile',
      24 * 60 * 60 * 1000,
      async discordClient => {
        try {
          const guild = discordClient.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
          if (!guild) return;
          const { reconcileDiscordMembership } = require('../members/roleInvariants');
          return reconcileDiscordMembership(guild, { actor: 'system:daily-discord-reconcile' });
        } catch (e) {
          warn(`[SCHEDULER] discord_membership_reconcile failed: ${e.message}`);
        }
      },
      // O arranque já corre membershipReconcile na fase READY. Não correr de novo
      // pelo scheduler evita fetch duplicado ao Discord e warnings de rate-limit.
      { runOnStart: false }
    );
  }

  registerJob('retention', 24 * 60 * 60 * 1000, async () => {
    const { runRetention } = require('./retentionJob');
    return runRetention({ dryRun: false, actor: 'system:scheduler' });
  });

  registerJob(
    'spot_cooldown_expirer',
    60 * 1000,
    async discordClient => {
      const { runExpirer } = require('../saidas/spotCooldown');
      return runExpirer(discordClient);
    },
    { runOnStart: false }
  );

  registerJob('saida_request_expirer', 60 * 1000, async discordClient => {
    const { expireStaleRequests } = require('../saidas/saidaEngine');
    return expireStaleRequests(discordClient);
  });

  for (const job of jobs) {
    job.timer = setInterval(() => runJob(job), job.intervalMs);
    job.timer.unref();
    log(`[SCHEDULER] Job '${job.name}' registered (${job.intervalMs / 1000}s interval).`);
  }

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
