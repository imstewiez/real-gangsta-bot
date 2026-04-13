'use strict';
const http = require('http');
const metrics = require('../lib/metrics');
const { log, warn } = require('../logger');

let _client = null;

function setClient(client) { _client = client; }

function createServer(port = 3000) {
  const server = http.createServer(async (req, res) => {
    const url = req.url?.split('?')[0];

    if (url === '/health' || url === '/ready' || url === '/live') {
      const ok = _client?.isReady?.() ?? false;
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: ok ? 'ok' : 'not_ready', bot: 'Real Gangsta' }));
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
