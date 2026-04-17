'use strict';
/**
 * Button router — rotas em array, matching por `exact` (igualdade) ou
 * `prefix` (startsWith). Primeira correspondência vence.
 *
 * Convenção:
 *   - `exact` para IDs fixos (ex: 'bairrista::movimento')
 *   - `prefix` para IDs dinâmicos com payload (ex: 'avail::all::<sessId>')
 *
 * Um customId canónico por acção. Sem aliases legacy.
 */

// ── Domain handlers ────────────────────────────────────────────────────────
const {
  handlePedirTagButton,
  handleApproveButton,
  handleDenyButton,
} = require('../../../onboarding/onboardingHandlers');
const {
  handleMemberHistoryButton,
  handleMemberTotalsButton,
  handleProgressButton,
  handleTopSemanalButton,
} = require('../../../members/memberHandlers');
const { handleMovimento, handleRanking } = require('../../../members/bairristaHandlers');
const {
  handleRegistarMaterialButton,
  handleEncomendasButton,
  handleStockCommand,
  handleAdjustStockButton,
  handleGerirMateriaisButton,
} = require('../../../inventory/inventoryHandlers');
const {
  handleCreateSaidaButton,
  handleCloseSaidaButton,
  handleCloseSessionDirect,
  handleViewSaidasButton,
  handleAddParticipantButton,
  handleRegisterMaterialButton,
  handleIssueToParticipantButton,
  handleFinalizeSaidaButton,
} = require('../../../saidas/saidaHandlers');
const saidaWizard = require('../../../saidas/saidaSettlementWizard');
const saidaStats = require('../../../saidas/saidaStatsHandlers');
const saidaSession = require('../../../saidas/saidaSession');
const saidaIndividual = require('../../../saidas/saidaIndividualResult');
const {
  handleVoteAll: availHandleVoteAll,
  handleSummary: availHandleSummary,
  handleRefresh: availHandleRefresh,
} = require('../../../availability/availabilityHandlers');
const {
  handleRandom: radioHandleRandom,
  handleSet: radioHandleSet,
  handleSwap: radioHandleSwap,
  handleHistory: radioHandleHistory,
  handleRefresh: radioHandleRefresh,
} = require('../../../radio/radioHandlers');
const chefiaActions = require('../../../panels/chefiaActions');
const patraoDiZonaActions = require('../../../panels/patraoDiZonaActions');

// ── Perfil Operacional (drill-downs) ───────────────────────────────────────
const perfilMaterial = require('../../../perfil/perfilMaterial');
const perfilPvp = require('../../../perfil/perfilPvp');
const perfilEncomendas = require('../../../perfil/perfilEncomendas');
const perfilHistorico = require('../../../perfil/perfilHistorico');
const perfilProgressao = require('../../../perfil/perfilProgressao');

// ── Match helpers ──────────────────────────────────────────────────────────
const exact = (id, handler) => ({ match: x => x === id, handler });
const prefix = (p, handler) => ({ match: x => x.startsWith(p), handler });

// Alguns handlers recebem payload extraído do customId.
const approveHandler = interaction =>
  handleApproveButton(interaction, parseInt(interaction.customId.split('::')[2], 10));
const denyHandler = interaction => handleDenyButton(interaction, parseInt(interaction.customId.split('::')[2], 10));

// ── Rotas ordenadas por prioridade (prefixos mais específicos primeiro) ───
const BUTTON_ROUTES = [
  // Availability
  prefix('avail::all::', availHandleVoteAll),
  prefix('avail::summary::', availHandleSummary),
  prefix('avail::refresh::', availHandleRefresh),

  // Saída session — auto-registo interactivo (self-serve weapon pick)
  prefix('saida::session_caracterizado::', saidaSession.handleSessionCaracterizado),
  prefix('saida::source::', saidaSession.handleCaracterizadoSource),
  prefix('saida::session_trabalhador::', saidaSession.handleSessionTrabalhador),
  prefix('saida::session_cancel::', saidaSession.handleSessionCancel),

  // Saída — resultado individual (self-service) + weapon return queue
  prefix('saida::submit_result::', saidaIndividual.handleOpenSubmitResult),
  prefix('saida::reping::', saidaIndividual.handleRepingPendentes),
  prefix('saida::weapon_queue::', saidaIndividual.handleOpenWeaponQueue),
  prefix('saida::weapon_decide::', saidaIndividual.handleWeaponDecide),

  // Saída — finalizar (em_liquidacao → concluida)
  prefix('saida::finalize::', handleFinalizeSaidaButton),

  // Saída — settlement wizard (staff fecha participante a participante)
  prefix('saida::wz_outcome::', saidaWizard.handleOutcome),
  prefix('saida::wz_weapon::', saidaWizard.handleWeaponDecision),
  prefix('saida::wz_finish::', saidaWizard.handleFinish),

  // Saída stats
  exact('chefia::stats_open', saidaStats.handleStatsOpen),

  // Radio
  prefix('radio::random::', radioHandleRandom),
  prefix('radio::set::', radioHandleSet),
  exact('radio::swap', radioHandleSwap),
  exact('radio::history', radioHandleHistory),
  exact('radio::refresh', radioHandleRefresh),

  // Onboarding
  exact('onboard::pedir_tag', handlePedirTagButton),
  prefix('onboard::approve::', approveHandler),
  prefix('onboard::deny::', denyHandler),

  // Bairrista / Oficial — painel bairrista
  exact('bairrista::registar_material', handleRegistarMaterialButton),
  exact('bairrista::encomendar', handleEncomendasButton),
  exact('bairrista::historico', perfilHistorico.handle),
  exact('bairrista::totais', handleMemberTotalsButton),
  exact('bairrista::progresso', handleProgressButton),
  exact('bairrista::top_semanal', handleTopSemanalButton),
  exact('bairrista::movimento', handleMovimento),
  exact('bairrista::ranking', handleRanking),
  exact('bairrista::progresso_tier', perfilProgressao.handle),

  // Movimento no Bairro — drill-downs do cockpit
  exact('perfil::material', perfilMaterial.handle),
  exact('perfil::pvp', perfilPvp.handle),
  exact('perfil::encomendas', perfilEncomendas.handle),
  exact('perfil::historico', perfilHistorico.handle),
  exact('perfil::progressao', perfilProgressao.handle),
  exact('perfil::voltar', handleMovimento),

  // Oficial
  exact('oficial::ver_saidas', handleViewSaidasButton),

  // Chefia — painel de alto nível (sub-passos vivem no painel da sessão).
  exact('chefia::criar_saida', handleCreateSaidaButton),
  exact('chefia::ver_saidas', handleViewSaidasButton),
  exact('chefia::ver_stock', handleStockCommand),
  exact('chefia::ajustar_stock', handleAdjustStockButton),
  exact('chefia::gerir_materiais', handleGerirMateriaisButton),
  exact('chefia::publicar_radio', chefiaActions.publicarRadio),
  exact('chefia::listar_stickys', chefiaActions.listarStickys),
  exact('chefia::ver_tops', chefiaActions.verTops),
  exact('chefia::ver_logs', chefiaActions.verLogs),

  // Painel da sessão (staff actions)
  prefix('saida::session_close_direct::', handleCloseSessionDirect),
  prefix('session::close::', handleCloseSaidaButton),
  prefix('session::add_participant::', handleAddParticipantButton),
  prefix('session::issue_material::', handleIssueToParticipantButton),
  prefix('session::register_material::', handleRegisterMaterialButton),

  // Patrão di Zona
  exact('patrao::listar_bairristas', patraoDiZonaActions.listarBairristas),
  exact('patrao::ver_entregas', patraoDiZonaActions.verEntregasOuVendas),
  exact('patrao::ver_vendas', patraoDiZonaActions.verEntregasOuVendas),
  exact('patrao::ver_tops', patraoDiZonaActions.verTopsBairristas),
];

async function handleButton(interaction) {
  const id = interaction.customId;
  const route = BUTTON_ROUTES.find(r => r.match(id));
  if (!route) return;
  return route.handler(interaction);
}

module.exports = { handleButton, BUTTON_ROUTES };
