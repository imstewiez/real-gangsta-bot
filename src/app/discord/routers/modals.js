'use strict';
/**
 * Modal submit router — rotas em array, match por exact ou prefix.
 */

const { handleTagModal } = require('../../../onboarding/onboardingHandlers');
const {
  handleQuantityModal, handleAdjustModal,
  handleAddItemModal, handleEditPriceModal, handleEncomendaModal,
} = require('../../../inventory/inventoryHandlers');
const {
  handleCreateSaidaModal, handleCloseSaidaModal,
  handleMaterialQtyModal, handleIssueQtyModal,
} = require('../../../saidas/saidaHandlers');
const saidaWizard  = require('../../../saidas/saidaSettlementWizard');
const saidaSession = require('../../../saidas/saidaSession');
const { handleKillModal } = require('../../../kills/killHandlers');
const { handleSetModal: radioHandleSetModal } = require('../../../radio/radioHandlers');

const exact  = (id, handler) => ({ match: (x) => x === id, handler });
const prefix = (p, handler)  => ({ match: (x) => x.startsWith(p), handler });

const MODAL_ROUTES = [
  // Onboarding
  exact('onboard::modal_tag', handleTagModal),

  // Inventory
  exact('inv::modal_entrega_bairrista', handleQuantityModal),
  exact('inv::modal_venda_bairrista',   handleQuantityModal),
  exact('inv::modal_entrega_morador',   handleQuantityModal),
  exact('inv::modal_venda_morador',     handleQuantityModal),
  exact('inv::modal_ajuste_manual',     handleAdjustModal),
  exact('inv::modal_add_item',          handleAddItemModal),
  exact('inv::modal_edit_price',        handleEditPriceModal),
  exact('inv::modal_encomenda',         handleEncomendaModal),

  // Saída
  exact('saida::modal_create',       handleCreateSaidaModal),
  exact('op::modal_create',          handleCreateSaidaModal),
  exact('saida::modal_close',        handleCloseSaidaModal),
  exact('op::modal_close',           handleCloseSaidaModal),
  exact('saida::modal_material_qty', handleMaterialQtyModal),
  exact('op::modal_material_qty',    handleMaterialQtyModal),
  exact('saida::issue_modal_qty',    handleIssueQtyModal),
  exact('op::issue_modal_qty',       handleIssueQtyModal),
  prefix('saida::wz_modal::',             saidaWizard.handleSettleModal),
  prefix('saida::session_weapon_modal::', saidaSession.handleRegistrationModal),

  // Kill
  exact('kill::modal',           handleKillModal),
  exact('cemetery::modal_kill',  handleKillModal),

  // Radio
  prefix('radio::modal_set::', radioHandleSetModal),
];

async function handleModal(interaction) {
  const id = interaction.customId;
  const route = MODAL_ROUTES.find(r => r.match(id));
  if (!route) return;
  return route.handler(interaction);
}

module.exports = { handleModal, MODAL_ROUTES };
