'use strict';
const http = require('http');
const metrics = require('../lib/metrics');
const CONFIG = require('../config');
const { log, warn } = require('../logger');

let _client = null;

function setClient(client) { _client = client; }

function createServer(port = 3000) {
  const server = http.createServer(async (req, res) => {
    const url = req.url?.split('?')[0];

    // Liveness: process is alive. Does NOT require Discord to be connected,
    // so platform healthchecks don't flap while we wait on singleton lock etc.
    if (url === '/health' || url === '/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', bot: CONFIG.BOT_INTERNAL_NAME }));
      return;
    }

    // Readiness: bot is fully operational (Discord connected).
    if (url === '/ready') {
      const ok = _client?.isReady?.() ?? false;
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: ok ? 'ready' : 'not_ready', bot: CONFIG.BOT_INTERNAL_NAME }));
      return;
    }

    if (url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(metrics.toPrometheusText());
      return;
    }

    if (url === '/version') {
      const pkg = require('../../package.json');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: pkg.name, version: pkg.version }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(port, () => {
    log(`[WEB] Health server listening on port ${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      warn(`[WEB] Port ${port} already in use, skipping health server.`);
    } else {
      warn(`[WEB] Server error: ${err.message}`);
    }
  });

  return server;
}

module.exports = { createServer, setClient };
