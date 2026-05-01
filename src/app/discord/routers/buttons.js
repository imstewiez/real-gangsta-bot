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
const { handleMeuPedido } = require('../../../onboarding/meuPedido');
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
  handleEncomendaModeSelect,
  handleStockCommand,
  handleAdjustStockButton,
  handleGerirMateriaisButton,
  handleCartAdd,
  handleCartNotesButton,
  handleCartCancel,
  handleCartRepeat,
  handleCartSubmit,
  handleCartUndo,
  handleDeliveryDecision,
  handleCartPreview,
  handleCartPreviewBack,
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
} = require('../../../radio/radioHandlers');
const chefiaActions = require('../../../panels/chefiaActions');
const patraoDiZonaActions = require('../../../panels/patraoDiZonaActions');
const buttonAdapters = require('../../../panels/buttonAdapters');

// ── Leaderboard live panel ─────────────────────────────────────────────────
const {
  handleLeaderboardDetails,
  handleLeaderboardNav,
  handleLeaderboardCustomOpen,
  handleLeaderboardRefresh,
} = require('../../../leaderboard/leaderboardHandlers');

// ── Searchable item picker (itemsearch::open::<purpose>) ───────────────────
const itemSearch = require('../../../inventory/itemSearch');

// ── Global searchable select ───────────────────────────────────────────────
const { handleSearchOpen, handleSearchClear } = require('../../../shared/selectSearch');

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

  // Leaderboard live panel — details ephemeral + refresh manual + nav
  prefix('lb::details::', handleLeaderboardDetails),
  prefix('lb::nav::', handleLeaderboardNav),
  exact('lb::custom::open', handleLeaderboardCustomOpen),
  exact('lb::refresh', handleLeaderboardRefresh),

  // Global searchable select — pesquisa em dropdowns
  prefix('search::open::', handleSearchOpen),
  prefix('search::clear::', handleSearchClear),

  // Searchable item picker — botão abre modal com text input
  prefix('itemsearch::open::', itemSearch.handleOpenButton),

  // Saída session — single-signup flow (saves as pending, admin Iniciar roda auto-pick)
  prefix('saida::session_caracterizado::', saidaSession.handleSessionCaracterizado),
  prefix('saida::source::', saidaSession.handleCaracterizadoSource),
  prefix('saida::session_trabalhador::', saidaSession.handleSessionTrabalhador),
  prefix('saida::session_cancel::', saidaSession.handleSessionCancel),
  prefix('saida::session_iniciar::', saidaSession.handleSessionIniciar),
  prefix('saida::session_pedir_juntar::', saidaSession.handleSessionPedirJuntar),
  prefix('saida::session_swap_open::', saidaSession.handleSessionSwapOpen),
  prefix('saida::session_approve_open::', saidaSession.handleSessionApproveOpen),
  prefix('saida::session_approve_decide::', saidaSession.handleSessionApproveDecide),

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

  // Onboarding
  exact('onboard::pedir_tag', handlePedirTagButton),
  exact('onboard::meu_pedido', handleMeuPedido),
  prefix('onboard::approve::', approveHandler),
  prefix('onboard::deny::', denyHandler),

  // Bairrista cart (migration 038) — multi-item flow
  prefix('invcart::add::', handleCartAdd),
  prefix('invcart::notes::', handleCartNotesButton),
  prefix('invcart::cancel::', handleCartCancel),
  prefix('invcart::repeat::', handleCartRepeat),
  prefix('invcart::submit::', handleCartSubmit),
  prefix('invcart::undo::', handleCartUndo),
  prefix('invcart::preview_back::', handleCartPreviewBack),
  prefix('invcart::preview::', handleCartPreview),
  prefix('invdelivery::approve::', handleDeliveryDecision),
  prefix('invdelivery::reject::', handleDeliveryDecision),

  // Bairrista — painel bairrista (v12)
  exact('bairrista::entregar_material', buttonAdapters.handleEntregarMaterialButton),
  exact('bairrista::registar_material', handleRegistarMaterialButton), // legacy fallback
  exact('bairrista::encomendar', handleEncomendasButton),
  prefix('inv::encomenda_mode::', handleEncomendaModeSelect),
  exact('bairrista::vender', buttonAdapters.handleVenderButton),
  exact('bairrista::registar_kill', buttonAdapters.handleKillButton),
  exact('bairrista::ausencia', buttonAdapters.handleAusenciaButton),
  exact('bairrista::historico', perfilHistorico.handle),
  exact('bairrista::totais', handleMemberTotalsButton),
  exact('bairrista::progresso', handleProgressButton),
  exact('bairrista::top_semanal', handleTopSemanalButton),
  exact('bairrista::movimento', handleMovimento),
  exact('bairrista::ranking', handleRanking),
  exact('bairrista::progresso_tier', perfilProgressao.handle),
  exact('bairrista::catalogo', buttonAdapters.handleCatalogoButton),
  exact('bairrista::saidas', buttonAdapters.handleMinhasSaidasButton),
  exact('bairrista::meu_resumo', buttonAdapters.handleMeuResumoButton),

  // Movimento no Bairro — drill-downs do cockpit
  exact('perfil::material', perfilMaterial.handle),
  exact('perfil::pvp', perfilPvp.handle),
  exact('perfil::encomendas', perfilEncomendas.handle),
  exact('perfil::historico', perfilHistorico.handle),
  exact('perfil::progressao', perfilProgressao.handle),
  exact('perfil::voltar', handleMovimento),

  // Oficial — painel oficial (v12)
  exact('oficial::ver_saidas', handleViewSaidasButton),
  exact('oficial::emitir_material', buttonAdapters.handleEmitirMaterialButton),
  exact('oficial::add_participante', buttonAdapters.handleAddParticipanteButton),

  // Chefia — painel chefia (v12)
  exact('chefia::criar_saida', handleCreateSaidaButton),
  exact('chefia::fechar_saida', buttonAdapters.handleFecharSaidaButton),
  exact('chefia::ver_saidas', handleViewSaidasButton),
  exact('chefia::ver_stock', handleStockCommand),
  exact('chefia::ajustar_stock', handleAdjustStockButton),
  exact('chefia::gerir_materiais', handleGerirMateriaisButton),
  exact('chefia::ver_tops', chefiaActions.verTops),
  exact('chefia::ver_logs', chefiaActions.verLogs),
  exact('chefia::criar_incidente', buttonAdapters.handleCriarIncidenteButton),
  exact('chefia::transferir_stock', buttonAdapters.handleTransferirStockButton),
  exact('chefia::ausencias', buttonAdapters.handleAusenciaButton),
  exact('chefia::painel_pendencias', buttonAdapters.handlePainelPendenciasButton),
  exact('chefia::relatorio', buttonAdapters.handleRelatorioButton),
  exact('chefia::dashboard', buttonAdapters.handleDashboardButton),
  exact('chefia::inactivos', buttonAdapters.handleInactivosButton),
  exact('chefia::sync_sheets', buttonAdapters.handleSyncSheetsButton),
  exact('chefia::republicar_paineis', chefiaActions.republicarTodosPaineis),
  exact('chefia::promover', buttonAdapters.handlePromoverButton),

  // Painel da sessão (staff actions)
  prefix('saida::session_close_direct::', handleCloseSessionDirect),
  prefix('session::close::', handleCloseSaidaButton),
  prefix('session::add_participant::', handleAddParticipantButton),
  prefix('session::issue_material::', handleIssueToParticipantButton),
  prefix('session::register_material::', handleRegisterMaterialButton),

  // Patrão di Zona — painel patrão (v12)
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
