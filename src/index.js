'use strict';
/**
 * Bot di Zona · Ballas Gang — entry point.
 *
 * Toda a lógica de orquestração (lock singleton, migrations, Discord client,
 * listeners, routers) vive em `src/app/bootstrap.js`. Este ficheiro só
 * arranca o composition root e loga erros fatais.
 */

const { bootstrap } = require('./app/bootstrap');
const { error } = require('./logger');

bootstrap().catch(e => {
  error('[BOOT] Fatal error:', e);
  process.exit(1);
});
