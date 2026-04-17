// src/db.js
'use strict';
const { Pool, Client } = require('pg');

// DATABASE_URL validada quando o pool é usado, não no import.
// Permite que testes e tooling importem o módulo sem crash.
const _DB_URL = process.env.DATABASE_URL;

// SSL config:
//   - Dev: SSL off.
//   - Railway: Postgres interno usa cert self-signed numa rede privada — relax.
//   - Outros ambientes produção: strict por default; override explícito via
//     DB_SSL_INSECURE=true se a DB usar cert self-signed.
function _resolveSSL() {
  if (process.env.NODE_ENV !== 'production') return false;
  if (process.env.DB_SSL_INSECURE === 'true') return { rejectUnauthorized: false };
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) {
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}
const SSL_CFG = _resolveSSL();

const POOL_MAX = parseInt(process.env.DB_POOL_MAX, 10) || 20;

const pool = _DB_URL
  ? new Pool({
      connectionString: _DB_URL,
      ssl: SSL_CFG,
      max: POOL_MAX,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : null;

if (pool) {
  pool.on('error', err => {
    console.error('[DB] Erro inesperado no pool de conexões:', err.message);
  });
}

// Threshold para log de queries lentas (ms). Configurável via DB_SLOW_QUERY_MS.
// Railway Postgres tem cold starts frequentes — 1500ms evita ruído falso.
const SLOW_QUERY_MS = parseInt(process.env.DB_SLOW_QUERY_MS, 10) || 1500;

// Métricas de query (lazy — evita dependência circular no load)
let _queryCounter = null;
let _slowQueryCounter = null;
function _ensureMetrics() {
  if (_queryCounter) return;
  try {
    const m = require('./lib/metrics');
    _queryCounter = m.counter('rg_db_queries_total', 'Total DB queries executed');
    _slowQueryCounter = m.counter('rg_db_slow_queries_total', 'DB queries exceeding slow threshold');
  } catch {
    /* metrics não carregado ainda */
  }
}

async function query(text, params) {
  if (!pool) throw new Error('[DB] DATABASE_URL não está definida — impossível executar queries.');
  _ensureMetrics();
  const start = Date.now();
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    if (_queryCounter) _queryCounter.inc();
    if (duration >= SLOW_QUERY_MS) {
      if (_slowQueryCounter) _slowQueryCounter.inc();
      const preview = String(text).replace(/\s+/g, ' ').slice(0, 120);
      // Lazy require — logger pode não estar carregado durante boot
      try {
        require('./logger').warn(
          `[DB:SLOW] ${duration}ms · ${preview}${params?.length ? ` · params: ${params.length}` : ''}`
        );
      } catch {
        console.warn(`[DB:SLOW] ${duration}ms · ${preview}`);
      }
    }
    return result;
  } finally {
    client.release();
  }
}

async function queryWithTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Singleton lock via PostgreSQL advisory lock ──────────────────────────────
// Usa uma conexão dedicada (não do pool) para que o lock seja libertado
// automaticamente quando o processo termina — impede duas instâncias simultâneas.
// Configurável via INSTANCE_LOCK_ID env (default: 985432107) para evitar colisão
// se partilhares a mesma DB com outro bot.
const ADVISORY_LOCK_ID = parseInt(process.env.INSTANCE_LOCK_ID, 10) || 985432107;
let _lockClient = null;

// Tenta adquirir o lock com retry — aguarda até maxWaitMs pelo container anterior terminar
async function _acquireInstanceLock() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: SSL_CFG });
  await c.connect();
  const res = await c.query('SELECT pg_try_advisory_lock($1) AS acquired', [ADVISORY_LOCK_ID]);
  if (!res.rows[0].acquired) {
    await c.end();
    return false;
  }
  _lockClient = c;
  _lockClient.on('error', () => {});
  return true;
}

async function acquireInstanceLockWithRetry(maxWaitMs = 40000) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < maxWaitMs) {
    attempt++;
    const acquired = await _acquireInstanceLock().catch(() => false);
    if (acquired) return true;
    console.log(`[Boot] Lock ocupado (tentativa ${attempt}), a aguardar 4s...`);
    await new Promise(r => setTimeout(r, 4000));
  }
  return false;
}

async function releaseInstanceLock() {
  if (_lockClient) {
    try {
      await _lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (_) {
      /* cleanup best-effort */
    }
    try {
      await _lockClient.end();
    } catch (_) {
      /* cleanup best-effort */
    }
    _lockClient = null;
  }
}

// Warmup — abre N conexões no pool para evitar cold starts nas primeiras queries.
// Chamar uma vez no boot, antes dos jobs e sheets sync arrancarem.
async function warmPool(n = 3) {
  if (!pool) return;
  const clients = [];
  try {
    for (let i = 0; i < Math.min(n, POOL_MAX); i++) {
      clients.push(await pool.connect());
    }
    // Query leve para forçar o Postgres a responder
    if (clients.length) await clients[0].query('SELECT 1');
  } catch (e) {
    console.warn(`[DB] Pool warmup falhou (non-fatal): ${e.message}`);
  } finally {
    for (const c of clients) c.release();
  }
}

module.exports = { pool, query, queryWithTransaction, acquireInstanceLockWithRetry, releaseInstanceLock, warmPool };
