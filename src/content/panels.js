'use strict';

const E = require('./emojis');

const PANELS = {
  ENTRADA: {
    TITLE: `${E.TAG} Pedidos de Acesso`,
    DESCRIPTION:
      'Escolhe o tipo de pedido que queres abrir. A equipa responsável analisa e responde assim que possível.',
    BUTTON: { REGISTRAR: 'Pedido: Tag Bairrista' },
  },

  BAIRRISTA: {
    TITLE: `${E.CASA} Painel de Membro`,
    DESCRIPTION: 'Painel operacional da Ballas Gang.',
    BUTTONS: {},
  },

  OFICIAL: {
    TITLE: `${E.VITORIA} Painel de Gestão`,
    DESCRIPTION: 'Gestão interna da Ballas Gang.',
    BUTTONS: {},
  },

  CHEFIA: {
    TITLE: `${E.LIDER} Painel de Administração`,
    DESCRIPTION: 'Visão geral da Ballas Gang.',
    BUTTONS: {},
  },

  PATRAO_DI_ZONA: {
    TITLE: `${E.LIDER} Painel de Supervisão`,
    DESCRIPTION: 'Acompanhamento de membros e pedidos.',
    BUTTONS: {},
  },

  BAIRRISTA_CHANNEL: {
    WELCOME_TITLE: `${E.TAG} Canal de Membro`,
    WELCOME_DESCRIPTION: name =>
      `Bem-vindo, **${name}**.\n` +
      'Este canal fica reservado para acompanhamento interno e notas de gestão.',
  },
};

module.exports = PANELS;
