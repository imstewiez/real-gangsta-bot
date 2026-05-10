'use strict';
/**
 * Event Bus — propagação de eventos de domínio.
 *
 * Uso:
 *   bus.emit('saida.closed', { saidaId, result, totals });
 *   bus.on('saida.closed', async (payload) => { ... });
 *
 * Subscritores async são awaitados em paralelo via Promise.allSettled.
 * Erros de subscritores CRITICAL propagam como AggregateError;
 * erros de subscritores não-críticos são logados mas não interrompem.
 *
 * Eventos canónicos (ver docs/events.md quando existir):
 *   - saida.closed          — saída fechada com resultado + totais
 *   - saida.opened          — nova sessão de saída criada
 *   - material.registered   — entrega/venda de material registada
 *   - material.adjusted     — ajuste manual de stock
 *   - member.promoted       — bairrista subiu de tier
 *   - member.joined         — novo membro na DB (backfill ou onboarding)
 *   - member.left           — membro saiu do servidor
 *   - item.price_changed    — preço do item alterado no catálogo
 *   - kill.registered       — kill adicionada ao cemitério
 *   - ranking.recomputed    — rankings recalculados (mensal/all-time)
 */

const { EventEmitter } = require('events');
const { log, warn } = require('../logger');
const { eventsByName } = require('../lib/metrics');

class DomainEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Regista um listener. Pode ser marcado como CRITICAL via terceiro arg:
   *   bus.on('event', fn, { critical: true })
   */
  on(event, fn, opts = {}) {
    if (typeof fn === 'function') {
      fn._critical = opts.critical === true;
    }
    return super.on(event, fn);
  }

  /**
   * Emit awaiting all async listeners. Erros isolados — cada subscritor
   * é robusto em relação aos outros. CRITICAL failures propagam.
   */
  async emitAsync(event, payload = {}) {
    eventsByName.inc({ event });
    const listeners = this.listeners(event);
    if (!listeners.length) return;
    log(`[EVENT] ${event} · ${listeners.length} listener(s)`);
    const results = await Promise.allSettled(listeners.map(listener => listener(payload)));
    const criticalFailures = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const listener = listeners[i];
      if (result.status === 'rejected') {
        if (listener._critical) {
          criticalFailures.push(result.reason);
        } else {
          warn(`[EVENT:${event}] listener falhou: ${result.reason?.message || result.reason}`);
        }
      }
    }
    if (criticalFailures.length) {
      throw new AggregateError(criticalFailures, `One or more critical listeners for '${event}' failed`);
    }
  }
}

const bus = new DomainEventBus();

module.exports = bus;
