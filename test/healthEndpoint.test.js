'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('health endpoint', () => {
  it('server module exports createServer, setClient, markReady', () => {
    // Verify exports exist without starting a server
    const server = require('../src/web/server');
    assert.equal(typeof server.createServer, 'function');
    assert.equal(typeof server.setClient, 'function');
    assert.equal(typeof server.markReady, 'function');
  });
});
