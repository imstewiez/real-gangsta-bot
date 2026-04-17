'use strict';
const { query } = require('../db');

async function startJob(jobName) {
  const res = await query('INSERT INTO job_runs (job_name, status) VALUES ($1, $2) RETURNING id', [jobName, 'running']);
  return res.rows[0].id;
}

async function completeJob(id, result = {}) {
  await query('UPDATE job_runs SET status = $1, result = $2, finished_at = NOW() WHERE id = $3', [
    'completed',
    JSON.stringify(result),
    id,
  ]);
}

async function failJob(id, error) {
  await query('UPDATE job_runs SET status = $1, error = $2, finished_at = NOW() WHERE id = $3', ['failed', error, id]);
}

async function getRecent(jobName, limit = 10) {
  const res = await query('SELECT * FROM job_runs WHERE job_name = $1 ORDER BY started_at DESC LIMIT $2', [
    jobName,
    limit,
  ]);
  return res.rows;
}

module.exports = { startJob, completeJob, failJob, getRecent };
