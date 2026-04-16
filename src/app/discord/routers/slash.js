'use strict';
/**
 * Slash router — map declarativo commandName → handler.handle(interaction).
 *
 * Cada handler é um módulo fino em src/queries, src/admin ou src/maintenance
 * com assinatura `async handle(interaction)`.
 */

const stockCheck     = require('../../../queries/stockCheck');
const ficha          = require('../../../queries/ficha');
const audit          = require('../../../queries/audit');
const catalogo       = require('../../../queries/catalogo');
const ranking        = require('../../../queries/ranking');
const saidasMinhas   = require('../../../queries/saidasMinhas');
const versao         = require('../../../queries/versao');
const transfer       = require('../../../queries/transfer');

const rebuildRankings = require('../../../admin/rebuildRankings');
const precario        = require('../../../admin/precario');
const backfill        = require('../../../admin/backfill');

const syncPerms    = require('../../../maintenance/syncPerms');
const reconcileCmd = require('../../../maintenance/reconcile');
const syncSheet    = require('../../../maintenance/syncSheet');
const rebuildSheet = require('../../../maintenance/rebuildSheet');

const { handleRegisterKillButton } = require('../../../kills/killHandlers');
const { handleMeuPonto } = require('../../../members/bairristaHandlers');

const SLASH_ROUTES = {
  // ── Queries
  stock:     stockCheck.handle,
  ficha:     ficha.handle,
  catalogo:  catalogo.handle,
  ranking:   ranking.handle,
  saidas:    saidasMinhas.handle,
  versao:    versao.handle,
  audit:     audit.handle,
  transfer:  transfer.handle,
  ponto:     handleMeuPonto,
  kill:      handleRegisterKillButton,

  // ── Admin (chefia only)
  rebuild:   rebuildRankings.handle,
  precario:  precario.handle,
  backfill:  backfill.handle,

  // ── Maintenance
  perms:       syncPerms.handle,
  reconcile:   reconcileCmd.handle,
  syncsheet:   syncSheet.handle,
  rebuildsheet: rebuildSheet.handle,
};

async function handleSlash(interaction) {
  const cmd = interaction.commandName;
  const handler = SLASH_ROUTES[cmd];
  if (!handler) return; // comando desconhecido — ignorar silenciosamente
  return handler(interaction);
}

module.exports = { handleSlash, SLASH_ROUTES };
