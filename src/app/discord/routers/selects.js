'use strict';
/**
 * String select router — rotas em array, match por exact ou prefix.
 * Um customId canónico por acção (`saida::*`) — sem aliases legacy.
 */

const {
  handleTipoRegistoSelect,
  handleCategorySelect,
  handleAdjustSelect,
  handleGerirActionSelect,
  handleEditItemSelect,
  handleDeactivateItemSelect,
  handleReactivateItemSelect,
  handleCartCategory,
  handleCartItemPick,
  handleCartLineAction,
} = require('../../../inventory/handlers');
const orderHandlers = require('../../../orders/orderHandlers');
const {
  handleCloseSaidaSelect,
  handleCloseResultSelect,
  handleCreateTypeSelect,
  handleCreateSpotSelect,
  handleAddParticipantSelect,
  handleMaterialOpSelect,
  handleMaterialDirectionSelect,
  handleMaterialCategorySelect,
  handleMaterialItemSelect,
  handleIssueSaidaSelect,
  handleIssueParticipantSelect,
  handleIssueItemSelect,
  handleMarkDeadSelect,
} = require('../../../saidas/saidaHandlers');
const saidaWizard = require('../../../saidas/saidaSettlementWizard');
const saidaStats = require('../../../saidas/saidaStatsHandlers');
const saidaIndividual = require('../../../saidas/saidaIndividualResult');
const saidaSession = require('../../../saidas/saidaSession');
const { handleRankingSelect } = require('../../../members/bairristaHandlers');
const perfilMaterial = require('../../../perfil/perfilMaterial');
const perfilHistorico = require('../../../perfil/perfilHistorico');
const { handlePanelGerirSelect } = require('../../../panels/chefiaActions');
const orderManagement = require('../../../orders/orderManagement');
const orderManagementPanel = require('../../../orders/orderManagementPanel');
const orderTrackingService = require('../../../orders/orderTrackingService');

const exact = (id, handler) => ({ match: x => x === id, handler });
const prefix = (p, handler) => ({ match: x => x.startsWith(p), handler });

const SELECT_ROUTES = [
  // Inventory — registo de material (ponto de entrada: cart flow)
  exact('inv::select_tipo_registo', handleTipoRegistoSelect),
  prefix('inv::cat_', handleCategorySelect),
  exact('inv::select_ajuste', handleAdjustSelect),
  prefix('ordercat::', orderHandlers.handleOrderCategorySelect),
  prefix('orderitem::', orderHandlers.handleOrderItemSelect),
  exact('ordercart::remove', orderHandlers.handleOrderCartRemove),

  // Inventory — BAIRRISTA CART multi-item flow (migration 038)
  prefix('invcart::cat::', handleCartCategory),
  prefix('invcart::pick::', handleCartItemPick),
  prefix('invcart::line_action::', handleCartLineAction),

  // Searchable item picker — user selecciona do select filtrado
  prefix('itemsearch::pick::', require('../../../inventory/itemSearch').handlePick),

  // Inventory — gestão
  exact('inv::select_gerir_action', handleGerirActionSelect),
  exact('inv::select_edit_item', handleEditItemSelect),
  exact('inv::select_deactivate_item', handleDeactivateItemSelect),
  exact('inv::select_reactivate_item', handleReactivateItemSelect),

  // Bairrista — ranking por período
  exact('bairrista::ranking_period', handleRankingSelect),

  // Perfil — seletores de período/filtro
  exact('perfil::material_period', perfilMaterial.handlePeriodSelect),
  exact('perfil::historico_filter', perfilHistorico.handleFilterSelect),

  // Saída — predefinidos + fluxos
  exact('saida::select_create_type', handleCreateTypeSelect),
  exact('saida::select_create_spot', handleCreateSpotSelect),
  exact('saida::select_close_result', handleCloseResultSelect),
  exact('saida::select_close', handleCloseSaidaSelect),
  exact('saida::select_add_participant', handleAddParticipantSelect),
  exact('saida::select_material_op', handleMaterialOpSelect),
  exact('saida::select_material_direction', handleMaterialDirectionSelect),
  prefix('saida::cat_', handleMaterialCategorySelect),
  exact('saida::select_material_item', handleMaterialItemSelect),

  // Custódia nominal
  exact('saida::issue_select_saida', handleIssueSaidaSelect),
  exact('saida::issue_select_participant', handleIssueParticipantSelect),
  exact('saida::issue_select_item', handleIssueItemSelect),

  // Mark dead + wizard + stats
  prefix('saida::mark_dead::', handleMarkDeadSelect),
  prefix('saida::wz_select::', saidaWizard.handleSelectParticipant),
  exact('saida::stats_pick', saidaStats.handleStatsPick),

  // Weapon return — staff escolhe participante
  prefix('saida::weapon_confirm_pick::', saidaIndividual.handleWeaponConfirmPick),

  // Painéis — select menus GERIR (Chefia / Patrão di Zona)
  exact('panel::chefia_gerir', handlePanelGerirSelect),
  exact('panel::patrao_gerir', handlePanelGerirSelect),

  // Caracterizado self-serve — weapon pick (step 3 do fluxo)
  prefix('saida::weapon_pick::', saidaSession.handleCaracterizadoWeaponPick),

  // Session management — admin swap + approve request picks
  prefix('saida::session_swap_pick::', saidaSession.handleSessionSwapPick),
  prefix('saida::session_approve_pick::', saidaSession.handleSessionApprovePick),

  // Order management — chefia select actions (legacy + new panel)
  exact('order::manage_action', orderManagement.handleOrderManageSelect),
  exact('ordermanage::action', orderManagementPanel.handleOrderAction),

  // Order tracking detail
  prefix('ordertrack::detail::', interaction => {
    const orderId = parseInt(interaction.values[0], 10);
    return orderTrackingService.showOrderDetail(interaction, orderId);
  }),

  // Quick quantity select
  prefix('orderqty::', orderHandlers.handleOrderQtySelect),

  // Cancelamento de encomenda pelo bairrista
  exact('order::cancel_select', orderHandlers.handleOrderCancelSelect),

  // Stock v3
  exact('stockv3::select_entrada_item', require('../../../inventory/v3/chefiaStockHandlers').handleEntradaItemSelect),
  exact('stockv3::select_retirada_tipo', require('../../../inventory/v3/chefiaStockHandlers').handleRetiradaTipoSelect),
  exact('stockv3::select_venda_item', require('../../../inventory/v3/chefiaStockHandlers').handleVendaItemSelect),
  exact('stockv3::select_entrega_item', require('../../../inventory/v3/chefiaStockHandlers').handleEntregaItemSelect),
  exact('stockv3::select_preco_item', require('../../../inventory/v3/chefiaStockHandlers').handlePrecoItemSelect),
];

async function handleSelect(interaction) {
  const id = interaction.customId;
  const route = SELECT_ROUTES.find(r => r.match(id));
  if (!route) {
    const { warn } = require('../../logger');
    warn(`[Router:Select] No route for customId: ${id}`);
    return;
  }
  return route.handler(interaction);
}

module.exports = { handleSelect, SELECT_ROUTES };
