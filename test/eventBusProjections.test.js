'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('eventBus + projections', () => {
  it('EVENT_TO_TABS mapeia eventos relevantes', () => {
    const { EVENT_TO_TABS } = require('../src/sheets/projections');
    assert.ok(EVENT_TO_TABS['saida.closed'].includes('saidas'));
    assert.ok(EVENT_TO_TABS['material.registered'].includes('stock'));
    assert.ok(EVENT_TO_TABS['member.promoted'].includes('membros'));
    assert.ok(EVENT_TO_TABS['kill.registered'].includes('saidas'));
  });

  it('event bus é singleton com emitAsync e .on', () => {
    const bus = require('../src/core/eventBus');
    assert.equal(typeof bus.emitAsync, 'function');
    assert.equal(typeof bus.on, 'function');
    // Duas requires devolvem a mesma instância.
    const bus2 = require('../src/core/eventBus');
    assert.equal(bus, bus2);
  });

  it('listeners de projections recebem o evento', async () => {
    const bus = require('../src/core/eventBus');
    let received = null;
    bus.on('__test_evt__', (payload) => { received = payload; });
    await bus.emitAsync('__test_evt__', { foo: 'bar' });
    assert.deepEqual(received, { foo: 'bar' });
  });

  it('emitAsync tolera listeners que rejeitam', async () => {
    const bus = require('../src/core/eventBus');
    bus.on('__test_err__', async () => { throw new Error('boom'); });
    // Não deve rebentar
    await assert.doesNotReject(bus.emitAsync('__test_err__', {}));
  });

  it('DomainErrors têm campos esperados', () => {
    const { DomainError, ValidationError, NotFoundError } = require('../src/core/errors');
    const e = new ValidationError('x');
    assert.ok(e instanceof DomainError);
    assert.equal(e.code, 'VALIDATION');
    const nf = new NotFoundError('saida', 42);
    assert.match(nf.message, /saida/);
    assert.equal(nf.code, 'NOT_FOUND');
    assert.equal(nf.entity, 'saida');
  });
});
