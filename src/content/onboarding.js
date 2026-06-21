'use strict';

const E = require('./emojis');

const ONBOARDING = {
  WELCOME_TITLE: name => `${E.BEMVINDO} Pedido aprovado, ${name}`,
  WELCOME_BODY:
    'O teu pedido foi aprovado e a tua tag foi atribuída.\n' +
    '\n' +
    `${E.TAG} Mantém o Discord alinhado com a tua função.\n` +
    `${E.CASA} A gestão interna continua pela webapp.\n` +
    '\n' +
    '— Ballas Gang',

  REQUEST_RECEIVED_TITLE: `${E.TAG} Pedido recebido`,
  REQUEST_RECEIVED_BODY: (name, nickname) =>
    `Recebemos o teu pedido para **${name}** _(${nickname})_.\n` +
    '\n' +
    `${E.PENDENTE} Estado: **em análise**.\n` +
    `${E.OK} Recebes resposta quando a equipa tratar do pedido.`,

  TAG_PENDING_TITLE: `${E.TAG} Pedido de tag pendente`,

  TAG_APPROVED_TITLE: `${E.OK} Pedido aprovado`,
  TAG_APPROVED_STAFF_BODY: (mention, nickname) => `${mention} _(${nickname})_ foi aprovado.`,

  DM_APPROVED_TITLE: name => `${E.OK} Pedido aprovado, ${name}`,
  DM_APPROVED_BODY: (nickname, guildName) =>
    `O teu pedido foi aprovado em **${guildName}**.\n` +
    '\n' +
    `${E.TAG} Tag atribuída: _${nickname}_.\n` +
    `${E.CASA} Acompanha a tua informação pela webapp.\n` +
    '\n' +
    '— Ballas Gang',

  TAG_DENIED_TITLE: `${E.BLOQUEADO} Pedido recusado`,
  TAG_DENIED_STAFF_BODY: (name, nickname, reason) =>
    `**${name}** _(${nickname})_` + (reason ? `\n**Motivo:** ${reason}` : '\n_Sem motivo indicado._'),

  DM_DENIED_TITLE: `${E.BLOQUEADO} Pedido recusado`,
  DM_DENIED_BODY: (guildName, reason) =>
    `O teu pedido em **${guildName}** foi recusado.\n` +
    (reason ? `\n**Motivo:** ${reason}\n` : '') +
    '\n' +
    'Para esclarecer ou voltar a tentar, contacta a equipa responsável.\n' +
    '— Ballas Gang',

  DM_FALLBACK_NOTICE:
    `${E.WARN} Não consegui enviar-te DM. ` + 'Ativa as DMs do servidor para receberes futuras respostas diretamente.',

  ALREADY_IN_HOUSE: `${E.WARN} Já tens uma tag ativa. Não precisas de abrir outro pedido.`,
  HAS_PENDING: `${E.PENDENTE} Já tens um pedido em análise. Aguarda resposta.`,
  HAS_PRIOR_APPROVED: `${E.WARN} Já tiveste um pedido aprovado. Contacta a equipa responsável.`,
  HAS_ACTIVE_RECORD: role =>
    `${E.WARN} Já tens registo ativo como **${role}**. Contacta a equipa responsável para reativação ou ajuste.`,
  COOLDOWN: `${E.WARN} Fizeste demasiados pedidos seguidos. Aguarda alguns minutos e tenta novamente.`,

  MY_REQUEST_NONE: `${E.ENTRADA} Ainda não abriste nenhum pedido. Usa os botões do painel de acesso.`,
  MY_REQUEST_PENDING_TITLE: `${E.PENDENTE} Pedido em análise`,
  MY_REQUEST_APPROVED_TITLE: `${E.OK} Pedido aprovado`,
  MY_REQUEST_DENIED_TITLE: `${E.BLOQUEADO} Pedido recusado`,
};

module.exports = ONBOARDING;
