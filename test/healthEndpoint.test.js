'use strict';
const http = require('http');
const { once } = require('node:events');
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

  it('/health is liveness and returns 200 before ready', async () => {
    const { createServer } = require('../src/web/server');
    const server = createServer(0);
    await once(server, 'listening');

    try {
      const { statusCode, body } = await requestJson(server.address().port, '/health');
      assert.equal(statusCode, 200);
      assert.equal(body.status, 'ok');
      assert.equal(body.ready, false);
    } finally {
      server.close();
    }
  });
});

function requestJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path }, res => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        raw += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: JSON.parse(raw) });
      });
    });
    req.on('error', reject);
  });
}
