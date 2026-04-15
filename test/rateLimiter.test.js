'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const rl = require('../src/shared/rateLimiter');

describe('rateLimiter', () => {
  beforeEach(() => rl._reset());

  it('allow primeiro pedido', () => {
    assert.equal(rl.allow('u1', 'x', { limit: 3, windowMs: 1000 }), true);
  });

  it('nega depois do limite', () => {
    rl.allow('u1', 'x', { limit: 2, windowMs: 1000 });
    rl.allow('u1', 'x', { limit: 2, windowMs: 1000 });
    assert.equal(rl.allow('u1', 'x', { limit: 2, windowMs: 1000 }), false);
  });

  it('chaves diferentes têm buckets independentes', () => {
    rl.allow('u1', 'a', { limit: 1, windowMs: 1000 });
    assert.equal(rl.allow('u1', 'a', { limit: 1, windowMs: 1000 }), false);
    assert.equal(rl.allow('u1', 'b', { limit: 1, windowMs: 1000 }), true);
  });

  it('utilizadores diferentes têm buckets independentes', () => {
    rl.allow('u1', 'x', { limit: 1, windowMs: 1000 });
    assert.equal(rl.allow('u1', 'x', { limit: 1, windowMs: 1000 }), false);
    assert.equal(rl.allow('u2', 'x', { limit: 1, windowMs: 1000 }), true);
  });

  it('reseta depois da janela', async () => {
    rl.allow('u1', 'x', { limit: 1, windowMs: 50 });
    assert.equal(rl.allow('u1', 'x', { limit: 1, windowMs: 50 }), false);
    await new Promise(r => setTimeout(r, 70));
    assert.equal(rl.allow('u1', 'x', { limit: 1, windowMs: 50 }), true);
  });

  it('retryAfter devolve tempo restante', () => {
    rl.allow('u1', 'x', { limit: 1, windowMs: 1000 });
    rl.allow('u1', 'x', { limit: 1, windowMs: 1000 });
    const wait = rl.retryAfter('u1', 'x');
    assert.ok(wait > 0 && wait <= 1000);
  });

  it('denyMessage formata bem', () => {
    assert.match(rl.denyMessage(3500), /4s/);
    assert.match(rl.denyMessage(), /demasiados/i);
  });
});
