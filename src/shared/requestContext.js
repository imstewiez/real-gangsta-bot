'use strict';
/**
 * Request context — AsyncLocalStorage que transporta correlation ID + actor
 * através de todas as chamadas assíncronas dentro de uma interação Discord.
 *
 * Uso:
 *   ctx.run({ correlationId, actorId, action }, async () => { ... })
 *   ctx.current() — devolve o contexto activo (ou null)
 *   ctx.correlationId() — shortcut
 */

const { AsyncLocalStorage } = require('node:async_hooks');
const { newCorrelationId } = require('../logger');

const _als = new AsyncLocalStorage();

function run(data, fn) {
  const ctx = {
    correlationId: data.correlationId || newCorrelationId(),
    actorId: data.actorId || null,
    action: data.action || null,
    startedAt: Date.now(),
    ...data,
  };
  return _als.run(ctx, fn);
}

function current() {
  return _als.getStore() || null;
}

function correlationId() {
  const c = current();
  return c?.correlationId || null;
}

function actorId() {
  const c = current();
  return c?.actorId || null;
}

function elapsed() {
  const c = current();
  return c ? Date.now() - c.startedAt : null;
}

/** Helper para injectar no log — prefixo [req_abc123] */
function tag() {
  const id = correlationId();
  return id ? `[${id}]` : '';
}

module.exports = { run, current, correlationId, actorId, elapsed, tag };
