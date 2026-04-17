'use strict';
/**
 * Slash router — map declarativo commandName → handler.handle(interaction).
 *
 * Cada handler é um módulo fino em src/queries com assinatura
 * `async handle(interaction)`. Acções de manutenção técnica não têm slash —
 * correm em jobs automáticos (ver src/jobs/scheduler.js).
 */

const stockCheck = require('../../../queries/stockCheck');
const ficha = require('../../../queries/ficha');
const audit = require('../../../queries/audit');
const catalogo = require('../../../queries/catalogo');
const ranking = require('../../../queries/ranking');
const saidasMinhas = require('../../../queries/saidasMinhas');
const versao = require('../../../queries/versao');
const transfer = require('../../../queries/transfer');

const { handleRegisterKillButton } = require('../../../kills/killHandlers');
const { handleMovimento } = require('../../../members/bairristaHandlers');
const { commandsByName } = require('../../../lib/metrics');

const SLASH_ROUTES = {
  // ── Queries user-facing
  stock: stockCheck.handle,
  ficha: ficha.handle,
  catalogo: catalogo.handle,
  ranking: ranking.handle,
  saidas: saidasMinhas.handle,
  versao: versao.handle,
  movimento: handleMovimento,
  kill: handleRegisterKillButton,

  // ── Staff operacional
  audit: audit.handle,
  transfer: transfer.handle,
};

async function handleSlash(interaction) {
  const cmd = interaction.commandName;
  const handler = SLASH_ROUTES[cmd];
  if (!handler) return; // comando desconhecido — ignorar silenciosamente
  commandsByName.inc({ command: cmd });
  return handler(interaction);
}

module.exports = { handleSlash, SLASH_ROUTES };
