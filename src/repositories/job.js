'use strict';
const { query } = require('../db');

async function pickJob(jobName, instanceId) {
  const res = await query(
    `UPDATE job_runs
     SET status='running', started_at=NOW(), lease_expires_at=NOW() + INTERVAL '5 minutes', instance_id=$1
     WHERE id = (
       SELECT id FROM job_runs
       WHERE job_name=$2 AND (status='pending' OR (status='running' AND lease_expires_at < NOW()))
       ORDER BY scheduled_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id`,
    [instanceId, jobName]
  );
  return res.rows[0]?.id || null;
}

async function startJob(jobName, instanceId) {
  const res = await query(
    `INSERT INTO job_runs (job_name, status, lease_expires_at, instance_id, scheduled_at)
     VALUES ($1, $2, NOW() + INTERVAL '5 minutes', $3, NOW()) RETURNING id`,
    [jobName, 'running', instanceId]
  );
  return res.rows[0].id;
}

async function renewLease(id) {
  await query("UPDATE job_runs SET lease_expires_at = NOW() + INTERVAL '5 minutes' WHERE id = $1", [id]);
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

module.exports = { pickJob, startJob, renewLease, completeJob, failJob, getRecent };
