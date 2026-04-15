'use strict';
/**
 * [DEPRECATED] inventorySync — substituído por src/sheets/syncEngine.js.
 *
 * Mantido como shim fino para compatibilidade com código/tests legados
 * que ainda importam `syncAll` daqui. Remover quando a migração for
 * confirmada em produção.
 */

const { warn } = require('../logger');

async function syncAll() {
  warn('[SHEETS] inventorySync.syncAll() está deprecated — usa sheets/syncEngine.syncAll().');
  const engine = require('./syncEngine');
  return engine.syncAll();
}

module.exports = { syncAll };
