'use strict';
/**
 * Button router — rotas em array, matching por `exact` (igualdade) ou
 * `prefix` (startsWith). Primeira correspondência vence.
 *
 * Convenção:
 *   - `exact` para IDs fixos (ex: 'morador::meu_ponto')
 *   - `prefix` para IDs dinâmicos com payload (ex: 'avail::all::<sessId>')
 *
 * Um customId canónico por acção. Sem aliases legacy.
 */

// ── Domain handlers ────────────────────────────────────────────────────────
const {
  handlePedirTagButton, handleApproveButton, handleDenyButton,
} = require('../../../onboarding/onboardingHandlers');
const {
  handleMemberHistoryButton, handleMemberTotalsButton,
  handleProgressButton, handleTopSemanalButton,
} = require('../../../members/memberHandlers');
const {
  handleMyPerformance, handleMyMaterial, handleMyProfit,
} = require('../../../members/memberStatsHandlers');
const {
  handleMeuPonto, handleRanking, handleProgressoTier,
} = require('../../../members/bairristaHandlers');
const {
  handleRegistarMaterialButton, handleEncomendasButton,
  handleStockCommand, handleAdjustStockButton,
  handleGerirMateriaisButton,
} = require('../../../inventory/inventoryHandlers');
const {
  handleCreateSaidaButton, handleCloseSaidaButton,
  handleViewSaidasButton, handleAddParticipantButton,
  handleRegisterMaterialButton, handleIssueToParticipantButton,
} = require('../../../saidas/saidaHandlers');
const saidaWizard  = require('../../../saidas/saidaSettlementWizard');
const saidaStats   = require('../../../saidas/saidaStatsHandlers');
const saidaSession = require('../../../saidas/saidaSession');
const {
  handleVoteAll: availHandleVoteAll,
  handleSummary: availHandleSummary,
  handleRefresh: availHandleRefresh,
} = require('../../../availability/availabilityHandlers');
const {
  handleRandom: radioHandleRandom,
  handleSet:    radioHandleSet,
  handleSwap:   radioHandleSwap,
  handleHistory: radioHandleHistory,
  handleRefresh: radioHandleRefresh,
} = require('../../../radio/radioHandlers');
const chefiaActions       = require('../../../panels/chefiaActions');
const patraoDiZonaActions = require('../../../panels/patraoDiZonaActions');

// ── Perfil Operacional (drill-downs) ───────────────────────────────────────
const perfilMaterial    = require('../../../perfil/perfilMaterial');
const perfilPvp         = require('../../../perfil/perfilPvp');
const perfilEncomendas  = require('../../../perfil/perfilEncomendas');
const perfilHistorico   = require('../../../perfil/perfilHistorico');
const perfilProgressao  = require('../../../perfil/perfilProgressao');

// ── Match helpers ──────────────────────────────────────────────────────────
const exact  = (id, handler) => ({ match: (x) => x === id, handler });
const prefix = (p, handler)  => ({ match: (x) => x.startsWith(p), handler });

// Alguns handlers recebem payload extraído do customId.
const approveHandler = (interaction) =>
  handleApproveButton(interaction, parseInt(interaction.customId.split('::')[2], 10));
const denyHandler = (interaction) =>
  handleDenyButton(interaction, parseInt(interaction.customId.split('::')[2], 10));

// ── Rotas ordenadas por prioridade (prefixos mais específicos primeiro) ───
const BUTTON_ROUTES = [
  // Availability
  prefix('avail::all::',      availHandleVoteAll),
  prefix('avail::summary::',  availHandleSummary),
  prefix('avail::refresh::',  availHandleRefresh),

  // Saída session — auto-registo interactivo
  prefix('saida::session_caracterizado::', saidaSession.handleSessionCaracterizado),
  prefix('saida::session_trabalhador::',   saidaSession.handleSessionTrabalhador),
  prefix('saida::session_cancel::',        saidaSession.handleSessionCancel),

  // Saída wizard + stats
  prefix('saida::wz_finish::', saidaWizard.handleFinish),
  exact ('chefia::stats_open', saidaStats.handleStatsOpen),

  // Radio
  prefix('radio::random::', radioHandleRandom),
  prefix('radio::set::',    radioHandleSet),
  exact ('radio::swap',     radioHandleSwap),
  exact ('radio::history',  radioHandleHistory),
  exact ('radio::refresh',  radioHandleRefresh),

  // Onboarding
  exact ('onboard::pedir_tag',   handlePedirTagButton),
  prefix('onboard::approve::',   approveHandler),
  prefix('onboard::deny::',      denyHandler),

  // Bairrista / Oficial — painel bairrista
  exact('morador::registar_material', handleRegistarMaterialButton),
  exact('morador::encomendar',        handleEncomendasButton),
  exact('morador::historico',         handleMemberHistoryButton),
  exact('morador::totais',            handleMemberTotalsButton),
  exact('morador::progresso',         handleProgressButton),
  exact('morador::top_semanal',       handleTopSemanalButton),
  exact('morador::my_performance',    handleMyPerformance),
  exact('morador::my_material',       handleMyMaterial),
  exact('morador::my_profit',         handleMyProfit),
  exact('morador::meu_ponto',         handleMeuPonto),
  exact('morador::ranking',           handleRanking),
  exact('morador::progresso_tier',    handleProgressoTier),

  // Perfil Operacional — drill-downs do cockpit "Meu Ponto"
  exact('perfil::material',    perfilMaterial.handle),
  exact('perfil::pvp',         perfilPvp.handle),
  exact('perfil::encomendas',  perfilEncomendas.handle),
  exact('perfil::historico',   perfilHistorico.handle),
  exact('perfil::progressao',  perfilProgressao.handle),
  exact('perfil::voltar',      handleMeuPonto),

  // Oficial
  exact('oficial::ver_saidas',     handleViewSaidasButton),

  // Chefia — saídas
  exact('chefia::criar_saida',              handleCreateSaidaButton),
  exact('chefia::fechar_saida',             handleCloseSaidaButton),
  exact('chefia::ver_saidas',               handleViewSaidasButton),
  exact('chefia::registar_material_saida',  handleRegisterMaterialButton),
  exact('chefia::adicionar_participante',   handleAddParticipantButton),
  exact('chefia::fornecer_participante',    handleIssueToParticipantButton),
  exact('chefia::ver_stock',                handleStockCommand),
  exact('chefia::ajustar_stock',            handleAdjustStockButton),
  exact('chefia::gerir_materiais',          handleGerirMateriaisButton),

  // Chefia — sistemas auxiliares (disponibilidade / rádio / stickys / dados)
  exact('chefia::abrir_disponibilidade', chefiaActions.abrirDisponibilidade),
  exact('chefia::publicar_radio',        chefiaActions.publicarRadio),
  exact('chefia::listar_stickys',        chefiaActions.listarStickys),
  exact('chefia::ver_tops',              chefiaActions.verTops),
  exact('chefia::ver_logs',              chefiaActions.verLogs),

  // Patrão di Zona
  exact('chefe_mor::listar_moradores',  patraoDiZonaActions.listarBairristas),
  exact('chefe_mor::ver_entregas',      patraoDiZonaActions.verEntregasOuVendas),
  exact('chefe_mor::ver_vendas',        patraoDiZonaActions.verEntregasOuVendas),
  exact('chefe_mor::ver_tops',          patraoDiZonaActions.verTopsBairristas),
];

async function handleButton(interaction) {
  const id = interaction.customId;
  const route = BUTTON_ROUTES.find(r => r.match(id));
  if (!route) return;
  return route.handler(interaction);
}

module.exports = { handleButton, BUTTON_ROUTES };
