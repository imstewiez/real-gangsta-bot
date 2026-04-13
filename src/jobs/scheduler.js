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

  registerJob('weekly_rankings', 60 * 60 * 1000, publishWeeklyTop);
  registerJob('daily_summary', 60 * 60 * 1000, publishDailySummary);

  // Sync para Google Sheets a cada 30 minutos
  if (CONFIG.SPREADSHEET_ID) {
    const { syncAll } = require('../sheets/inventorySync');
    registerJob('sheets_sync', 30 * 60 * 1000, async () => { await syncAll(); });
  }

  for (const job of jobs) {
    job.timer = setInterval(() => runJob(job), job.intervalMs);
    job.timer.unref();
    log(`[SCHEDULER] Job '${job.name}' registered (${job.intervalMs / 1000}s interval).`);
  }

  const now = new Date();
  const isSunday = now.getDay() === 0;
  const is23h = now.getHours() === 23;
  if (isSunday && is23h) {
    runJob(jobs.find(j => j.name === 'weekly_rankings'));
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
