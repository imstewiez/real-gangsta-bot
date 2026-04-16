'use strict';
/**
 * Event Bus — propagação de eventos de domínio.
 *
 * Uso:
 *   bus.emit('saida.closed', { saidaId, result, totals });
 *   bus.on('saida.closed', async (payload) => { ... });
 *
 * Subscritores async são awaitados em série dentro do emit; erros de um
 * subscritor não interrompem os outros (log + continuar).
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

class DomainEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Emit awaiting all async listeners. Erros isolados — cada subscritor
   * é robusto em relação aos outros.
   */
  async emitAsync(event, payload = {}) {
    const listeners = this.listeners(event);
    if (!listeners.length) return;
    log(`[EVENT] ${event} · ${listeners.length} listener(s)`);
    for (const listener of listeners) {
      try {
        await listener(payload);
      } catch (e) {
        warn(`[EVENT:${event}] listener falhou: ${e.message}`);
      }
    }
  }
}

const bus = new DomainEventBus();

module.exports = bus;
