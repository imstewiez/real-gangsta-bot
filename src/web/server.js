'use strict';
const http = require('http');
const metrics = require('../lib/metrics');
const CONFIG = require('../config');
const { log } = require('../logger');

let _client = null;
let _ready = false;
const _bootTime = Date.now();

function setClient(client) {
  _client = client;
}

function markReady() {
  _ready = true;
}

async function _checkDb() {
  try {
    const { query } = require('../db');
    const start = Date.now();
    await query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function createServer(port = 3000) {
  const server = http.createServer(async (req, res) => {
    const url = req.url?.split('?')[0];

    // Liveness for Railway: the HTTP process is up. Full readiness stays on
    // /ready because Discord login, locks and migrations can take longer.
    if (url === '/health' || url === '/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          ready: _ready,
          bot: CONFIG.BOT_INTERNAL_NAME,
          uptimeSec: Math.floor((Date.now() - _bootTime) / 1000),
        })
      );
      return;
    }

    // Readiness: bot is fully operational (Discord connected + DB responsive).
    if (url === '/ready') {
      const { getBootPhase } = require('../app/bootstrap');
      const phase = getBootPhase ? getBootPhase() : 0;
      const ok = phase >= 8;
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: ok ? 'ready' : 'booting',
          phase,
          db: 'ok',
          discord: _client?.ws?.status === 0 ? 'connected' : 'disconnected',
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // Deep health — todos os checks + info detalhada. Útil para dashboard de ops.
    if (url === '/health/full' || url === '/healthz') {
      const discordOk = _client?.isReady?.() ?? false;
      const db = await _checkDb();
      const sheetsEnabled = Boolean(CONFIG.SPREADSHEET_ID && CONFIG.GOOGLE_SERVICE_ACCOUNT_JSON);
      const status = discordOk && db.ok ? 'healthy' : 'degraded';

      // Metrics snapshot para health dashboard
      let metricsSnapshot = {};
      try {
        const metricsLib = require('../lib/metrics');
        metricsSnapshot = metricsLib.toJson();
      } catch {
        /* metrics não disponível */
      }

      res.writeHead(discordOk && db.ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status,
          bot: CONFIG.BOT_INTERNAL_NAME,
          displayName: CONFIG.BOT_DISPLAY_NAME,
          uptimeSec: Math.floor((Date.now() - _bootTime) / 1000),
          checks: {
            discord: { ok: discordOk, guilds: _client?.guilds?.cache?.size || 0, pingMs: _client?.ws?.ping || null },
            db,
            sheets: { ok: sheetsEnabled, enabled: sheetsEnabled },
          },
          metrics: metricsSnapshot,
          node: process.version,
          memMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        })
      );
      return;
    }

    if (url === '/metrics') {
      const metricsToken = process.env.METRICS_TOKEN;
      if (!metricsToken) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        return res.end('Metrics disabled');
      }
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${metricsToken}`) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        return res.end('Unauthorized');
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(metrics.toPrometheusText());
      return;
    }

    if (url === '/version') {
      const pkg = require('../../package.json');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          name: pkg.name,
          version: pkg.version,
          node: process.version,
          bot: CONFIG.BOT_INTERNAL_NAME,
          displayName: CONFIG.BOT_DISPLAY_NAME,
        })
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(port, () => {
    log(`[WEB] Health server listening on port ${port}`);
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      throw new Error(`[WEB] Port ${port} already in use — health server cannot bind.`);
    } else {
      throw new Error(`[WEB] Server error: ${err.message}`);
    }
  });

  return server;
}

module.exports = { createServer, setClient, markReady };
