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
const { stopAll: stopScheduler, drainActiveJobs } = require('../jobs/scheduler');
const { createServer } = require('../web/server');
const { registerSheetProjections } = require('../sheets/projections');
const { registerNotificationRouting } = require('../notifications/routing');

const { createClient } = require('./discord/client');
const { registerLifecycleListeners } = require('./discord/lifecycle');
const { onInteraction } = require('./discord/interactionRouter');
const { runReadyPhases } = require('./readyPhases');

const BOOT_PHASES = {
  CONFIG_VALIDATED: 1,
  WEB_SERVER_UP: 2,
  INSTANCE_LOCKED: 3,
  MIGRATIONS_CHECKED: 4,
  EVENT_BUS_READY: 5,
  DISCORD_CONNECTED: 6,
  READY_PHASES_COMPLETE: 7,
  FULLY_OPERATIONAL: 8,
};
let _currentPhase = 0;
function setPhase(phase) {
  _currentPhase = phase;
  log(`[BOOT] Phase ${phase}/${BOOT_PHASES.FULLY_OPERATIONAL} reached`);
}

let client = null;
let _server = null;
let _shuttingDown = false;

async function bootstrap() {
  log(`[BOOT] ${CONFIG.BOT_INTERNAL_NAME} a iniciar...`);
  log(`[BOOT] DATABASE_URL host: ${process.env.DATABASE_URL?.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@')}`);
  log(`[BOOT] NODE_ENV: ${process.env.NODE_ENV}`);
  log(`[BOOT] SSL_CFG: ${JSON.stringify(require('../db').pool?.options?.ssl || 'n/a')}`);

  // Incrementa contador de restarts — útil para detectar crash loops no health endpoint
  try {
    const { botRestartsTotal } = require('../lib/metrics');
    botRestartsTotal?.inc();
  } catch {
    /* metrics ainda não carregado */
  }

  // Validação forte de config ANTES de qualquer coisa. Aborta com relatório
  // claro se houver erros; warnings ficam nos logs.
  validateOrExit();
  setPhase(BOOT_PHASES.CONFIG_VALIDATED);

  startLogMaintenance();

  // Web server cedo — healthcheck desbloqueia preempção de instância antiga.
  _server = createServer(Number(process.env.PORT) || 3000);
  setPhase(BOOT_PHASES.WEB_SERVER_UP);

  // Coordenação de instâncias (preempção + lock singleton).
  try {
    log('[BOOT] A criar tabela bot_instances...');
    await ensureInstanceTable();
    log('[BOOT] bot_instances OK');
    await cleanupStaleInstances();
    log('[BOOT] cleanup stale OK');
    await registerInstance();
    log('[BOOT] instance registada OK');
  } catch (e) {
    error(`[BOOT] Falha na coordenação de instâncias: ${e.message}`);
    process.exit(1);
  }

  // PgBouncer/Supabase pooler não suporta advisory locks (conexões são
  // multiplexadas por query). Saltar lock quando usar pooler.
  const isPooler = process.env.DATABASE_URL?.includes('pooler.supabase.com');
  if (isPooler) {
    log('[BOOT] Pooler Supabase detectado — a saltar advisory lock (não suportado).');
  } else {
    log('[BOOT] A adquirir instance lock...');
    const locked = await acquireInstanceLockWithRetry(10000);
    if (!locked) {
      error('[BOOT] Não foi possível adquirir lock após 10s. A abortar.');
      await deregisterInstance('lock_timeout').catch(err => warn(`[BOOT] Falha a deregister instance: ${err.message}`));
      process.exit(1);
    }
    log('[BOOT] Lock adquirido OK');
  }
  setPhase(BOOT_PHASES.INSTANCE_LOCKED);

  try {
    log('[BOOT] A correr migrations...');
    await runMigrations();
    log('[BOOT] Migrations aplicadas com sucesso.');
  } catch (e) {
    error(`[BOOT] Falha ao aplicar migrations: ${e.message}`);
    process.exit(1);
  }
  setPhase(BOOT_PHASES.MIGRATIONS_CHECKED);

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
  setPhase(BOOT_PHASES.EVENT_BUS_READY);

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
    })
      .then(() => {
        setPhase(BOOT_PHASES.READY_PHASES_COMPLETE);
        setPhase(BOOT_PHASES.FULLY_OPERATIONAL);
      })
      .catch(e => {
        error('[READY] Falha no ready hook:', e);
      })
  );

  await client.login(CONFIG.DISCORD_BOT_TOKEN);
  setPhase(BOOT_PHASES.DISCORD_CONNECTED);
  installShutdownSignals();
  return client;
}

// ── Graceful shutdown ───────────────────────────────────────────────────────
async function shutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  log(`[SHUTDOWN] ${signal} received. Shutting down...`);
  try {
    await drainActiveJobs(30000);
  } catch (err) {
    warn(`[SHUTDOWN] drainActiveJobs falhou: ${err.message}`);
  }
  try {
    stopScheduler();
  } catch (err) {
    warn(`[SHUTDOWN] stopScheduler falhou: ${err.message}`);
  }
  try {
    stopLogMaintenance();
  } catch (err) {
    warn(`[SHUTDOWN] stopLogMaintenance falhou: ${err.message}`);
  }
  try {
    client?.destroy();
  } catch (err) {
    warn(`[SHUTDOWN] client.destroy falhou: ${err.message}`);
  }
  if (_server) {
    try {
      await new Promise((res, rej) => {
        _server.close(err => (err ? rej(err) : res()));
      });
    } catch (err) {
      warn(`[SHUTDOWN] server.close falhou: ${err.message}`);
    }
  }
  await deregisterInstance(signal).catch(err => warn(`[SHUTDOWN] deregisterInstance falhou: ${err.message}`));
  if (!process.env.DATABASE_URL?.includes('pooler.supabase.com')) {
    await releaseInstanceLock().catch(() => {});
  }
  // Force exit even if pool.end() hangs (Supabase Pooler connections may stall)
  const killTimer = setTimeout(() => {
    warn('[SHUTDOWN] pool.end() timeout — forcing exit.');
    process.exit(1);
  }, 10000);
  try {
    await Promise.race([
      pool.end(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('pool.end timeout')), 8000)),
    ]);
  } catch {
    // pool.end() failed or timed out — proceed to exit
  }
  clearTimeout(killTimer);
  process.exit(0);
}

function installShutdownSignals() {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', reason => {
    error('[UNHANDLED REJECTION]', reason);
    try {
      const metrics = require('../lib/metrics');
      metrics.interactionErrorsTotal?.inc();
    } catch {}
    // Se for erro crítico de boot (lock, migrations), shutdown fatal
    const fatal =
      reason &&
      (reason.message?.includes('lock') ||
        reason.message?.includes('migration') ||
        reason.message?.includes('DATABASE_URL'));
    if (fatal) {
      error('[UNHANDLED REJECTION] Fatal — a fazer shutdown.');
      setTimeout(() => shutdown('unhandled_fatal'), 500);
    }
  });
  process.on('uncaughtException', err => {
    error('[UNCAUGHT EXCEPTION]', err);
    // Uncaught exceptions são mais graves — tentar graceful shutdown
    // mas dar tempo ao event loop de flushar logs/metrics.
    setTimeout(() => shutdown('uncaughtException'), 500);
  });
}

module.exports = { bootstrap, shutdown, getBootPhase: () => _currentPhase };
