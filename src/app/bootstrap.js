'use strict';
/**
 * Bootstrap — composition root do bot.
 *
 * Orquestra, pela ordem:
 *   1. Validação de config (aborta se erro)
 *   2. Web server (healthcheck precisa estar online cedo)
 *   3. Coordenação de instâncias (dedup + lock singleton)
 *   4. Migrations + seed
 *   5. Event bus subscribers (sheets + routing)
 *   6. Discord client + listeners
 *   7. Ready handler (delegado a readyPhases.js — 9 fases nomeadas)
 *   8. Shutdown signals
 *
 * Idealmente chamado só uma vez, a partir de `src/index.js`.
 */

const { Events } = require('discord.js');
const CONFIG = require('../config');
const { validateOrExit } = require('../config/validate');
const { pool, acquireInstanceLockWithRetry, releaseInstanceLock } = require('../db');
const { runMigrations } = require('../dbMigrate');
const {
  ensureInstanceTable,
  cleanupStaleInstances,
  registerInstance,
  deregisterInstance,
} = require('../instanceCoordinator');
const { log, warn, error, startLogMaintenance, stopLogMaintenance } = require('../logger');
const { seedFromCatalog } = require('../inventory/itemCatalog');
const { stopAll: stopScheduler } = require('../jobs/scheduler');
const { createServer } = require('../web/server');
const { registerSheetProjections } = require('../sheets/projections');
const { registerNotificationRouting } = require('../notifications/routing');

const { createClient } = require('./discord/client');
const { registerLifecycleListeners } = require('./discord/lifecycle');
const { onInteraction } = require('./discord/interactionRouter');
const { runReadyPhases } = require('./readyPhases');

let client = null;
let _shuttingDown = false;

async function bootstrap() {
  log(`[BOOT] ${CONFIG.BOT_INTERNAL_NAME} a iniciar...`);

  // Validação forte de config ANTES de qualquer coisa. Aborta com relatório
  // claro se houver erros; warnings ficam nos logs.
  validateOrExit();

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

  // Subscribers do event bus — antes do client, para apanhar emits precoces.
  if (CONFIG.isSheetsEnabled && CONFIG.isSheetsEnabled()) {
    registerSheetProjections();
    log('[SHEETS] Projections registadas (sync event-driven com debounce 5s).');
  } else {
    warn(
      '[SHEETS] ⚠️ DESACTIVADO — GOOGLE_SERVICE_ACCOUNT_JSON ou SPREADSHEET_ID em falta. ' +
        'Tabs nunca sincronizam até o env estar configurado no Railway.'
    );
  }
  registerNotificationRouting();

  // Client + listeners.
  client = createClient();
  registerLifecycleListeners(client);
  client.on(Events.InteractionCreate, onInteraction);

  client.once(Events.ClientReady, () =>
    runReadyPhases(client, {
      onPreempt: reason => {
        log(`[INSTANCE] Detectada instância mais recente — shutdown controlado (${reason}).`);
        shutdown(reason).catch(e => {
          error('[SHUTDOWN] Erro no shutdown por preempção:', e);
          process.exit(0);
        });
      },
    }).catch(e => {
      error('[READY] Falha no ready hook:', e);
    })
  );

  await client.login(CONFIG.DISCORD_BOT_TOKEN);
  installShutdownSignals();
  return client;
}

// ── Graceful shutdown ───────────────────────────────────────────────────────
async function shutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  log(`[SHUTDOWN] ${signal} received. Shutting down...`);
  try {
    stopScheduler();
  } catch (_) {}
  try {
    stopLogMaintenance();
  } catch (_) {}
  try {
    client?.destroy();
  } catch (_) {}
  await deregisterInstance(signal).catch(() => {});
  await releaseInstanceLock().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
}

function installShutdownSignals() {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', reason => {
    error('[UNHANDLED REJECTION]', reason);
  });
}

module.exports = { bootstrap, shutdown };
