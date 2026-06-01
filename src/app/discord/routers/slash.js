'use strict';

const saidasMinhas = require('../../../queries/saidasMinhas');
const { handleMeuPedido } = require('../../../onboarding/meuPedido');
const primeiraVez = require('../../../queries/primeiraVez');
const { commandsByName } = require('../../../lib/metrics');

const SLASH_ROUTES = {
  'meu-pedido': handleMeuPedido,
  saidas: saidasMinhas.handle,
  'primeira-vez': primeiraVez.handle,
};

async function handleSlash(interaction) {
  const cmd = interaction.commandName;
  const handler = SLASH_ROUTES[cmd];
  if (!handler) return;
  commandsByName.inc({ command: cmd });
  return handler(interaction);
}

module.exports = { handleSlash, SLASH_ROUTES };
