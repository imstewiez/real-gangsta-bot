'use strict';
/**
 * Copy de onboarding — tag, canal individual, promoções.
 */

const E = require('./emojis');
const { inlineSign } = require('./footers');

const ONBOARDING = {
  // Canal individual de bairrista — welcome embed
  WELCOME_TITLE: name => `${E.BEMVINDO} Bem-vindo ao bairro, ${name}`,
  WELCOME_BODY:
    'Este canal é só teu. Aqui registas tudo o que mexes.\n' +
    '\n' +
    `${E.MATERIAL} **Material** — o que trazes pra casa\n` +
    `${E.LUCRO} **Vendas** — o que despachas na rua\n` +
    `${E.AUDIT} **Histórico** — o teu rasto\n` +
    `${E.TOPO} **Progresso** — quanto já cresceste\n` +
    '\n' +
    '_Cada entrega conta pro próximo peso. Faz por merecer._',

  // Painel de entrada (canal #entradas)
  ENTRADA_TITLE: `${E.ENTRADA} Entrada — Firma RedWood`,
  ENTRADA_BODY:
    'Novo aqui? Pede a tua tag. A chefia vai ler o teu nome antes de abrir porta.\n' + '\n' + `${inlineSign('SHORT')}`,

  // Pedido de tag (canal de staff)
  TAG_PENDING_TITLE: `${E.TAG} Novo pedido de tag`,
  TAG_PENDING_BODY: (name, nickname, discordId) => `**${name}** *(${nickname})* · <@${discordId}>\nDecide abaixo.`,

  TAG_APPROVED_TITLE: `${E.TAG} Tag Aprovada`,
  TAG_APPROVED_BODY: (mention, nickname, channelMention) =>
    `${mention} *(${nickname})* entrou como Bairrista.` + (channelMention ? `\nCanal: ${channelMention}` : ''),

  TAG_DENIED_TITLE: `${E.ERRO} Tag Negada`,
  TAG_DENIED_BODY: (name, reason) => `**${name}**${reason ? ` — ${reason}` : ''}`,

  // Estados
  TAG_ASSIGNED: tier => `${E.TAG} Tag atribuída: **${tier}**.`,
  TAG_REMOVED: `${E.TAG} Tag removida.`,
  ALREADY_IN_HOUSE: `${E.WARN} Já estás na casa — não precisas de pedir outra vez.`,

  // Promoções
  PROMOTION: (from, to) => `${E.LIDER} Subida: **${from}** → **${to}**.`,
  PROMOTION_TITLE: `${E.LIDER} Subida`,
  DEMOTION: (from, to) => `${E.WARN} Descida: **${from}** → **${to}**.`,
  PROMOTED_TO_OFICIAL: mention => `${E.LIDER} ${mention} sobe a **Oficial**.`,

  FAREWELL: name => `${E.BEMVINDO} ${name} sai da casa. Que corra bem na rua.`,

  // Tópico do canal individual
  CHANNEL_TOPIC: (fullName, nickname) => `Canal de ${fullName} (${nickname}) · Firma RedWood`,
};

module.exports = ONBOARDING;
