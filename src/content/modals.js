'use strict';

const E = require('./emojis');

const MODALS = {
  TAG_REQUEST: {
    TITLE: 'Pedido de Tag',
    FIELDS: {
      full_name: {
        label: 'Nome in-game',
        placeholder: 'Ex: João Silva',
        maxLength: 60,
        required: true,
      },
      nickname: {
        label: 'Alcunha / nome curto',
        placeholder: 'Ex: Silva',
        maxLength: 30,
        required: true,
      },
    },
  },

  KILL_REGISTER: {
    TITLE: `${E.KILL} Registar ocorrência`,
    FIELDS: {
      victim: { label: 'Nome / referência', placeholder: 'Ex: nome e grupo', maxLength: 80, required: true },
      spot: { label: 'Local', placeholder: 'Ex: zona ou referência', maxLength: 60, required: false },
      context: { label: 'Contexto', placeholder: 'Notas relevantes', maxLength: 200, required: false },
    },
  },

  INVENTORY_QUANTITY: {
    TITLE: itemName => `Registar ${itemName}`,
    FIELDS: {
      quantity: { label: () => 'Quantidade', placeholder: 'Ex: 10', maxLength: 10, required: true },
      notes: { label: 'Observações', placeholder: 'Notas opcionais', maxLength: 500, required: false },
    },
  },

  INVENTORY_ADJUST: {
    TITLE: 'Ajustar registo',
    FIELDS: {
      delta: { label: 'Valor', placeholder: 'Ex: -5 ou +20', maxLength: 10, required: true },
      reason: { label: 'Motivo', placeholder: 'Ex: correção', maxLength: 120, required: true },
    },
  },

  INVENTORY_ADD_ITEM: {
    TITLE: 'Novo item',
    FIELDS: {
      name: { label: 'Nome', placeholder: 'Ex: item', maxLength: 60, required: true },
      category: { label: 'Categoria', placeholder: 'categoria', maxLength: 30, required: true },
      unit: { label: 'Unidade', placeholder: 'unidade', maxLength: 20, required: false },
      value: { label: 'Valor', placeholder: 'Ex: 25000', maxLength: 10, required: false },
    },
  },

  INVENTORY_EDIT_PRICE: {
    TITLE: itemName => `Preço — ${itemName}`,
    FIELDS: {
      price: { label: 'Novo preço', placeholder: 'Ex: 30000', maxLength: 10, required: true },
    },
  },

  SAIDA_CREATE: {
    TITLE: `${E.SAIDA} Nova ação`,
    FIELDS: {
      date: { label: 'Data', placeholder: 'Ex: 2026-04-16', maxLength: 10, required: true },
      time: { label: 'Hora', placeholder: 'Ex: 21:30', maxLength: 5, required: true },
      spot: { label: 'Local', placeholder: 'Ex: local', maxLength: 60, required: true },
      type: { label: 'Tipo', placeholder: 'tipo de ação', maxLength: 20, required: true },
      notes: { label: 'Notas', placeholder: 'Contexto ou observações', maxLength: 500, required: false },
    },
  },

  SAIDA_SETTLE: {
    TITLE: id => `${E.FECHAR} Fechar ação #${id}`,
    FIELDS: {
      result: { label: 'Resultado', placeholder: 'resultado', maxLength: 20, required: true },
      enemy: { label: 'Referência externa', placeholder: 'opcional', maxLength: 80, required: false },
      crafted: { label: 'Quantidade', placeholder: 'Ex: 50', maxLength: 12, required: false },
      kills: { label: 'Total', placeholder: 'Ex: 4', maxLength: 5, required: false },
      notes: { label: 'Notas', placeholder: 'Observações', maxLength: 500, required: false },
    },
  },

  SAIDA_MATERIAL: {
    TITLE: what => `Registo · ${what}`,
    FIELDS: {
      qty: { label: 'Quantidade', placeholder: 'Ex: 10', maxLength: 6, required: true },
      notes: { label: 'Notas', placeholder: '', maxLength: 200, required: false },
    },
  },

  ENCOMENDA: {
    TITLE: `${E.FORNECER} Pedido interno`,
    FIELDS: {
      item: { label: 'Item', placeholder: 'Nome do item', maxLength: 60, required: true },
      quantity: { label: 'Quantidade', placeholder: 'Ex: 5', maxLength: 6, required: true },
      notes: { label: 'Notas', placeholder: 'Informação adicional', maxLength: 200, required: false },
    },
  },

  RADIO_SET: {
    TITLE: label => `${E.RADIO} ${label}`,
    FIELDS: {
      value: {
        label: label => `Valor (${label.toLowerCase()})`,
        placeholder: 'Ex: 1234',
        maxLength: 10,
        required: true,
      },
    },
  },
};

module.exports = MODALS;
