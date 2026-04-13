// src/db.js
'use strict';
const { Pool, Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[DB] FATAL: DATABASE_URL não está definida. Configura a variável de ambiente antes de arrancar o bot.');
  process.exit(1);
}

const SSL_CFG = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;

const POOL_MAX = parseInt(process.env.DB_POOL_MAX, 10) || 20;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: SSL_CFG,
  max: POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool de conexões:', err.message);
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
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
    try { await _lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]); } catch (_) {}
    try { await _lockClient.end(); } catch (_) {}
    _lockClient = null;
  }
}

module.exports = { pool, query, queryWithTransaction, acquireInstanceLockWithRetry, releaseInstanceLock };
