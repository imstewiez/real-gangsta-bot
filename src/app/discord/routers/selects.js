'use strict';
/**
 * String select router — rotas em array, match por exact ou prefix.
 */

const {
  handleTipoRegistoSelect, handleItemSelect,
  handleAdjustSelect, handleEncomendaSelect,
  handleGerirActionSelect, handleEditItemSelect,
  handleDeactivateItemSelect, handleReactivateItemSelect,
} = require('../../../inventory/inventoryHandlers');
const {
  handleCloseSaidaSelect, handleCloseResultSelect, handleCreateTypeSelect,
  handleAddParticipantSelect, handleMaterialOpSelect, handleMaterialDirectionSelect,
  handleMaterialItemSelect, handleIssueSaidaSelect, handleIssueParticipantSelect,
  handleIssueItemSelect, handleMarkDeadSelect,
} = require('../../../saidas/saidaHandlers');
const saidaWizard = require('../../../saidas/saidaSettlementWizard');
const saidaStats  = require('../../../saidas/saidaStatsHandlers');
const { handleRankingSelect } = require('../../../members/bairristaHandlers');
const { handleVoteSelect: availHandleVoteSelect } = require('../../../availability/availabilityHandlers');

const exact  = (id, handler) => ({ match: (x) => x === id, handler });
const prefix = (p, handler)  => ({ match: (x) => x.startsWith(p), handler });

const SELECT_ROUTES = [
  // Availability
  prefix('avail::vote_select::', availHandleVoteSelect),

  // Inventory — registo de material
  exact('inv::select_tipo_registo', handleTipoRegistoSelect),
  exact('inv::select_item_entrega', handleItemSelect),
  exact('inv::select_item_venda',   handleItemSelect),
  exact('inv::select_ajuste',       handleAdjustSelect),
  exact('inv::select_encomenda',    handleEncomendaSelect),

  // Inventory — gestão
  exact('inv::select_gerir_action',    handleGerirActionSelect),
  exact('inv::select_edit_item',       handleEditItemSelect),
  exact('inv::select_deactivate_item', handleDeactivateItemSelect),
  exact('inv::select_reactivate_item', handleReactivateItemSelect),

  // Bairrista — ranking por período
  exact('bairrista::ranking_period', handleRankingSelect),

  // Saída — predefinidos
  exact('saida::select_create_type',  handleCreateTypeSelect),
  exact('saida::select_close_result', handleCloseResultSelect),

  // Saída — fluxos (aliases saida:: e op::)
  exact('saida::select_close',              handleCloseSaidaSelect),
  exact('op::select_close',                 handleCloseSaidaSelect),
  exact('saida::select_add_participant',    handleAddParticipantSelect),
  exact('op::select_add_participant',       handleAddParticipantSelect),
  exact('saida::select_material_op',        handleMaterialOpSelect),
  exact('op::select_material_op',           handleMaterialOpSelect),
  exact('saida::select_material_direction', handleMaterialDirectionSelect),
  exact('op::select_material_direction',    handleMaterialDirectionSelect),
  exact('saida::select_material_item',      handleMaterialItemSelect),
  exact('op::select_material_item',         handleMaterialItemSelect),

  // Custódia nominal
  exact('saida::issue_select_saida',       handleIssueSaidaSelect),
  exact('op::issue_select_op',             handleIssueSaidaSelect),
  exact('saida::issue_select_participant', handleIssueParticipantSelect),
  exact('op::issue_select_participant',    handleIssueParticipantSelect),
  exact('saida::issue_select_item',        handleIssueItemSelect),
  exact('op::issue_select_item',           handleIssueItemSelect),

  // Mark dead + wizard + stats
  prefix('saida::mark_dead::', handleMarkDeadSelect),
  prefix('op::mark_dead::',    handleMarkDeadSelect),
  prefix('saida::wz_select::', saidaWizard.handleSelectParticipant),
  exact ('saida::stats_pick',  saidaStats.handleStatsPick),
];

async function handleSelect(interaction) {
  const id = interaction.customId;
  const route = SELECT_ROUTES.find(r => r.match(id));
  if (!route) return;
  return route.handler(interaction);
}

module.exports = { handleSelect, SELECT_ROUTES };
