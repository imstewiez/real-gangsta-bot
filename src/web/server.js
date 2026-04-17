'use strict';
const http = require('http');
const metrics = require('../lib/metrics');
const CONFIG = require('../config');
const { log, warn } = require('../logger');

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

    // Liveness: retorna 200 apenas quando o ready hook completou com sucesso
    // (Discord conectado, DB pronta, scheduler a correr). Durante o boot
    // retorna 503 para que o Railway não envie tráfego antes do bot estar pronto.
    if (url === '/health' || url === '/live') {
      const code = _ready ? 200 : 503;
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: _ready ? 'ok' : 'not_ready',
          bot: CONFIG.BOT_INTERNAL_NAME,
          uptimeSec: Math.floor((Date.now() - _bootTime) / 1000),
        })
      );
      return;
    }

    // Readiness: bot is fully operational (Discord connected + DB responsive).
    if (url === '/ready') {
      const discordOk = _client?.isReady?.() ?? false;
      const db = await _checkDb();
      const ok = discordOk && db.ok;
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: ok ? 'ready' : 'not_ready',
          bot: CONFIG.BOT_INTERNAL_NAME,
          discord: discordOk,
          db: db.ok ? `ok (${db.latencyMs}ms)` : `down (${db.error})`,
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
      res.writeHead(discordOk && db.ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status,
          bot: CONFIG.BOT_INTERNAL_NAME,
          displayName: CONFIG.BOT_DISPLAY_NAME,
          uptimeSec: Math.floor((Date.now() - _bootTime) / 1000),
          checks: {
            discord: { ok: discordOk, guilds: _client?.guilds?.cache?.size || 0 },
            db,
            sheets: { ok: sheetsEnabled, enabled: sheetsEnabled },
          },
          node: process.version,
          memMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        })
      );
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
      warn(`[WEB] Port ${port} already in use, skipping health server.`);
    } else {
      warn(`[WEB] Server error: ${err.message}`);
    }
  });

  return server;
}

module.exports = { createServer, setClient, markReady };
