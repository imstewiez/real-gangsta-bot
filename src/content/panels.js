'use strict';
/**
 * Copy dos painéis — títulos, descrições e labels de botões.
 *
 * Um painel por chave. Cada um com título curto, descrição firme,
 * e labels de botão de ≤20 caracteres. Mantém consistência com a
 * voz da casa (ver voice.js).
 */

const E = require('./emojis');
const { inlineSign } = require('./footers');

const PANELS = {
  ENTRADA: {
    TITLE: `${E.ENTRADA} Entrada`,
    DESCRIPTION:
      'Novo na rua? Regista-te aqui. A firma vai ler o teu nome antes de abrir porta.\n' +
      '\n' +
      `${inlineSign('SHORT')}`,
    BUTTON: {
      REGISTRAR: 'Registar-me',
    },
  },

  BAIRRISTA: {
    TITLE: `${E.CASA} Casa — Bairrista`,
    DESCRIPTION:
      'Esta é a tua casa. Cada entrega, cada venda, cada movimento — fica aqui.\n' +
      '\n' +
      '📦 Entregas · 💰 Vendas · 📋 Histórico · 📊 Totais',
    BUTTONS: {
      ENTREGA: 'Registar Entrega',
      VENDA: 'Registar Venda',
      HISTORICO: 'Histórico',
      TOTAIS: 'Ver Totais',
    },
  },
  // Legacy alias — código antigo ainda importa PANELS.MORADOR
  get MORADOR() { return this.BAIRRISTA; },

  OFICIAL: {
    TITLE: `${E.TAG} Oficial — Secretaria`,
    DESCRIPTION:
      'Controlo de entregas, vendas e membros. Só o que é preciso — nem mais.',
    BUTTONS: {
      VALIDAR: 'Validar Entrega',
      MEMBROS: 'Lista Membros',
      REGISTAR_VENDA: 'Registar Venda',
    },
  },

  CHEFIA: {
    TITLE: `${E.LIDER} Centro de Comando`,
    DESCRIPTION:
      'Daqui manda-se a rua. Saídas, material, rádio, presença — tudo à mão.\n' +
      '\n' +
      `${E.SAIDA} Saídas · ${E.MATERIAL} Material · ${E.RADIO} Rádio · ${E.PRESENCA} Presença · ${E.STICKY} Stickys\n` +
      '\n' +
      '_Tudo fica no audit log. Sem surpresas._',
    BUTTONS: {
      CRIAR_SAIDA: 'Criar Saída',
      FECHAR_SAIDA: 'Fechar Saída',
      VER_SAIDAS: 'Ver Saídas',
      PARTICIPANTES: 'Participantes',
      MATERIAL_SAIDA: 'Material Saída',
      FORNECER: 'Fornecer a Nome',
      VER_STOCK: 'Ver Stock',
      AJUSTAR_STOCK: 'Ajustar Stock',
      GERIR_MATERIAIS: 'Gerir Materiais',
      DISPONIBILIDADE: 'Presença Hoje',
      RADIO: 'Painel Rádio',
      STICKYS: 'Stickys',
      TOPS: 'Ver Topo',
      STATS: 'Estatísticas',
      LOGS: 'Ver Logs',
    },
  },

  PATRAO_DI_ZONA: {
    TITLE: `${E.LIDER} Patrão di Zona`,
    DESCRIPTION:
      'Tu és o elo entre os bairristas e a chefia. Aqui vês quem rende, quem some, e quem precisa de puxão.',
  },
  get CHEFE_MORADORES() { return this.PATRAO_DI_ZONA; }, // legacy alias
};

module.exports = PANELS;
