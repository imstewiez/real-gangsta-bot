'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EVENTS, EVENT_NAMES, isKnownEvent } = require('../src/core/events');

describe('event catalog', () => {
  it('has at least 20 events', () => {
    assert.ok(EVENT_NAMES.length >= 20, `Only ${EVENT_NAMES.length} events`);
  });

  it('every event has description', () => {
    for (const name of EVENT_NAMES) {
      assert.ok(EVENTS[name].description, `${name} missing description`);
    }
  });

  it('every event has tabs array', () => {
    for (const name of EVENT_NAMES) {
      assert.ok(Array.isArray(EVENTS[name].tabs), `${name} missing tabs array`);
    }
  });

  it('isKnownEvent works', () => {
    assert.ok(isKnownEvent('material.registered'));
    assert.ok(isKnownEvent('saida.closed'));
    assert.ok(!isKnownEvent('fake.event'));
    assert.ok(!isKnownEvent(''));
  });
});
