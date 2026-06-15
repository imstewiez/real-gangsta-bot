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
  if (_shuttingDown || job._running) return;
  job._running = true;
  const promise = (async () => {
    let jobId = await jobRepo.pickJob(job.name, INSTANCE_ID);
    if (!jobId) jobId = await jobRepo.startJob(job.name, INSTANCE_ID);
    metrics.jobRunsTotal.inc();
    metrics.jobsByName.inc({ job: job.name });

    const heartbeat = setInterval(async () => {
      try {
        await jobRepo.renewLease(jobId);
      } catch (e) {
        warn(`[SCHEDULER] Heartbeat failed for '${job.name}': ${e.message}`);
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
      warn(`[SCHEDULER] '${job.name}' failed: ${e.message}`);
    } finally {
      const hb = _heartbeats.get(job.name);
      if (hb) clearInterval(hb);
      _heartbeats.delete(job.name);
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
  await Promise.allSettled(
    Array.from(_activeJobs.values()).map(p => Promise.race([p, new Promise(r => setTimeout(r, timeoutMs))]))
  );
}

function startAll(client) {
  _client = client;
  jobs.length = 0;
  _shuttingDown = false;

  if (!CONFIG.ENABLE_BACKGROUND_JOBS) {
    log('[SCHEDULER] Background jobs disabled.');
    return;
  }

  registerJob(
    'bot_outbox_events',
    parseInt(process.env.BOT_OUTBOX_INTERVAL_MS, 10) || 15000,
    async discordClient => {
      const { processPendingOutboxEvents } = require('../members/botOutboxProcessor');
      return processPendingOutboxEvents(discordClient, { limit: 5 });
    },
    { runOnStart: true }
  );

  registerJob(
    'daily_availability_panel',
    parseInt(process.env.AVAILABILITY_PANEL_CHECK_MS, 10) || 60000,
    async discordClient => {
      const { publishAvailabilityPanel } = require('../availability/dailyAvailabilityPanel');
      return publishAvailabilityPanel(discordClient);
    },
    { runOnStart: true }
  );

  for (const job of jobs) {
    job.timer = setInterval(() => runJob(job), job.intervalMs);
    job.timer.unref();
    log(`[SCHEDULER] Job '${job.name}' registered (${job.intervalMs / 1000}s interval).`);
  }

  for (const job of jobs.filter(j => j.runOnStart)) {
    runJob(job).catch(e => warn(`[SCHEDULER] on-start '${job.name}' failed: ${e.message}`));
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
