'use strict';
/**
 * Rate limiter simples em memória — previne spam de slash commands,
 * botões e modais por utilizador.
 *
 * Estratégia:
 *   - Chave composta: `${userId}::${actionKey}`
 *   - Janela deslizante simples com contadores (não token bucket —
 *     overkill para este scale)
 *   - Map limpo periodicamente para evitar leak
 *
 * Uso:
 *   const rl = require('./shared/rateLimiter');
 *   if (!rl.allow(userId, 'rg-member', { limit: 5, windowMs: 10000 })) {
 *     return safeReply(interaction, { content: rl.denyMessage() });
 *   }
 */

const BUCKETS = new Map();
const CLEAN_EVERY_MS = 60_000;

let _cleanupInterval = null;
function _ensureCleanup() {
  if (_cleanupInterval) return;
  _cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of BUCKETS) {
      if (b.resetAt < now - CLEAN_EVERY_MS) BUCKETS.delete(k);
    }
  }, CLEAN_EVERY_MS);
  if (_cleanupInterval.unref) _cleanupInterval.unref();
}

/**
 * Devolve true se pode executar, false se está em rate limit.
 *
 * @param {string} userId
 * @param {string} actionKey — ex: 'rg-member', 'bairrista::registar_material'
 * @param {{limit:number, windowMs:number}} opts
 * @returns {boolean}
 */
function allow(userId, actionKey, { limit = 5, windowMs = 10_000 } = {}) {
  _ensureCleanup();
  const key = `${userId}::${actionKey}`;
  const now = Date.now();
  const bucket = BUCKETS.get(key);
  if (!bucket || bucket.resetAt < now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) {
    try { require('../lib/metrics').rateLimitDenialsTotal?.inc(); } catch (_) {}
    return false;
  }
  bucket.count += 1;
  return true;
}

/**
 * Retorna ms até o bucket resetar (0 se não em limit).
 */
function retryAfter(userId, actionKey) {
  const key = `${userId}::${actionKey}`;
  const bucket = BUCKETS.get(key);
  if (!bucket) return 0;
  return Math.max(0, bucket.resetAt - Date.now());
}

function denyMessage(retryAfterMs) {
  if (retryAfterMs && retryAfterMs > 0) {
    const s = Math.ceil(retryAfterMs / 1000);
    return `⏱️ Calma — tenta de novo em ${s}s.`;
  }
  return '⏱️ Calma — demasiados pedidos seguidos.';
}

/** Reset explícito (testes). */
function _reset() { BUCKETS.clear(); }

module.exports = { allow, retryAfter, denyMessage, _reset };
