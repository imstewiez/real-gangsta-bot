'use strict';
/**
 * Copy dos painéis — títulos, descrições e labels.
 *
 * Tom: firme, bairro, com peso. Sem cringe, sem ERP, sem corporate.
 * Cada painel tem personalidade distinta mas coerente com a firma.
 *
 * Regras:
 *   - 1 emoji por título (máximo)
 *   - descrição ≤ 6 linhas úteis
 *   - linguagem concreta ("puxas a rua") > genérica ("gerir operações")
 *   - emojis distintos por secção (ver emojis.js)
 *
 * Ver docs/UX_STYLE_GUIDE.md.
 */

const E = require('./emojis');
const { inlineSign } = require('./footers');

const PANELS = {
  // ═══════════════════════════════════════════════════════════════════════
  // ENTRADA — quem acabou de chegar
  // ═══════════════════════════════════════════════════════════════════════
  ENTRADA: {
    TITLE: `${E.ENTRADA} Entrada — Firma RedWood`,
    DESCRIPTION:
      'A **Firma RedWood** não se entra pela porta da frente. Entra-se a provar.\n' +
      '\n' +
      `${E.TAG} **Pede a tua tag** — a chefia vê quem és\n` +
      `${E.BEMVINDO} Aprovado → entras como **Young Blood**\n` +
      `${E.CASA} Recebes canal próprio no guetto\n` +
      `${E.MATERIAL} Material que trazes conta para o teu peso\n` +
      `${E.PROGRESSO} Sobes de tier pelo que mexes, não pelo que falas\n` +
      '\n' +
      `${inlineSign('SHORT')}`,
    BUTTON: {
      REGISTRAR: 'Pedir Tag',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // BAIRRISTA — a casa, o movimento
  // ═══════════════════════════════════════════════════════════════════════
  BAIRRISTA: {
    TITLE: `${E.CASA} Casa — Bairrista`,
    DESCRIPTION:
      'Aqui conta o que **trazes**. Não as palavras.\n' +
      '\n' +
      `${E.ENTREGA} **Registar** — entrega ou vende material\n` +
      `${E.FIRMA} **Movimento no Bairro** — o teu peso em tempo real\n` +
      `${E.MEDAL_1} **Ranking** — quem rende mais na semana\n` +
      `${E.ENCOMENDA} **Encomendas** — o que pediste à firma\n` +
      '\n' +
      `${inlineSign('HOUSE')}`,
    BUTTONS: {
      ENTREGA:   'Registar Material',
      MOVIMENTO: 'Movimento no Bairro',
      RANKING:   'Ranking',
      ENCOMENDAS:'Encomendas',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // OFICIAL — secretaria + saídas
  // ═══════════════════════════════════════════════════════════════════════
  OFICIAL: {
    TITLE: `${E.AUDIT} Secretaria — Oficial`,
    DESCRIPTION:
      'Controlo da rua. Saídas abrem-se, material regista-se, nomes acompanham-se.\n' +
      '\n' +
      `${E.SAIDA} **Nova Sessão** — só OG para cima abre\n` +
      `${E.VER} **Ver Saídas** — abertas e recentes\n` +
      `${E.ENTREGA} **Registar Material** — entrega ou venda\n` +
      `${E.HISTORICO} **Histórico** — rasto de quem mexeu\n` +
      '\n' +
      `${inlineSign('MOVEMENT')}`,
    BUTTONS: {
      VALIDAR:        'Validar Entrega',
      MEMBROS:        'Lista de Nomes',
      REGISTAR_VENDA: 'Registar Material',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CHEFIA — centro de comando
  // ═══════════════════════════════════════════════════════════════════════
  CHEFIA: {
    TITLE: `${E.LIDER} Centro de Comando`,
    DESCRIPTION:
      'Daqui puxa-se a rua. Daqui fecha-se a rua.\n' +
      '\n' +
      `${E.SAIDA} **Sessões** — abrir novas, ver activas\n` +
      `${E.STOCK} **Stock** — ver, ajustar, gerir materiais\n` +
      `${E.RADIO} **Gestão** — rádio, stickys\n` +
      `${E.TOPO} **Dados** — topo semanal, logs de auditoria\n` +
      '\n' +
      '_Tudo fica em audit log. Nada se perde._',
    BUTTONS: {
      CRIAR_SAIDA:     'Nova Sessão',
      VER_SAIDAS:      'Sessões Activas',
      VER_STOCK:       'Ver Stock',
      AJUSTAR_STOCK:   'Ajustar Stock',
      GERIR_MATERIAIS: 'Gerir Materiais',
      RADIO:           'Painel Rádio',
      STICKYS:         'Stickys',
      TOPS:            'Topo',
      LOGS:            'Logs',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PATRÃO DI ZONA — mando do bairro
  // ═══════════════════════════════════════════════════════════════════════
  PATRAO_DI_ZONA: {
    TITLE: `${E.BAIRRO} Patrão di Zona`,
    DESCRIPTION:
      'A zona é tua. Vês quem rende. Vês quem some. Vês quem precisa de puxão.\n' +
      '\n' +
      `${E.PARTICIPANTE} **Listar** — bairristas activos\n` +
      `${E.ENTREGA} **Entregas** — quem traz mais material\n` +
      `${E.VENDA} **Vendas** — quem roda mais\n` +
      `${E.TOPO} **Topo** — os que puxam a zona`,
    BUTTONS: {
      LISTAR:   'Listar Bairristas',
      ENTREGAS: 'Entregas da Zona',
      VENDAS:   'Vendas da Zona',
      TOPOS:    'Topo da Zona',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Canal individual do bairrista (welcome após onboarding)
  // ═══════════════════════════════════════════════════════════════════════
  BAIRRISTA_CHANNEL: {
    WELCOME_TITLE: `${E.BEMVINDO} Bem-vindo à casa`,
    WELCOME_DESCRIPTION: (name) =>
      `**${name}** — esta zona é tua.\n` +
      '\n' +
      'Regista o que trazes. Consulta o teu movimento. Sobe na hierarquia.\n' +
      'O bairro vê tudo — faz valer.\n' +
      `${inlineSign('HOUSE')}`,
  },
};

module.exports = PANELS;
