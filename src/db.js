// src/db.js
'use strict';
const { Pool, Client } = require('pg');

// DATABASE_URL validada quando o pool é usado, não no import.
// Permite que testes e tooling importem o módulo sem crash.
const _DB_URL = process.env.DATABASE_URL;

// SSL config:
//   - DB_SSL_MODE env var tem prioridade absoluta:
//       'off'    → sem SSL
//       'require'→ SSL sem verificação de certificado
//       'verify' → SSL com verificação estrita
//   - Sem DB_SSL_MODE, auto-detect (legacy):
//       Dev → off | Railway → require | Produção → verify
//       Override: DB_SSL_INSECURE=true → require
function _resolveSSL() {
  const mode = (process.env.DB_SSL_MODE || '').toLowerCase();
  if (mode === 'off' || mode === 'false') return false;
  if (mode === 'verify') return { rejectUnauthorized: true };
  if (mode === 'require') return { rejectUnauthorized: false };
  // Auto-detect (legacy behavior)
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
      statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT, 10) || 30000,
      query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT, 10) || 35000,
    })
  : null;

if (pool) {
  pool.on('error', err => {
    require('./logger').error('[DB] Erro inesperado no pool de conexões:', err.message);
  });

  // Log pool exhaustion: when all connections are in use and a new acquire
  // is queued, warn so ops can tune DB_POOL_MAX or investigate slow queries.
  pool.on('connect', () => {
    const waiting = pool.waitingCount || 0;
    const total = pool.totalCount || 0;
    if (waiting > 0) {
      try {
        require('./logger').warn(
          `[DB:POOL] Nova conexão criada com ${waiting} queries em fila (total=${total}/${POOL_MAX}). ` +
            'Considerar aumentar DB_POOL_MAX ou investigar queries lentas.'
        );
      } catch {
        console.warn(`[DB:POOL] Nova conexão criada com ${waiting} queries em fila (total=${total}/${POOL_MAX}).`);
      }
    }
  });
}

// Threshold para log de queries lentas (ms). Configurável via DB_SLOW_QUERY_MS.
// Default: 500ms (production-grade). Railway cold starts podem ser mais lentos —
// aumentar para 1500ms via DB_SLOW_QUERY_MS se houver ruído falso no boot.
const SLOW_QUERY_MS = parseInt(process.env.DB_SLOW_QUERY_MS, 10) || 500;

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
      const preview = String(text).replace(/\s+/g, ' ').slice(0, 200);
      const poolStats = pool
        ? `pool(total=${pool.totalCount}|idle=${pool.idleCount}|waiting=${pool.waitingCount})`
        : '';
      // Lazy require — logger pode não estar carregado durante boot
      try {
        require('./logger').warn(
          `[DB:SLOW] ${duration}ms · ${preview}` +
            `${params?.length ? ` · params:${params.length}` : ''}` +
            `${poolStats ? ` · ${poolStats}` : ''}`
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
  if (!pool) throw new Error('[DB] DATABASE_URL não está definida — impossível iniciar transacção.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Log rollback failure but always re-throw the original error
      try {
        require('./logger').warn(`[DB:TX] ROLLBACK falhou: ${rollbackErr.message}`);
      } catch {
        console.warn(`[DB:TX] ROLLBACK falhou: ${rollbackErr.message}`);
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Corre `callback` dentro de uma transação com `pg_advisory_xact_lock` adquirido.
 * O lock liberta automaticamente no COMMIT/ROLLBACK — imune a process crash.
 *
 * Usar para regiões críticas pequenas onde 2 requests concorrentes para a
 * mesma entidade podem race (ex: promoção automática, UPSERT de agregados).
 *
 * A key pode ser:
 *   - string → hashed via `hashtext()` do Postgres (case-sensitive, estável)
 *   - number → usado directamente como bigint
 *
 * O lock é **blocking**. Segundo caller espera. Região crítica deve ser
 * pequena (zero chamadas I/O externas tipo Discord API); senão o pool trava.
 *
 * @param {string|number} key
 * @param {(client) => Promise<T>} callback
 * @returns {Promise<T>}
 */
async function withAdvisoryLock(key, callback) {
  return queryWithTransaction(async client => {
    if (typeof key === 'string') {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::int)', [key]);
    } else if (typeof key === 'number' && Number.isFinite(key)) {
      await client.query('SELECT pg_advisory_xact_lock($1)', [key]);
    } else {
      throw new Error(`[DB] withAdvisoryLock: key deve ser string ou number, recebeu ${typeof key}`);
    }
    return callback(client);
  });
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
    require('./logger').log(`[Boot] Lock ocupado (tentativa ${attempt}), a aguardar 4s...`);
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
    require('./logger').warn(`[DB] Pool warmup falhou (non-fatal): ${e.message}`);
  } finally {
    for (const c of clients) c.release();
  }
}

module.exports = {
  pool,
  query,
  queryWithTransaction,
  withAdvisoryLock,
  acquireInstanceLockWithRetry,
  releaseInstanceLock,
  warmPool,
};
