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
const catalogo = require('../../../queries/catalogo');
const ranking = require('../../../queries/ranking');
const saidasMinhas = require('../../../queries/saidasMinhas');
const transfer = require('../../../queries/transfer');
const entregaVendaRapida = require('../../../queries/entregaVendaRapida');

const { handleRegisterKillButton } = require('../../../kills/killHandlers');
const { handleMovimento } = require('../../../members/bairristaHandlers');
const { handleMeuPedido } = require('../../../onboarding/meuPedido');
const gerirItens = require('../../../queries/gerirItens');
const promover = require('../../../queries/promover');
const meuPainel = require('../../../queries/meuPainel');
const incidentes = require('../../../queries/incidentes');
const catalogoMelhorado = require('../../../queries/catalogoMelhorado');
const stockMelhorado = require('../../../queries/stockMelhorado');
const ajuda = require('../../../queries/ajuda');
const tutorial = require('../../../queries/tutorial');
const ausencias = require('../../../queries/ausencias');
const meuResumo = require('../../../queries/meuResumo');
const primeiraVez = require('../../../queries/primeiraVez');
const { commandsByName } = require('../../../lib/metrics');

const SLASH_ROUTES = {
  // ── Queries user-facing
  stock: stockCheck.handle,
  ficha: ficha.handle,
  catalogo: catalogo.handle,
  ranking: ranking.handle,
  saidas: saidasMinhas.handle,
  movimento: handleMovimento,
  kill: handleRegisterKillButton,
  'meu-pedido': handleMeuPedido,

  // ── Entrega/venda rápida (autocomplete por nome do item)
  entrega: entregaVendaRapida.handleEntrega,
  venda: entregaVendaRapida.handleVenda,

  // ── Staff operacional
  transfer: transfer.handle,
  'gerir-itens': gerirItens.handle,
  promover: promover.handle,
  'meu-painel': meuPainel.handle,
  incidentes: incidentes.handle,
  'catalogo-melhorado': catalogoMelhorado.handle,
  'stock-melhorado': stockMelhorado.handle,
  ajuda: ajuda.handle,
  tutorial: tutorial.handle,
  ausencias: ausencias.handle,
  'meu-resumo': meuResumo.handle,
  'primeira-vez': primeiraVez.handle,
};

async function handleSlash(interaction) {
  const cmd = interaction.commandName;
  const handler = SLASH_ROUTES[cmd];
  if (!handler) return; // comando desconhecido — ignorar silenciosamente
  commandsByName.inc({ command: cmd });
  return handler(interaction);
}

module.exports = { handleSlash, SLASH_ROUTES };
