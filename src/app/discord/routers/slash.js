'use strict';

const { handleMeuPedido } = require('../../../onboarding/meuPedido');
const kick = require('../../../queries/kick');
const perfil = require('../../../queries/perfil');
const syncMembro = require('../../../queries/syncMembro');
const painelEntrada = require('../../../queries/painelEntrada');
const { commandsByName } = require('../../../lib/metrics');

const SLASH_ROUTES = {
  'meu-pedido': handleMeuPedido,
  perfil: perfil.handle,
  kick: kick.handle,
  'sync-membro': syncMembro.handle,
  'painel-entrada': painelEntrada.handle,
};

async function handleSlash(interaction) {
  const cmd = interaction.commandName;
  const handler = SLASH_ROUTES[cmd];
  if (!handler) return;
  commandsByName.inc({ command: cmd });
  return handler(interaction);
}

module.exports = { handleSlash, SLASH_ROUTES };
