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
const entregaVendaRapida = require('../../../queries/entregaVendaRapida');

const { handleRegisterKillButton } = require('../../../kills/killHandlers');
const { handleMovimento } = require('../../../members/bairristaHandlers');
const { handleMeuPedido } = require('../../../onboarding/meuPedido');
const syncSheets = require('../../../queries/syncSheets');
const backfillTopicos = require('../../../queries/backfillTopicos');
const cleanupTopicos = require('../../../queries/cleanupTopicos');
const organizeTopicos = require('../../../queries/organizeTopicos');
const novaCategoriaTopicos = require('../../../queries/novaCategoriaTopicos');
const dedupTopicos = require('../../../queries/dedupTopicos');
const inactivosBairristas = require('../../../queries/inactivosBairristas');
const premios = require('../../../queries/premios');
const gerirItens = require('../../../queries/gerirItens');
const metas = require('../../../queries/metas');
const qualidadeDados = require('../../../queries/qualidadeDados');
const lifecycle = require('../../../queries/lifecycle');
const promover = require('../../../queries/promover');
const painelPendencias = require('../../../queries/painelPendencias');
const meuPainel = require('../../../queries/meuPainel');
const relatorio = require('../../../queries/relatorio');
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
  'meu-pedido': handleMeuPedido,

  // ── Entrega/venda rápida (autocomplete por nome do item)
  entrega: entregaVendaRapida.handleEntrega,
  venda: entregaVendaRapida.handleVenda,

  // ── Staff operacional
  audit: audit.handle,
  transfer: transfer.handle,
  'sync-sheets': syncSheets.handle,
  'backfill-topicos': backfillTopicos.handle,
  'cleanup-topicos': cleanupTopicos.handle,
  'organize-topicos': organizeTopicos.handle,
  'nova-categoria-topicos': novaCategoriaTopicos.handle,
  'dedup-topicos': dedupTopicos.handle,
  'inactivos-bairristas': inactivosBairristas.handle,
  premios: premios.handle,
  'gerir-itens': gerirItens.handle,
  metas: metas.handle,
  'qualidade-dados': qualidadeDados.handle,
  lifecycle: lifecycle.handle,
  promover: promover.handle,
  'painel-pendencias': painelPendencias.handle,
  'meu-painel': meuPainel.handle,
  relatorio: relatorio.handle,
};

async function handleSlash(interaction) {
  const cmd = interaction.commandName;
  const handler = SLASH_ROUTES[cmd];
  if (!handler) return; // comando desconhecido — ignorar silenciosamente
  commandsByName.inc({ command: cmd });
  return handler(interaction);
}

module.exports = { handleSlash, SLASH_ROUTES };
