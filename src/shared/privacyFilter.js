'use strict';
/**
 * Privacy filter — ensures sensitive data is only shown to authorized users.
 */

const { requirePermission } = require('./requirePermission');

const PUBLIC_COMMANDS = new Set([
  'stock',
  'catalogo',
  'ficha',
  'movimento',
  'ranking',
  'saidas',
  'kill',
  'meu-pedido',
  'entrega',
  'venda',
  'transfer',
  'meu-painel',
  'meu-resumo',
  'catalogo-melhorado',
  'stock-melhorado',
  'ajuda',
  'tutorial',
  'primeira-vez',
]);

const PRIVATE_COMMANDS = new Set([
  'audit',
  'backfill-topicos',
  'cleanup-topicos',
  'nova-categoria-topicos',
  'inactivos-bairristas',
  'sync-sheets',
  'gerir-itens',
  'promover',
  'painel-pendencias',
  'relatorio',
  'incidentes',
  'ausencias',
  'dashboard',
  'erros',
]);

function isPublicCommand(name) {
  return PUBLIC_COMMANDS.has(name);
}

function isPrivateCommand(name) {
  return PRIVATE_COMMANDS.has(name);
}

async function enforcePrivacy(interaction) {
  const cmd = interaction.commandName;
  if (isPrivateCommand(cmd)) {
    return requirePermission(interaction, { minRole: 'OG' });
  }
  return true;
}

module.exports = { isPublicCommand, isPrivateCommand, enforcePrivacy, PUBLIC_COMMANDS, PRIVATE_COMMANDS };
