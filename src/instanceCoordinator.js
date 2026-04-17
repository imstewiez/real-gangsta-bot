'use strict';
/**
 * Single-instance coordination with newest-wins preemption.
 *
 * Fluxo:
 *   1. ensureInstanceTable()      — cria bot_instances se ainda não existir (idempotente)
 *   2. cleanupStaleInstances()    — remove linhas cujo heartbeat já morreu
 *   3. registerInstance()         — insere linha com started_at = NOW()
 *   4. (caller adquire advisory lock com retry longo)
 *   5. startHeartbeat(onPreempt)  — a cada HEARTBEAT_MS: actualiza heartbeat + detecta rival mais novo
 *   6. deregisterInstance(reason) — apaga a linha no shutdown
 *
 * Regra de preempção: se outra instância tem started_at > o meu → sou o velho, desligo.
 */
const { randomUUID } = require('crypto');
const os = require('os');
const { query } = require('./db');
const { log, warn } = require('./logger');
const pkg = require('../package.json');

const HEARTBEAT_MS = 15000;
const STALE_SECONDS = 120;

let _state = null;

async function ensureInstanceTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS bot_instances (
      instance_id     UUID PRIMARY KEY,
      version         TEXT NOT NULL DEFAULT '',
      git_sha         TEXT NOT NULL DEFAULT '',
      pid             INTEGER,
      hostname        TEXT NOT NULL DEFAULT '',
      started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      shutdown_reason TEXT
    )
  `);
}

async function cleanupStaleInstances() {
  const res = await query(
    "DELETE FROM bot_instances WHERE last_heartbeat < NOW() - ($1 || ' seconds')::interval RETURNING instance_id",
    [String(STALE_SECONDS)]
  );
  if (res.rowCount > 0)
    log(`[INSTANCE] Removidas ${res.rowCount} instâncias stale (>${STALE_SECONDS}s sem heartbeat).`);
  return res.rowCount;
}

async function registerInstance() {
  const instanceId = randomUUID();
  const version = pkg.version || '';
  const gitSha = process.env.GIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || '';
  const pid = process.pid;
  const hostname = os.hostname();
  const res = await query(
    `INSERT INTO bot_instances (instance_id, version, git_sha, pid, hostname)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING started_at`,
    [instanceId, version, gitSha, pid, hostname]
  );
  _state = {
    instanceId,
    version,
    gitSha,
    pid,
    hostname,
    startedAt: res.rows[0].started_at,
    heartbeatTimer: null,
  };
  const shortSha = gitSha ? `@${gitSha.slice(0, 7)}` : '';
  log(`[INSTANCE] Registada ${instanceId} (v${version}${shortSha}, pid=${pid}, host=${hostname}).`);
  return { ..._state };
}

function getCurrentInstance() {
  if (!_state) return null;
  const { heartbeatTimer, ...rest } = _state;
  return rest;
}

async function _tick(onPreempted) {
  if (!_state) return;
  try {
    await query('UPDATE bot_instances SET last_heartbeat = NOW() WHERE instance_id = $1', [_state.instanceId]);
    const res = await query(
      `SELECT instance_id, version, git_sha, started_at
         FROM bot_instances
        WHERE started_at > $1 AND instance_id <> $2
        ORDER BY started_at DESC
        LIMIT 1`,
      [_state.startedAt, _state.instanceId]
    );
    if (res.rowCount > 0) {
      const newer = res.rows[0];
      warn(
        `[INSTANCE] Preempção: ${newer.instance_id} (started_at=${newer.started_at.toISOString()}) é mais recente. A desligar…`
      );
      stopHeartbeat();
      if (typeof onPreempted === 'function') onPreempted('preempted');
    }
  } catch (e) {
    warn(`[INSTANCE] Heartbeat falhou: ${e.message}`);
  }
}

function startHeartbeat(onPreempted) {
  if (!_state) throw new Error('registerInstance deve ser chamado antes de startHeartbeat');
  if (_state.heartbeatTimer) return;
  _state.heartbeatTimer = setInterval(() => _tick(onPreempted), HEARTBEAT_MS);
  if (_state.heartbeatTimer.unref) _state.heartbeatTimer.unref();
  log(`[INSTANCE] Heartbeat iniciado (intervalo ${HEARTBEAT_MS}ms).`);
}

function stopHeartbeat() {
  if (_state && _state.heartbeatTimer) {
    clearInterval(_state.heartbeatTimer);
    _state.heartbeatTimer = null;
  }
}

async function deregisterInstance(reason = 'shutdown') {
  if (!_state) return;
  stopHeartbeat();
  try {
    await query('DELETE FROM bot_instances WHERE instance_id = $1', [_state.instanceId]);
    log(`[INSTANCE] Deregistada ${_state.instanceId} (motivo: ${reason}).`);
  } catch (e) {
    warn(`[INSTANCE] Falha a remover registo: ${e.message}`);
  }
  _state = null;
}

module.exports = {
  ensureInstanceTable,
  cleanupStaleInstances,
  registerInstance,
  getCurrentInstance,
  startHeartbeat,
  stopHeartbeat,
  deregisterInstance,
  HEARTBEAT_MS,
  STALE_SECONDS,
};
