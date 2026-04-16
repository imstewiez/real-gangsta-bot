'use strict';
/**
 * String select router — rotas em array, match por exact ou prefix.
 * Um customId canónico por acção (`saida::*`) — sem aliases legacy.
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
const saidaIndividual = require('../../../saidas/saidaIndividualResult');
const saidaSession = require('../../../saidas/saidaSession');
const { handleRankingSelect } = require('../../../members/bairristaHandlers');
const { handleVoteSelect: availHandleVoteSelect } = require('../../../availability/availabilityHandlers');
const perfilMaterial  = require('../../../perfil/perfilMaterial');
const perfilHistorico = require('../../../perfil/perfilHistorico');

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

  // Perfil — seletores de período/filtro
  exact('perfil::material_period',  perfilMaterial.handlePeriodSelect),
  exact('perfil::historico_filter', perfilHistorico.handleFilterSelect),

  // Saída — predefinidos + fluxos
  exact('saida::select_create_type',        handleCreateTypeSelect),
  exact('saida::select_close_result',       handleCloseResultSelect),
  exact('saida::select_close',              handleCloseSaidaSelect),
  exact('saida::select_add_participant',    handleAddParticipantSelect),
  exact('saida::select_material_op',        handleMaterialOpSelect),
  exact('saida::select_material_direction', handleMaterialDirectionSelect),
  exact('saida::select_material_item',      handleMaterialItemSelect),

  // Custódia nominal
  exact('saida::issue_select_saida',       handleIssueSaidaSelect),
  exact('saida::issue_select_participant', handleIssueParticipantSelect),
  exact('saida::issue_select_item',        handleIssueItemSelect),

  // Mark dead + wizard + stats
  prefix('saida::mark_dead::', handleMarkDeadSelect),
  prefix('saida::wz_select::', saidaWizard.handleSelectParticipant),
  exact ('saida::stats_pick',  saidaStats.handleStatsPick),

  // Weapon return — staff escolhe participante
  prefix('saida::weapon_confirm_pick::', saidaIndividual.handleWeaponConfirmPick),

  // Caracterizado self-serve — weapon pick (step 3 do fluxo)
  prefix('saida::weapon_pick::', saidaSession.handleCaracterizadoWeaponPick),
];

async function handleSelect(interaction) {
  const id = interaction.customId;
  const route = SELECT_ROUTES.find(r => r.match(id));
  if (!route) return;
  return route.handler(interaction);
}

module.exports = { handleSelect, SELECT_ROUTES };
