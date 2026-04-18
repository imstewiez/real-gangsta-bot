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
    ENTREGA_OU_VENDA: 'Queres **entregar** ou **vender** material ao grupo?',
    QUE_MATERIAL_ENTREGA: 'Que material queres **entregar**?',
    QUE_MATERIAL_VENDA: 'Que material queres **vender**? O valor é calculado automaticamente.',
    QUE_ITEM_AJUSTAR: 'Que item queres ajustar?',
    QUE_ITEM_ENCOMENDAR: 'Que material queres encomendar?',
    // Prompt partilhado: cadeia select-categoria → select-item.
    CATEGORY_ITEM: category => `Categoria: **${category}** — escolhe o item:`,
  },

  SELECTS: {
    TIPO_REGISTO: 'Entrega ou Venda?',
    MATERIAL: 'Escolhe o material',
    MATERIAL_AJUSTE: 'Escolhe o item para ajustar',
    GERIR_ACTION: 'O que queres fazer?',
    MATERIAL_DESATIVAR: 'Escolhe o material a desativar',
    MATERIAL_REATIVAR: 'Escolhe o material a reativar',
  },

  LOW_STOCK: (name, balance) => `${E.WARN} **${name}** está em baixo: **${balance}**.`,
};

module.exports = INVENTORY;
