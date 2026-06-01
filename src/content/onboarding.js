'use strict';
/**
 * Copy de onboarding — pedido de tag, aprovação, negação e DMs.
 * Pós-migração: sem canais individuais/painéis de bairrista no bot.
 */

const E = require('./emojis');

const ONBOARDING = {
  WELCOME_TITLE: name => `${E.BEMVINDO} ${name}, tag validada`,
  WELCOME_BODY:
    'A tua tag foi validada. A gestão do bairro acontece agora na webapp.\n' +
    '\n' +
    `${E.TAG} Mantém o Discord alinhado com a tua posição.\n` +
    `${E.CASA} Usa a webapp para membros, encomendas, entregas, materiais e histórico.\n` +
    '\n' +
    '— Ballas Gang',

  REQUEST_RECEIVED_TITLE: `${E.TAG} Pedido em Análise`,
  REQUEST_RECEIVED_BODY: (name, nickname) =>
    'Leitura aberta em teu nome:\n' +
    `**${name}** _(${nickname})_\n` +
    '\n' +
    `${E.TAG} **1. Pedido enviado** — a chefia recebeu.\n` +
    `${E.PENDENTE} **2. Análise** — alguém vai ler. Podem confirmar contigo antes.\n` +
    `${E.OK} **3. Decisão** — recebes DM assim que houver resposta.\n` +
    '\n' +
    '_Enquanto esperas, lê o código. Quem se apresenta sabendo as leis entra com peso._',

  TAG_PENDING_TITLE: `${E.TAG} Novo pedido de tag`,

  TAG_APPROVED_TITLE: `${E.OK} Tag Aprovada`,
  TAG_APPROVED_STAFF_BODY: (mention, nickname) => `${mention} *(${nickname})* entrou como **Young Blood**.`,

  DM_APPROVED_TITLE: name => `${E.SANGUE} Entraste, ${name}`,
  DM_APPROVED_BODY: (nickname, guildName) =>
    `Tag validada. Agora és bairrista da **${guildName}**.\n` +
    '\n' +
    `${E.TAG} Pediste em teu nome _(${nickname})_ — o nome ficou.\n` +
    `${E.CASA} A tua gestão passa pela webapp: membros, entregas, encomendas e material.\n` +
    '\n' +
    '_Bem-vindo ao bairro._\n' +
    '— Ballas Gang',

  TAG_DENIED_TITLE: `${E.BLOQUEADO} Tag Negada`,
  TAG_DENIED_STAFF_BODY: (name, nickname, reason) =>
    `**${name}** _(${nickname})_` + (reason ? `\n**Razão:** ${reason}` : '\n_Sem razão indicada._'),

  DM_DENIED_TITLE: `${E.BLOQUEADO} Pedido não aceite`,
  DM_DENIED_BODY: (guildName, reason) =>
    `O teu pedido de tag na **${guildName}** não foi aceite desta vez.\n` +
    (reason ? `\n**Motivo:** ${reason}\n` : '') +
    '\n' +
    '_Para reapelar, fala directo com a chefia no servidor._\n' +
    '— Ballas Gang',

  DM_FALLBACK_NOTICE:
    `${E.WARN} Não consegui mandar-te DM _(tens DMs fechados?)_ ` +
    'Lê a mensagem e, se quiseres receber futuras directamente, abre DMs do servidor.',

  ALREADY_IN_HOUSE: `${E.WARN} Já estás na casa — não precisas de pedir outra vez.`,
  HAS_PENDING: `${E.PENDENTE} Já tens pedido em análise. Espera — o oficial vai ler.`,
  HAS_PRIOR_APPROVED: `${E.WARN} Já tiveste tag aprovada antes. Fala com a chefia — só eles reabrem onboarding.`,
  HAS_ACTIVE_RECORD: role =>
    `${E.WARN} Já tens registo activo como **${role}**. Se saíste e voltaste, fala com a chefia para reactivar.`,
  COOLDOWN: `${E.WARN} Calma — muitos pedidos seguidos. Aguarda alguns minutos e tenta de novo.`,

  MY_REQUEST_NONE: `${E.ENTRADA} Nunca pediste tag neste servidor. Vai ao portão e clica **Dar a Cara**.`,
  MY_REQUEST_PENDING_TITLE: `${E.PENDENTE} Pedido em Análise`,
  MY_REQUEST_APPROVED_TITLE: `${E.OK} Pedido Aprovado`,
  MY_REQUEST_DENIED_TITLE: `${E.BLOQUEADO} Pedido Negado`,
};

module.exports = ONBOARDING;
