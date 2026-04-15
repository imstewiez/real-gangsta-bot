'use strict';
/**
 * Copy do inventário — stock, ajustes, fornecimentos.
 */

const E = require('./emojis');

const INVENTORY = {
  TITLE: `${E.MATERIAL} Stock da Casa`,
  EMPTY: 'Sem material em casa.',

  CATALOG_TITLE: `${E.MATERIAL} Catálogo de Material`,

  LABELS: {
    ITEM: 'Item',
    BALANCE: 'Em casa',
    UNIT: 'Unidade',
    CATEGORY: 'Categoria',
    VALUE: 'Valor',
  },

  PROMPTS: {
    SET_STOCK: 'Ajustar quantidade de um item.',
    FORNECER: 'Fornecer material a um nome da firma.',
  },

  LOW_STOCK: (name, balance) =>
    `${E.WARN} **${name}** está em baixo: **${balance}**.`,
};

module.exports = INVENTORY;
