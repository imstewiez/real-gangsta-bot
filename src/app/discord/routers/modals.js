'use strict';
/**
 * Modal submit router — rotas em array, match por exact ou prefix.
 * Um customId canónico por modal (`saida::*`) — sem aliases legacy.
 */

const { handleTagModal, handleDenyModalSubmit } = require('../../../onboarding/onboardingHandlers');
const {
  handleAdjustModal,
  handleAddItemModal,
  handleEditPriceModal,
  handleEncomendaModal,
  handleCartQtyModal,
  handleCartNotesModal,
} = require('../../../inventory/inventoryHandlers');
const {
  handleCreateSaidaModal,
  handleCloseSaidaModal,
  handleMaterialQtyModal,
  handleIssueQtyModal,
} = require('../../../saidas/saidaHandlers');
const saidaWizard = require('../../../saidas/saidaSettlementWizard');
const saidaIndividual = require('../../../saidas/saidaIndividualResult');
const { handleKillModal } = require('../../../kills/killHandlers');
const { handleLeaderboardCustomModal } = require('../../../leaderboard/leaderboardHandlers');

const { handleSetModal: radioHandleSetModal } = require('../../../radio/radioHandlers');
const { handleDefineModal: prizeHandleDefineModal } = require('../../../queries/premios');
const buttonAdapters = require('../../../panels/buttonAdapters');
const { handleSearchModal } = require('../../../shared/selectSearch');

const exact = (id, handler) => ({ match: x => x === id, handler });
const prefix = (p, handler) => ({ match: x => x.startsWith(p), handler });

const MODAL_ROUTES = [
  // Onboarding
  exact('onboard::modal_tag', handleTagModal),
  prefix('onboard::modal_deny::', handleDenyModalSubmit),

  // Inventory (staff admin + cart modals)
  exact('inv::modal_ajuste_manual', handleAdjustModal),
  exact('inv::modal_add_item', handleAddItemModal),
  exact('inv::modal_edit_price', handleEditPriceModal),
  exact('inv::modal_encomenda', handleEncomendaModal),

  // Bairrista cart modals (migration 038)
  prefix('invcart::qty_modal::', handleCartQtyModal),
  prefix('invcart::notes_modal::', handleCartNotesModal),

  // Global searchable select — modal de pesquisa em dropdowns
  prefix('search::modal::', handleSearchModal),

  // Searchable item picker — modal submit devolve filtered select
  prefix('itemsearch::modal::', require('../../../inventory/itemSearch').handleSubmitModal),

  // Saída
  exact('saida::modal_create', handleCreateSaidaModal),
  exact('saida::modal_close', handleCloseSaidaModal),
  exact('saida::modal_material_qty', handleMaterialQtyModal),
  exact('saida::issue_modal_qty', handleIssueQtyModal),
  prefix('saida::wz_modal::', saidaWizard.handleSettleModal),
  prefix('saida::submit_result_modal::', saidaIndividual.handleSubmitResultModal),

  // Kill
  exact('kill::modal', handleKillModal),

  // Radio
  prefix('radio::modal_set::', radioHandleSetModal),

  // Leaderboard — datas custom
  exact('lb::custom::modal', handleLeaderboardCustomModal),

  // Prémios semanais
  prefix('prize::define::', prizeHandleDefineModal),

  // Button adapters — modais de painel (v12)
  exact('adapter::modal_vender', buttonAdapters.handleVenderModalSubmit),
  exact('adapter::modal_ausencia', buttonAdapters.handleAusenciaModalSubmit),
  exact('adapter::modal_criar_incidente', buttonAdapters.handleCriarIncidenteModalSubmit),
  exact('adapter::modal_transferir', buttonAdapters.handleTransferirModalSubmit),
  prefix('adapter::modal_promover::', buttonAdapters.handlePromoverModalSubmit),
  exact('adapter::modal_promover', buttonAdapters.handlePromoverModalSubmit),

  // Encomendas — modal de recusa
  prefix('order::modal_recusar::', require('../../../orders/orderManagement').handleOrderRecusarModal),
];

async function handleModal(interaction) {
  const id = interaction.customId;
  const route = MODAL_ROUTES.find(r => r.match(id));
  if (!route) return;
  return route.handler(interaction);
}

module.exports = { handleModal, MODAL_ROUTES };
