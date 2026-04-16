'use strict';
/**
 * Copy dos painéis — títulos, descrições e labels de botões.
 *
 * Cada painel: título curto (≤40 chars), descrição com blocos curtos,
 * labels de botão consistentes com `buttons.js`.
 *
 * Ver docs/UX_STYLE_GUIDE.md para regras de tom.
 */

const E = require('./emojis');
const { inlineSign } = require('./footers');

const PANELS = {
  ENTRADA: {
    TITLE: `${E.ENTRADA} Entrada — Firma RedWood`,
    DESCRIPTION:
      'Pede a tua tag aqui. A chefia vê o pedido e aprova se fores da casa.\n' +
      '\n' +
      '**O que acontece depois**\n' +
      `${E.TAG} tag aprovada → entras como Bairrista\n` +
      `${E.CASA} canal individual criado\n` +
      `${E.MATERIAL} registas material, kills, saídas\n` +
      `${E.TOPO} subes na hierarquia com movimento\n` +
      '\n' +
      `${inlineSign('SHORT')}`,
    BUTTON: {
      REGISTRAR: 'Pedir Tag',
    },
  },

  BAIRRISTA: {
    TITLE: `${E.CASA} Casa — Bairrista`,
    DESCRIPTION:
      'O que mexes aqui conta — para a semana, para a subida, para o topo.\n' +
      '\n' +
      `${E.MATERIAL} material que trazes · ${E.LUCRO} vendas · ${E.KILL} kills · ${E.TOPO} progresso`,
    BUTTONS: {
      ENTREGA:   'Registar Material',
      HISTORICO: 'Histórico',
      TOTAIS:    'Progresso',
      PERFORMANCE: 'Performance',
      MATERIAL:  'Meu Material',
      LUCRO:     'Meu Lucro',
      // Legacy aliases
      VENDA:     'Registar Material',
    },
  },
  get MORADOR() { return this.BAIRRISTA; }, // legacy alias

  OFICIAL: {
    TITLE: `${E.TAG} Secretaria — Oficial`,
    DESCRIPTION:
      'Registas, validas, consultas. Sem ruído.',
    BUTTONS: {
      VALIDAR:        'Validar Entrega',
      MEMBROS:        'Lista de Nomes',
      REGISTAR_VENDA: 'Registar Material',
    },
  },

  CHEFIA: {
    TITLE: `${E.LIDER} Centro de Comando`,
    DESCRIPTION:
      'Daqui puxa-se a rua. Saídas, stock, presença, rádio — tudo à mão.\n' +
      '\n' +
      `${E.SAIDA} **Saídas** — criar, fechar, participantes, material\n` +
      `${E.STOCK} **Stock** — ver, ajustar, fornecer, gerir materiais\n` +
      `${E.PRESENCA} **Gestão** — presença, rádio, stickys\n` +
      `${E.TOPO} **Dados** — topo, stats, logs\n` +
      '\n' +
      '_Tudo fica no audit log._',
    BUTTONS: {
      CRIAR_SAIDA:     'Saída Nova',
      FECHAR_SAIDA:    'Fechar Saída',
      VER_SAIDAS:      'Ver Saídas',
      PARTICIPANTES:   'Participantes',
      MATERIAL_SAIDA:  'Material da Saída',
      FORNECER:        'Fornecer a Nome',
      VER_STOCK:       'Ver Stock',
      AJUSTAR_STOCK:   'Ajustar Stock',
      GERIR_MATERIAIS: 'Gerir Materiais',
      DISPONIBILIDADE: 'Presença Hoje',
      RADIO:           'Painel Rádio',
      STICKYS:         'Stickys',
      TOPS:            'Topo',
      STATS:           'Estatísticas',
      LOGS:            'Logs',
    },
  },

  PATRAO_DI_ZONA: {
    TITLE: `${E.LIDER} Patrão di Zona`,
    DESCRIPTION:
      'Vês quem rende, quem some, quem precisa de puxão. A zona é tua.\n' +
      '\n' +
      `${E.PARTICIPANTE} lista · ${E.MATERIAL} entregas · ${E.LUCRO} vendas · ${E.TOPO} topo`,
    BUTTONS: {
      LISTAR:   'Listar Bairristas',
      ENTREGAS: 'Entregas da Zona',
      VENDAS:   'Vendas da Zona',
      TOPOS:    'Topo da Zona',
    },
  },
  get CHEFE_MORADORES() { return this.PATRAO_DI_ZONA; }, // legacy alias

  // Canal individual do bairrista (após onboarding) — painel premium
  BAIRRISTA_CHANNEL: {
    WELCOME_TITLE: `${E.BEMVINDO} Bem-vindo à casa`,
    WELCOME_DESCRIPTION: (name) =>
      `**${name}** — esta zona é tua.\n` +
      '\n' +
      'Regista o que trazes, consulta o teu peso, sobe na hierarquia.\n' +
      `${inlineSign('HOUSE')}`,
  },
};

module.exports = PANELS;
