'use strict';
/**
 * Fases do ready hook.
 *
 * Pós-migração para webapp: o bot não inicializa Sheets, dashboards nem
 * painéis legacy. Mantém apenas Discord core, listeners operacionais,
 * scheduler mínimo e healthcheck Railway.
 */

const CONFIG = require('../config');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const { warmPool } = require('../db');
const { startHeartbeat } = require('../instanceCoordinator');
const { startAll: startScheduler } = require('../jobs/scheduler');
const { setClient: setWebClient, markReady } = require('../web/server');
const { setClient: setStockClient } = require('../inventory/stockNotifier');
const { setClient: setBairristaLogClient } = require('../inventory/bairristaNotifier');
const { setClient: setSaidaClient } = require('../saidas/saidaEngine');
const { setClient: setSpotCooldownClient } = require('../saidas/spotCooldown');
const { SessionLifecycle } = require('../saidas/saidaLifecycle');
const { registerCommands } = require('./discord/registerCommands');

let _saidaLifecycle = null;
function getSaidaLifecycle() {
  return _saidaLifecycle;
}

async function registerSlashCommandsPhase(client) {
  await registerCommands(client);
}

function injectClientPhase(client) {
  setStockClient(client);
  setBairristaLogClient(client);
  setSaidaClient(client);
  setSpotCooldownClient(client);
}

async function saidaLifecyclePhase(client) {
  try {
    const lifecycle = new SessionLifecycle({ client });
    await lifecycle.restoreCountdowns();
    _saidaLifecycle = lifecycle;
    log(`[BOOT:SAIDAS] SessionLifecycle restaurado (${lifecycle.getActiveCountdowns().length} countdowns activos).`);
  } catch (e) {
    warn(`[BOOT:SAIDAS] Falha a restaurar lifecycle: ${e.message}`);
  }
}

async function warmupPhase() {
  await warmPool(3);
}

function schedulerPhase(client) {
  startScheduler(client);
}

function webReadyPhase(client) {
  setWebClient(client);
  markReady();
}

function heartbeatPhase(onPreempt) {
  startHeartbeat(onPreempt);
}

async function runReadyPhases(client, { onPreempt }) {
  log(`[READY] Logged in as ${client.user.tag}`);
  metrics.discordPingMs.set(client.ws.ping);

  const phases = [
    ['registerSlashCommands', () => registerSlashCommandsPhase(client)],
    ['injectClient', () => injectClientPhase(client)],
    ['saidaLifecycle', () => saidaLifecyclePhase(client)],
    ['warmup', () => warmupPhase()],
    ['scheduler', () => schedulerPhase(client)],
    ['webReady', () => webReadyPhase(client)],
    ['heartbeat', () => heartbeatPhase(onPreempt)],
  ];

  for (const [name, run] of phases) {
    const t0 = Date.now();
    try {
      await run();
      log(`[READY] Fase '${name}' OK (${Date.now() - t0}ms).`);
    } catch (e) {
      warn(`[READY] Fase '${name}' falhou: ${e.message}`);
      throw e;
    }
  }

  log(`[READY] ${CONFIG.BOT_INTERNAL_NAME} operacional.`);
}

module.exports = {
  runReadyPhases,
  getSaidaLifecycle,
  registerSlashCommandsPhase,
  injectClientPhase,
  saidaLifecyclePhase,
  warmupPhase,
  schedulerPhase,
  webReadyPhase,
  heartbeatPhase,
};
