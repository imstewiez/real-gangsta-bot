'use strict';
/**
 * Copy dos painéis — títulos, descrições e labels.
 *
 * Regras:
 *   - Títulos curtos, descritivos, com emoji.
 *   - Descrições explicam o propósito numa frase.
 *   - Sem copy aforística excessiva — os painéis são ferramentas, não poesia.
 *   - Estados vazios tratados nos builders, não aqui.
 */

const E = require('./emojis');

const PANELS = {
  ENTRADA: {
    TITLE: `${E.SANGUE} O Portão`,
    DESCRIPTION:
      'Bem-vindo à Firma RedWood. Aqui começa o teu percurso — lê as regras, pede a tua tag e mostra o que vales.',
    BUTTON: { REGISTRAR: 'Dar a Cara' },
  },

  BAIRRISTA: {
    TITLE: `${E.CASA} Painel do Bairrista`,
    DESCRIPTION: 'Atividade semanal da Firma RedWood — quem puxa, quem rende.',
    BUTTONS: {
      ENTREGA: 'Entregar Material',
      VENDA: 'Vender',
      ENCOMENDAR: 'Encomendar',
      RANKING: 'Ranking',
      TOPO: 'Topo Semanal',
      RESUMO: 'Meu Resumo',
    },
  },

  OFICIAL: {
    TITLE: `${E.VITORIA} Painel do Oficial`,
    DESCRIPTION: 'Operações, movimento e atividade semanal da Firma RedWood.',
    BUTTONS: {
      CRIAR_SAIDA: 'Abrir Saída',
      ENTREGA: 'Registar Material',
      VENDA: 'Vender',
      PRECARIOS: 'Preçários',
      ENCOMENDAR: 'Encomendar',
      TOPO: 'Topo Semanal',
      RESUMO: 'Meu Resumo',
    },
  },

  CHEFIA: {
    TITLE: `${E.LIDER} Painel da Chefia`,
    DESCRIPTION: 'Visão geral da Firma RedWood — operações, membros, stock e movimento.',
    BUTTONS: {
      CRIAR_SAIDA: 'Abrir Saída',
      GERIR_ENCOMENDAS: 'Gerir Encomendas',
      PENDENCIAS: 'Pendências',
      RELATORIO: 'Relatório',
      STOCK: 'Stock',
      AJUSTAR_STOCK: 'Ajustar Stock',
      GERIR_MATERIAIS: 'Gerir Materiais',
      REPUBLICAR: 'Republicar Painéis',
    },
  },

  PATRAO_DI_ZONA: {
    TITLE: `${E.LIDER} Painel do Patrão di Zona`,
    DESCRIPTION: 'Visão do bairro — quem puxa, quem some, quem precisa de atenção.',
    BUTTONS: {
      LISTAR: 'Listar Bairristas',
      ENTREGAS: 'Ver Entregas',
      VENDAS: 'Ver Vendas',
      TOPOS: 'Top da Zona',
    },
  },

  BAIRRISTA_CHANNEL: {
    WELCOME_TITLE: `${E.SANGUE} Esta Zona é Tua`,
    WELCOME_DESCRIPTION: name =>
      `Bem-vindo, **${name}**.\n` +
      'Este canal é teu — aqui produzes, aqui o bairro vê-te trabalhar.\n' +
      '**Regista o que trazes. Consulta o teu peso. Sobe.**',
  },
};

module.exports = PANELS;
