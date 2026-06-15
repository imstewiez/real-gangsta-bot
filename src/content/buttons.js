'use strict';

const E = require('./emojis');
const STYLE = { SUCCESS: 'Success', PRIMARY: 'Primary', SECONDARY: 'Secondary', DANGER: 'Danger' };

const BUTTONS = {
  ENTRADA: {
    PEDIR_BAIRRISTA: { label: 'Pedido: Tag Bairrista', emoji: E.TAG, style: STYLE.SUCCESS },
    PEDIR_TROPINHA: { label: 'Pedido: Tag Tropinha', emoji: E.PARTICIPANTE, style: STYLE.PRIMARY },
    MEU_PEDIDO: { label: 'Estado do pedido', emoji: '🔎', style: STYLE.SECONDARY },
  },
  ONBOARDING: {
    APROVAR: { label: 'Aprovar', emoji: E.OK, style: STYLE.SUCCESS },
    NEGAR: { label: 'Recusar', emoji: E.ERRO, style: STYLE.DANGER },
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
