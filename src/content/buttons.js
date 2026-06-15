'use strict';

const E = require('./emojis');
const STYLE = { SUCCESS: 'Success', PRIMARY: 'Primary', SECONDARY: 'Secondary', DANGER: 'Danger' };

const BUTTONS = {
  ENTRADA: {
    PEDIR_TAG: { label: 'Pedir acesso', emoji: E.TAG, style: STYLE.SUCCESS },
    MEU_PEDIDO: { label: 'Ver o meu pedido', emoji: '🔎', style: STYLE.SECONDARY },
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
