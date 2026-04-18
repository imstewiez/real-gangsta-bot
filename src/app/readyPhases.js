'use strict';
/**
 * Fases do ready hook — cada uma é isolada, nomeada e testável.
 *
 * Ordem fixa:
 *   1. registerSlashCommandsPhase   → comandos registados na guild
 *   2. stickyRenderersPhase         → renderers antes de qualquer refresh
 *   3. injectClientPhase            → injecta client em módulos publish-direct
 *   4. panelBootstrapPhase          → republica painéis se PANEL_BOOTSTRAP_ON_READY
 *   5. warmupPhase                  → warm-up do pool DB
 *   6. schedulerPhase               → arranca jobs
 *   7. webReadyPhase                → marca healthcheck ready
 *   8. sheetsInitialSyncPhase       → sync inicial de sheets (fire-and-forget)
 *   9. heartbeatPhase               → instance heartbeat + preempção
 *
 * Cada fase tem logs de entrada/saída para diagnosticar boot em Railway.
 */

const CONFIG = require('../config');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const { warmPool } = require('../db');
const { startHeartbeat } = require('../instanceCoordinator');
const { bootstrapAll } = require('../panelBootstrap');
const { startAll: startScheduler } = require('../jobs/scheduler');
const { setClient: setWebClient, markReady } = require('../web/server');
const { registerBuiltinRenderers } = require('../sticky/stickyRenderers');
const { setClient: setStockClient } = require('../inventory/stockNotifier');
const { setClient: setBairristaLogClient } = require('../inventory/bairristaNotifier');
const { setClient: setSaidaClient } = require('../saidas/saidaEngine');
const { setClient: setNotifRouterClient } = require('../notifications/routing');
const { setClient: setSpotCooldownClient } = require('../saidas/spotCooldown');
const { registerCommands } = require('./discord/registerCommands');

async function registerSlashCommandsPhase(client) {
  await registerCommands(client);
}

function stickyRenderersPhase() {
  registerBuiltinRenderers();
}

function injectClientPhase(client) {
  setStockClient(client);
  setBairristaLogClient(client);
  setSaidaClient(client);
  setNotifRouterClient(client);
  setSpotCooldownClient(client);
}

async function panelBootstrapPhase(client) {
  if (!CONFIG.PANEL_BOOTSTRAP_ON_READY) return;
  await bootstrapAll(client);
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

function sheetsInitialSyncPhase() {
  if (!CONFIG.isSheetsEnabled || !CONFIG.isSheetsEnabled()) {
    log('[BOOT:SHEETS] Skip — Sheets desactivado (GOOGLE_SERVICE_ACCOUNT_JSON/SPREADSHEET_ID ausente).');
    return;
  }
  // Fire-and-forget mas via Promise (não setTimeout com .unref que em alguns
  // cenários é cancelado silenciosamente). Log de entrada explícito para
  // discriminar "não correu" vs "correu mas falhou silenciosamente".
  log('[BOOT:SHEETS] A agendar sync inicial...');
  _syncSheetsOnBoot().catch(e => {
    warn(`[BOOT:SHEETS] Promise rejected inesperadamente: ${e.message}`);
  });
}

async function _syncSheetsOnBoot() {
  log('[BOOT:SHEETS] Sync inicial de todas as tabs a arrancar...');
  try {
    const { syncAll } = require('../sheets/syncEngine');
    const t0 = Date.now();
    const results = await syncAll();
    const ok = results.filter(r => !r.error && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const errored = results.filter(r => r.error).length;
    log(
      `[BOOT:SHEETS] Sync inicial terminou: ${ok} OK · ${skipped} skipped · ${errored} erros · ${Date.now() - t0}ms.`
    );
    for (const r of results) {
      if (r.error) warn(`[BOOT:SHEETS] ${r.tab} erro: ${String(r.error).slice(0, 300)}`);
      else if (r.skipped) log(`[BOOT:SHEETS] ${r.tab} skipped (${r.skipped}).`);
      else log(`[BOOT:SHEETS] ${r.tab} OK (${r.ops || 0} ops · ${r.ms || 0}ms).`);
    }
  } catch (e) {
    warn(`[BOOT:SHEETS] Falha geral: ${e.message}`);
    warn(`[BOOT:SHEETS] Stack: ${e.stack}`);
  }
}

function heartbeatPhase(onPreempt) {
  startHeartbeat(onPreempt);
}

async function runReadyPhases(client, { onPreempt }) {
  log(`[READY] Logged in as ${client.user.tag}`);
  metrics.discordPingMs.set(client.ws.ping);

  const phases = [
    ['registerSlashCommands', () => registerSlashCommandsPhase(client)],
    ['stickyRenderers', () => stickyRenderersPhase()],
    ['injectClient', () => injectClientPhase(client)],
    ['panelBootstrap', () => panelBootstrapPhase(client)],
    ['warmup', () => warmupPhase()],
    ['scheduler', () => schedulerPhase(client)],
    ['webReady', () => webReadyPhase(client)],
    ['sheetsInitialSync', () => sheetsInitialSyncPhase()],
    ['heartbeat', () => heartbeatPhase(onPreempt)],
  ];

  for (const [name, run] of phases) {
    const t0 = Date.now();
    try {
      await run();
      log(`[READY] Fase '${name}' OK (${Date.now() - t0}ms).`);
    } catch (e) {
      // Falha numa fase não fatal — log e continua. Fases críticas (commands,
      // scheduler) já tinham throws explícitos antes do split.
      warn(`[READY] Fase '${name}' falhou: ${e.message}`);
      throw e;
    }
  }

  log(`[READY] ${CONFIG.BOT_INTERNAL_NAME} operacional.`);
}

module.exports = {
  runReadyPhases,
  // Exports individuais para testes
  registerSlashCommandsPhase,
  stickyRenderersPhase,
  injectClientPhase,
  panelBootstrapPhase,
  warmupPhase,
  schedulerPhase,
  webReadyPhase,
  sheetsInitialSyncPhase,
  heartbeatPhase,
};
