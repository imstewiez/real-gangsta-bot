'use strict';

const cartHandlers = require('./cartHandlers');
const stockHandlers = require('./stockHandlers');
const itemAdminHandlers = require('./itemAdminHandlers');
const deliveryHandlers = require('./deliveryHandlers');

module.exports = {
  // Cart / Bairrista flow
  handleRegistarMaterialButton: cartHandlers.handleRegistarMaterialButton,
  handleTipoRegistoSelect: cartHandlers.handleTipoRegistoSelect,
  handleCartAdd: cartHandlers.handleCartAdd,
  handleCartCategory: cartHandlers.handleCartCategory,
  handleCartItemPick: cartHandlers.handleCartItemPick,
  handleCartQtyModal: cartHandlers.handleCartQtyModal,
  handleCartLineAction: cartHandlers.handleCartLineAction,
  handleCartNotesButton: cartHandlers.handleCartNotesButton,
  handleCartNotesModal: cartHandlers.handleCartNotesModal,
  handleCartCancel: cartHandlers.handleCartCancel,
  handleCartRepeat: cartHandlers.handleCartRepeat,
  handleCartPreview: cartHandlers.handleCartPreview,
  handleCartPreviewBack: cartHandlers.handleCartPreviewBack,
  handleCartBack: cartHandlers.handleCartBack,
  handleCartSubmit: cartHandlers.handleCartSubmit,
  handleCartUndo: cartHandlers.handleCartUndo,

  // Stock management
  handleStockCommand: stockHandlers.handleStockCommand,
  handleAdjustStockButton: stockHandlers.handleAdjustStockButton,
  handleAdjustSelect: stockHandlers.handleAdjustSelect,
  handleAdjustModal: stockHandlers.handleAdjustModal,
  handleGerirMateriaisButton: stockHandlers.handleGerirMateriaisButton,
  handleGerirActionSelect: stockHandlers.handleGerirActionSelect,
  handleCategorySelect: stockHandlers.handleCategorySelect,
  handleEncomendasButton: stockHandlers.handleEncomendasButton,
  handleEncomendaSelect: stockHandlers.handleEncomendaSelect,
  handleEncomendaModeSelect: stockHandlers.handleEncomendaModeSelect,
  handleEncomendaModal: stockHandlers.handleEncomendaModal,

  // Item admin
  handleAddItemModal: itemAdminHandlers.handleAddItemModal,
  handleEditItemSelect: itemAdminHandlers.handleEditItemSelect,
  handleEditPriceModal: itemAdminHandlers.handleEditPriceModal,
  handleDeactivateItemSelect: itemAdminHandlers.handleDeactivateItemSelect,
  handleReactivateItemSelect: itemAdminHandlers.handleReactivateItemSelect,

  // Delivery approval
  handleDeliveryApproverSelect: deliveryHandlers.handleDeliveryApproverSelect,
  handleDeliveryDecision: deliveryHandlers.handleDeliveryDecision,

  // Shared state
  pendingItemSelections: stockHandlers.pendingItemSelections,
};
