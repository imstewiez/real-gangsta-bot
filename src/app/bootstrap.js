'use strict';
/**
 * Bootstrap — composition root do bot.
 *
 * Orquestra, pela ordem:
 *   1. Web server (healthcheck precisa estar online cedo)
 *   2. Coordenação de instâncias (dedup + lock singleton)
 *   3. Migrations + seed
 *   4. Discord client + listeners
 *   5. Ready handler — slash commands, panel bootstrap, scheduler, heartbeat
 *   6. Shutdown signals
 *
 * Idealmente chamado só uma vez, a partir de `src/index.js`.
 */

const { Events } = require('discord.js');
const CONFIG = require('../config');
const { pool, acquireInstanceLockWithRetry, releaseInstanceLock } = require('../db');
const { runMigrations } = require('../dbMigrate');
const {
  ensureInstanceTable, cleanupStaleInstances, registerInstance,
  startHeartbeat, deregisterInstance,
} = require('../instanceCoordinator');
const { log, warn, error, startLogMaintenance, stopLogMaintenance } = require('../logger');
const metrics = require('../lib/metrics');
const { bootstrapAll } = require('../panelBootstrap');
const { seedFromCatalog } = require('../inventory/itemCatalog');
const { startAll: startScheduler, stopAll: stopScheduler } = require('../jobs/scheduler');
const { createServer, setClient: setWebClient } = require('../web/server');
const { registerBuiltinRenderers } = require('../sticky/stickyRenderers');
const { setClient: setStockClient } = require('../inventory/stockNotifier');
const { setClient: setBairristaLogClient } = require('../inventory/bairristaNotifier');
const { setClient: setSaidaClient } = require('../saidas/saidaEngine');
const { registerSheetProjections } = require('../sheets/projections');
const { setClient: setNotifRouterClient, registerNotificationRouting } = require('../notifications/routing');

const { createClient } = require('./discord/client');
const { registerCommands } = require('./discord/registerCommands');
const { registerLifecycleListeners } = require('./discord/lifecycle');
const { onInteraction } = require('./discord/interactionRouter');

let client = null;
let _shuttingDown = false;

async function bootstrap() {
  log(`[BOOT] ${CONFIG.BOT_INTERNAL_NAME} a iniciar...`);

  // Rotação periódica de logs + limpeza de sessões velhas.
  startLogMaintenance();

  // Web server cedo — healthcheck desbloqueia preempção de instância antiga.
  createServer(Number(process.env.PORT) || 3000);

  // Coordenação de instâncias (preempção + lock singleton).
  await ensureInstanceTable();
  await cleanupStaleInstances();
  await registerInstance();

  const locked = await acquireInstanceLockWithRetry(90000);
  if (!locked) {
    error('[BOOT] Não foi possível adquirir lock após 90s. A abortar.');
    await deregisterInstance('lock_timeout').catch(() => {});
    process.exit(1);
  }

  await runMigrations();
  await seedFromCatalog();

  // Subscribers do event bus — sheets projections + notification routing.
  // Registados antes do client para apanhar qualquer emit precoce (ex: seed).
  registerSheetProjections();
  registerNotificationRouting();

  // Client + listeners.
  client = createClient();
  registerLifecycleListeners(client);
  client.on(Events.InteractionCreate, onInteraction);

  client.once(Events.ClientReady, () => readyHook(client).catch(e => {
    error('[READY] Falha no ready hook:', e);
  }));

  await client.login(CONFIG.DISCORD_BOT_TOKEN);
  installShutdownSignals();
  return client;
}

async function readyHook(c) {
  log(`[READY] Logged in as ${c.user.tag}`);
  metrics.discordPingMs.set(c.ws.ping);

  await registerCommands(c);

  // Sticky renderers têm de existir antes de qualquer refresh.
  registerBuiltinRenderers();

  // Injectar client onde é preciso (módulos com publicação directa).
  setStockClient(c);
  setBairristaLogClient(c);
  setSaidaClient(c);
  setNotifRouterClient(c);

  if (CONFIG.PANEL_BOOTSTRAP_ON_READY) {
    await bootstrapAll(c);
  }

  startScheduler(c);
  setWebClient(c);

  startHeartbeat((reason) => {
    log(`[INSTANCE] Detectada instância mais recente — shutdown controlado (${reason}).`);
    shutdown(reason).catch((e) => {
      error('[SHUTDOWN] Erro no shutdown por preempção:', e);
      process.exit(0);
    });
  });

  log(`[READY] ${CONFIG.BOT_INTERNAL_NAME} operacional.`);
}

// ── Graceful shutdown ───────────────────────────────────────────────────────
async function shutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  log(`[SHUTDOWN] ${signal} received. Shutting down...`);
  try { stopScheduler(); } catch (_) {}
  try { stopLogMaintenance(); } catch (_) {}
  try { client?.destroy(); } catch (_) {}
  await deregisterInstance(signal).catch(() => {});
  await releaseInstanceLock().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
}

function installShutdownSignals() {
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    error('[UNHANDLED REJECTION]', reason);
  });
}

module.exports = { bootstrap, shutdown };
