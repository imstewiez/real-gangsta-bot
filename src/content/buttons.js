'use strict';

const STYLE = { SUCCESS: 'Success', PRIMARY: 'Primary', SECONDARY: 'Secondary', DANGER: 'Danger' };

const BUTTONS = {
  ENTRADA: {
    PEDIR_BAIRRISTA: { label: 'Pedido: Tag Bairrista', emoji: '💜', style: STYLE.SUCCESS },
    PEDIR_TROPINHA: { label: 'Pedido: Tag Tropinha', emoji: '🟣', style: STYLE.PRIMARY },
    PEDIR_TAG: { label: 'Pedido: Tag Bairrista', emoji: '💜', style: STYLE.SUCCESS },
    MEU_PEDIDO: { label: 'Estado do pedido', emoji: '🔎', style: STYLE.SECONDARY },
  },
  ONBOARDING: {
    APROVAR: { label: 'Aprovar', emoji: '✅', style: STYLE.SUCCESS },
    NEGAR: { label: 'Recusar', emoji: '✖️', style: STYLE.DANGER },
  },
  BAIRRISTA: {},
  PATRAO: {},
  OFICIAL: {},
  CHEFIA: {},
  INVENTORY: {},
  SAIDAS: {},
  RADIO: {},
};

module.exports = { BUTTONS, STYLE };
