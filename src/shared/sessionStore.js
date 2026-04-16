'use strict';
/**
 * Session store — estado efémero por utilizador para fluxos multi-step
 * (e.g. registar material, criar saída). Cada entrada tem timestamp `_ts`
 * automático; entradas abandonadas são limpas por sweeper periódico.
 *
 * Implementação actual: in-memory Map por instância.
 * Nota: o bot corre como singleton (advisory lock + heartbeat + preempção),
 * portanto sessions in-memory funcionam bem entre interacções. Numa migração
 * futura para DB (tabela `interaction_sessions`), só esta factory muda.
 *
 * API:
 *   const store = createSessionStore('saida', { ttlMs: 15 * 60_000 });
 *   store.set('user_123', { saidaId: 42 });
 *   store.get('user_123');   // { saidaId: 42, _ts: ... }
 *   store.delete('user_123');
 *   store.size();
 */

const { log } = require('../logger');

const SWEEP_EVERY_MS = 60_000;

function createSessionStore(name, { ttlMs } = {}) {
  if (!name) throw new Error('sessionStore: name é obrigatório.');
  if (!ttlMs || ttlMs < 1000) throw new Error('sessionStore: ttlMs inválido.');

  const data = new Map();

  const sweeper = setInterval(() => {
    const now = Date.now();
    let removed = 0;
    for (const [key, ctx] of data) {
      if (ctx._ts && now - ctx._ts > ttlMs) {
        data.delete(key);
        removed++;
      }
    }
    if (removed > 0) log(`[SESSION:${name}] sweep removeu ${removed} entradas.`);
  }, SWEEP_EVERY_MS);
  sweeper.unref();

  return {
    name,
    ttlMs,
    set(key, ctx) {
      data.set(key, { ...ctx, _ts: Date.now() });
    },
    get(key) {
      return data.get(key);
    },
    delete(key) {
      return data.delete(key);
    },
    has(key) {
      return data.has(key);
    },
    size() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    // Para testes — expõe o map interno e permite parar o sweeper.
    _internal: data,
    _stopSweeper() { clearInterval(sweeper); },
  };
}

module.exports = { createSessionStore };
