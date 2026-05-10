'use strict';
const http = require('http');
const { once } = require('node:events');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const shouldSkip = !process.env.CI && !process.env.DISCORD_BOT_TOKEN;

(shouldSkip ? describe.skip : describe)('health endpoint', () => {
  it('server module exports createServer, setClient, markReady', () => {
    // Verify exports exist without starting a server
    const server = require('../src/web/server');
    assert.equal(typeof server.createServer, 'function');
    assert.equal(typeof server.setClient, 'function');
    assert.equal(typeof server.markReady, 'function');
  });

  it('/health is liveness and returns 200 before ready', async () => {
    const { createServer } = require('../src/web/server');
    const server = createServer(0);
    await once(server, 'listening');

    const req = http.get(`http://127.0.0.1:${server.address().port}/health`, res => {
      assert.equal(res.statusCode, 200);
    });
    await once(req, 'response');
    server.close();
    await once(server, 'close');
  });
});
