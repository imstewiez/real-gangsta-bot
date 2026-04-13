'use strict';
/**
 * discordQueue.js — Fila centralizada para operações Discord
 *
 * Garante rate limiting entre operações em massa para evitar 429 (Too Many Requests).
 * Discord.js v14 já gere rate limits individuais automaticamente, mas operações em loop
 * (sync de 120 membros, criação de roles em massa, etc.) podem esgotar o bucket global
 * se não houver throttling explícito entre cada operação.
 *
 * Delays configurados abaixo do limite teórico do Discord para ter margem de segurança:
 *   - member ops (nickname, role add/remove): 350ms → ~2.8/seg (limite: ~5/seg por recurso)
 *   - role ops (create, edit, delete): 600ms → ~1.6/seg (criar roles é mais caro)
 *   - channel ops (create, edit, category): 1200ms → ~0.8/seg
 */

const { warn } = require('./logger');

class ThrottledQueue {
  constructor({ delayMs = 350, label = 'queue', warnThreshold = 10 } = {}) {
    this._queue = [];
    this._running = false;
    this._delayMs = delayMs;
    this._label = label;
    this._warnThreshold = warnThreshold;
  }

  enqueue(fn) {
    if (this._queue.length >= this._warnThreshold) {
      warn(`[DISCORD-QUEUE:${this._label}] fila com ${this._queue.length + 1} operações pendentes — possível burst de chamadas`);
    }
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      if (!this._running) this._drain().catch(err => warn(`[DISCORD-QUEUE:${this._label}] drain error: ${err?.message}`));
    });
  }

  async _drain() {
    this._running = true;
    while (this._queue.length > 0) {
      const item = this._queue.shift();
      try {
        item.resolve(await item.fn());
      } catch (e) {
        item.reject(e);
      }
      if (this._queue.length > 0) {
        await new Promise(r => setTimeout(r, this._delayMs));
      }
    }
    this._running = false;
  }

  /** Número de operações aguardando execução */
  get size() { return this._queue.length; }

  /** true se a queue está a executar operações */
  get running() { return this._running; }
}

// ── Queues singleton por tipo de operação ─────────────────────────────────

/** Operações de membro: setNickname, roles.add, roles.remove */
const memberOpsQueue = new ThrottledQueue({ delayMs: 350, label: 'member-ops', warnThreshold: 15 });

/** Operações de cargo: roles.create, roles.edit, roles.delete */
const roleOpsQueue = new ThrottledQueue({ delayMs: 600, label: 'role-ops', warnThreshold: 10 });

/** Operações de canal/categoria: channels.create, channels.edit, channels.delete */
const channelOpsQueue = new ThrottledQueue({ delayMs: 1200, label: 'channel-ops', warnThreshold: 5 });

// ── API pública ────────────────────────────────────────────────────────────

/**
 * Enfileira uma operação de membro (nickname, role add/remove).
 * Usar em loops de sincronização em massa.
 * @param {() => Promise<any>} fn
 */
function queueMemberOp(fn) { return memberOpsQueue.enqueue(fn); }

/**
 * Enfileira uma operação de cargo (create, edit, delete).
 * @param {() => Promise<any>} fn
 */
function queueRoleOp(fn) { return roleOpsQueue.enqueue(fn); }

/**
 * Enfileira uma operação de canal ou categoria.
 * @param {() => Promise<any>} fn
 */
function queueChannelOp(fn) { return channelOpsQueue.enqueue(fn); }

module.exports = {
  queueMemberOp,
  queueRoleOp,
  queueChannelOp,
  // Acesso às queues para diagnóstico (ex: log do size)
  memberOpsQueue,
  roleOpsQueue,
  channelOpsQueue,
};
