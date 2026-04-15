'use strict';
/**
 * Copy de onboarding — canal boas-vindas, entrada, tag.
 */

const E = require('./emojis');
const { inlineSign } = require('./footers');

const ONBOARDING = {
  WELCOME_TITLE: (name) => `${E.FIRMA} Bem-vindo ao bairro, ${name}`,
  WELCOME_BODY:
    'Este canal é só teu. Daqui saem as tuas entregas e vendas.\n' +
    '\n' +
    `${E.MATERIAL} **Entregas** — material que trazes pra casa\n` +
    `${E.LUCRO} **Vendas** — o que é despachado na rua\n` +
    `${E.AUDIT} **Histórico** — o teu rasto no guetto\n` +
    `${E.TOPO} **Totais** — quanto já cresceste\n` +
    '\n' +
    '_Faz por merecer. Cada entrega conta pro próximo peso._',

  ENTRADA_TITLE: `${E.ENTRADA} Entrada`,
  ENTRADA_BODY:
    'Novo aqui? Carrega abaixo. Alguém da firma vai ler o teu nome antes de abrir porta.\n' +
    '\n' +
    `${inlineSign('SHORT')}`,

  TAG_ASSIGNED: (tier) => `${E.TAG} Tag atribuída: **${tier}**.`,
  TAG_REMOVED: `${E.TAG} Tag removida.`,

  PROMOTION: (from, to) => `${E.LIDER} Subida: **${from}** → **${to}**.`,
  DEMOTION: (from, to) => `${E.WARN} Descida: **${from}** → **${to}**.`,

  FAREWELL: (name) => `${E.BEMVINDO} ${name} sai da casa. Que corra bem na rua.`,
};

module.exports = ONBOARDING;
