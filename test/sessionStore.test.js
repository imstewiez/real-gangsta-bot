'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createSessionStore } = require('../src/shared/sessionStore');

describe('sessionStore', () => {
  it('set + get preserva payload e adiciona _ts', () => {
    const s = createSessionStore('t1', { ttlMs: 60_000 });
    s.set('u1', { foo: 'bar', nested: { x: 1 } });
    const v = s.get('u1');
    assert.equal(v.foo, 'bar');
    assert.deepEqual(v.nested, { x: 1 });
    assert.equal(typeof v._ts, 'number');
    s._stopSweeper();
  });

  it('delete remove a entrada', () => {
    const s = createSessionStore('t2', { ttlMs: 60_000 });
    s.set('u1', { x: 1 });
    assert.equal(s.has('u1'), true);
    s.delete('u1');
    assert.equal(s.has('u1'), false);
    s._stopSweeper();
  });

  it('size devolve número de entradas', () => {
    const s = createSessionStore('t3', { ttlMs: 60_000 });
    assert.equal(s.size(), 0);
    s.set('a', {});
    s.set('b', {});
    assert.equal(s.size(), 2);
    s._stopSweeper();
  });

  it('clear remove tudo', () => {
    const s = createSessionStore('t4', { ttlMs: 60_000 });
    s.set('a', {});
    s.set('b', {});
    s.clear();
    assert.equal(s.size(), 0);
    s._stopSweeper();
  });

  it('rejeita config inválida', () => {
    assert.throws(() => createSessionStore(), /name/);
    assert.throws(() => createSessionStore('x'), /ttlMs/);
    assert.throws(() => createSessionStore('x', { ttlMs: 500 }), /ttlMs/);
  });

  it('set sobre entrada existente actualiza _ts', async () => {
    const s = createSessionStore('t5', { ttlMs: 60_000 });
    s.set('u1', { v: 1 });
    const ts1 = s.get('u1')._ts;
    await new Promise(r => setTimeout(r, 5));
    s.set('u1', { v: 2 });
    const ts2 = s.get('u1')._ts;
    assert.ok(ts2 >= ts1);
    assert.equal(s.get('u1').v, 2);
    s._stopSweeper();
  });
});
