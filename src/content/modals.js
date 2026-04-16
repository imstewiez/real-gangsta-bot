'use strict';
/**
 * Copy canónica de modais — títulos, field labels, placeholders.
 *
 * Cada modal define:
 *   TITLE       — ≤ 45 chars, contexto claro
 *   FIELDS[id]  — { label, placeholder, maxLength?, required? }
 *
 * CustomIds dos modais ficam nos handlers para preservar compat com modais
 * já abertos (Discord não aceita mudança de customId após abrir).
 */

const E = require('./emojis');

const MODALS = {
  // ── Onboarding ────────────────────────────────────────────────────────
  TAG_REQUEST: {
    TITLE: 'Pedir Tag — Firma RedWood',
    FIELDS: {
      full_name: {
        label:       'Nome in-game (primeiro e último)',
        placeholder: 'Ex: Chico Navalhas',
        maxLength:   60,
        required:    true,
      },
      nickname: {
        label:       'Alcunha / como te tratam',
        placeholder: 'Ex: Chico',
        maxLength:   30,
        required:    true,
      },
    },
  },

  // ── Kill ──────────────────────────────────────────────────────────────
  KILL_REGISTER: {
    TITLE: `${E.KILL} Registar Kill`,
    FIELDS: {
      victim: {
        label:       'Vítima (nome · facção)',
        placeholder: 'Ex: Chico Navalhas · Los Vagos',
        maxLength:   80,
        required:    true,
      },
      spot: {
        label:       'Spot (onde aconteceu)',
        placeholder: 'Ex: Motel, Grove, Sandy PD...',
        maxLength:   60,
        required:    false,
      },
      context: {
        label:       'Contexto (opcional)',
        placeholder: 'Ex: guerra Vagos, retaliação, atropelamento',
        maxLength:   200,
        required:    false,
      },
    },
  },

  // ── Inventário — entrega/venda ────────────────────────────────────────
  INVENTORY_QUANTITY: {
    TITLE: (itemName, isVenda) => (isVenda ? `Vender ${itemName}` : `Entregar ${itemName}`),
    FIELDS: {
      quantity: {
        label:       (price) => `Quantidade${price ? ` (${price}€ cada)` : ''}`,
        placeholder: 'Ex: 10',
        maxLength:   10,
        required:    true,
      },
      notes: {
        label:       'Observações (opcional)',
        placeholder: 'Ex: faltavam 2, outras notas...',
        maxLength:   500,
        required:    false,
      },
    },
  },

  // ── Inventário — ajuste manual ────────────────────────────────────────
  INVENTORY_ADJUST: {
    TITLE: 'Ajustar Stock',
    FIELDS: {
      delta: {
        label:       'Delta (positivo ou negativo)',
        placeholder: 'Ex: -5 ou +20',
        maxLength:   10,
        required:    true,
      },
      reason: {
        label:       'Motivo (curto)',
        placeholder: 'Ex: contagem, correcção, compra',
        maxLength:   120,
        required:    true,
      },
    },
  },

  // ── Inventário — novo item ────────────────────────────────────────────
  INVENTORY_ADD_ITEM: {
    TITLE: 'Novo Item',
    FIELDS: {
      name:     { label: 'Nome',                placeholder: 'Ex: AK-47',          maxLength: 60, required: true },
      category: { label: 'Categoria',           placeholder: 'armas / droga / …',  maxLength: 30, required: true },
      unit:     { label: 'Unidade',             placeholder: 'unidade / caixa',    maxLength: 20, required: false },
      value:    { label: 'Valor estimado (€)',  placeholder: 'Ex: 25000',          maxLength: 10, required: false },
    },
  },

  // ── Inventário — editar preço ─────────────────────────────────────────
  INVENTORY_EDIT_PRICE: {
    TITLE: (itemName) => `Preço — ${itemName}`,
    FIELDS: {
      price: {
        label:       'Novo preço (€)',
        placeholder: 'Ex: 30000',
        maxLength:   10,
        required:    true,
      },
    },
  },

  // ── Saída — criar ─────────────────────────────────────────────────────
  SAIDA_CREATE: {
    TITLE: `${E.SAIDA} Nova Saída`,
    FIELDS: {
      date: {
        label:       'Data (YYYY-MM-DD)',
        placeholder: 'Ex: 2026-04-16',
        maxLength:   10,
        required:    true,
      },
      time: {
        label:       'Hora (HH:MM)',
        placeholder: 'Ex: 21:30',
        maxLength:   5,
        required:    true,
      },
      spot: {
        label:       'Spot',
        placeholder: 'Ex: Grove, Motel, Sandy',
        maxLength:   60,
        required:    true,
      },
      type: {
        label:       'Tipo',
        placeholder: 'craft · domínio · ataque · defesa · recolha',
        maxLength:   20,
        required:    true,
      },
      notes: {
        label:       'Notas (opcional)',
        placeholder: 'Contexto, objectivos, lineup...',
        maxLength:   500,
        required:    false,
      },
    },
  },

  // ── Saída — fechar resultado ──────────────────────────────────────────
  SAIDA_SETTLE: {
    TITLE: (id) => `${E.FECHAR} Fechar Saída #${id}`,
    FIELDS: {
      result: {
        label:       'Resultado',
        placeholder: 'win · loss · draw · sem_conflito',
        maxLength:   20,
        required:    true,
      },
      enemy: {
        label:       'Inimigo · facção (opcional)',
        placeholder: 'Ex: Los Vagos',
        maxLength:   80,
        required:    false,
      },
      crafted: {
        label:       'Valor craftado (€)',
        placeholder: 'Ex: 150000',
        maxLength:   12,
        required:    false,
      },
      kills: {
        label:       'Kills da firma (total)',
        placeholder: 'Ex: 4',
        maxLength:   5,
        required:    false,
      },
      notes: {
        label:       'Notas (opcional)',
        placeholder: 'Ex: perdemos 2, material intacto',
        maxLength:   500,
        required:    false,
      },
    },
  },

  // ── Saída — material por participante ─────────────────────────────────
  SAIDA_MATERIAL: {
    TITLE: (what) => `Material · ${what}`,
    FIELDS: {
      qty: {
        label:       'Quantidade',
        placeholder: 'Ex: 10',
        maxLength:   6,
        required:    true,
      },
      notes: {
        label:       'Notas (opcional)',
        placeholder: '',
        maxLength:   200,
        required:    false,
      },
    },
  },

  // ── Encomenda (bairrista para oficial) ────────────────────────────────
  ENCOMENDA: {
    TITLE: `${E.FORNECER} Encomendar Material`,
    FIELDS: {
      item: {
        label:       'Item (nome)',
        placeholder: 'Ex: AK-47, Heroína, Colete',
        maxLength:   60,
        required:    true,
      },
      quantity: {
        label:       'Quantidade',
        placeholder: 'Ex: 5',
        maxLength:   6,
        required:    true,
      },
      notes: {
        label:       'Porquê / para quando',
        placeholder: 'Ex: saída de hoje, stock pessoal',
        maxLength:   200,
        required:    false,
      },
    },
  },

  // ── Rádio ─────────────────────────────────────────────────────────────
  RADIO_SET: {
    TITLE: (label) => `${E.RADIO} Rádio ${label}`,
    FIELDS: {
      value: {
        label:       (label) => `Valor (${label.toLowerCase()})`,
        placeholder: 'Ex: 1234',
        maxLength:   10,
        required:    true,
      },
    },
  },
};

module.exports = MODALS;
