'use strict';

const CONFIG = require('../config');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const { warmPool } = require('../db');
const { startHeartbeat } = require('../instanceCoordinator');
const { startAll: startScheduler } = require('../jobs/scheduler');
const { setClient: setWebClient, markReady } = require('../web/server');
const { registerCommands } = require('./discord/registerCommands');

function getSaidaLifecycle() {
  return null;
}

async function registerSlashCommandsPhase(client) {
  await registerCommands(client);
}

async function panelsPhase(client) {
  const { bootstrapAll } = require('../panelBootstrap');
  await bootstrapAll(client);
}

function injectClientPhase() {}

async function saidaLifecyclePhase() {}

async function warmupPhase() {
  await warmPool(3);
}

async function membershipReconcilePhase(client) {
  if (!CONFIG.ENFORCE_ROLE_INVARIANTS) {
    log('[RECONCILE:members] Skip — ENFORCE_ROLE_INVARIANTS=false.');
    return;
  }
  const guild = client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) {
    warn('[RECONCILE:members] Skip — guild não encontrada.');
    return;
  }
  const { reconcileDiscordMembership } = require('../members/roleInvariants');
  const result = await reconcileDiscordMembership(guild, { actor: 'system:ready-discord-reconcile' });
  log(
    `[RECONCILE:members] Ready sync concluído: scanned=${result.missing?.scanned ?? 0} ` +
      `missing=${result.missing?.missing ?? 0} no_operational_role=${result.missing?.no_operational_role ?? 0} ` +
      `updated=${result.missing?.updated ?? 0}`
  );
}

function streamCommandsPhase(client) {
  const { registerLiveCommandHandler } = require('../streams/liveMonitor');
  registerLiveCommandHandler(client);
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
    ['clearSlashCommands', () => registerSlashCommandsPhase(client)],
    ['panels', () => panelsPhase(client)],
    ['streamCommands', () => streamCommandsPhase(client)],
    ['warmup', () => warmupPhase()],
    ['membershipReconcile', () => membershipReconcilePhase(client)],
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
  panelsPhase,
  injectClientPhase,
  saidaLifecyclePhase,
  warmupPhase,
  membershipReconcilePhase,
  streamCommandsPhase,
  schedulerPhase,
  webReadyPhase,
  heartbeatPhase,
};
