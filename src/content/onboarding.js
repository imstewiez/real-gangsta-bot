'use strict';
/**
 * Copy de onboarding — tag, canal individual, aprovação, negação, DMs.
 *
 * Tom: temático, rua, firma. Frase curta, imperativo, contraste binário
 * "a rua X, a Ballas Gang Y". Sem anglicismos. Corta o ar.
 */

const E = require('./emojis');

const ONBOARDING = {
  // ── Canal individual do bairrista (welcome embed pós-aprovação) ──
  WELCOME_TITLE: name => `${E.BEMVINDO} ${name}, tua zona abriu`,
  WELCOME_BODY:
    'Este canal é **teu**. Aqui regista-se tudo — o que entra, o que sai, o que pesa.\n' +
    '\n' +
    `${E.MATERIAL} **Registar Material** — cada quilo conta. Sem registo, não existe.\n` +
    `${E.FIRMA} **Movimento no Bairro** — o teu peso ao vivo.\n` +
    `${E.MEDAL_1} **Ranking** — sobe pela produção, não pela cara.\n` +
    `${E.ENCOMENDA} **Encomendas** — o que pediste à Ballas Gang.\n` +
    '\n' +
    '_Trás pedra. O bairro devolve nome._\n' +
    '— Ballas Gang',

  // ── Confirmação ao user após submeter o modal ──
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

  // ── Approval card que vai ao canal de staff ──
  TAG_PENDING_TITLE: `${E.TAG} Novo pedido de tag`,

  // ── Aprovação (embed no canal de staff após decisão) ──
  TAG_APPROVED_TITLE: `${E.OK} Tag Aprovada`,
  TAG_APPROVED_STAFF_BODY: (mention, nickname, channelMention) =>
    `${mention} *(${nickname})* entrou como **Young Blood**.` +
    (channelMention ? `\nCanal individual: ${channelMention}` : ''),

  // ── DM ao user quando aprovado ──
  // Título construído inline no handler (precisa do nome). Esta constante
  // é só a base de fallback.
  DM_APPROVED_TITLE: name => `${E.SANGUE} Entraste, ${name}`,
  DM_APPROVED_BODY: (nickname, guildName, channelMention) =>
    `Tag validada. Agora és bairrista da **${guildName}**.\n` +
    '\n' +
    `${E.TAG} Pediste em teu nome _(${nickname})_ — o nome ficou.\n` +
    `${E.CASA} Canal individual aberto${channelMention ? `: ${channelMention}` : '.'}\n` +
    `${E.MATERIAL} Começa já — regista o que trazes.\n` +
    '\n' +
    '_Bem-vindo ao bairro._\n' +
    '— Ballas Gang',

  // ── Negação ──
  TAG_DENIED_TITLE: `${E.BLOQUEADO} Tag Negada`,
  TAG_DENIED_STAFF_BODY: (name, nickname, reason) =>
    `**${name}** _(${nickname})_` + (reason ? `\n**Razão:** ${reason}` : '\n_Sem razão indicada._'),

  // ── DM ao user quando negado ──
  DM_DENIED_TITLE: `${E.BLOQUEADO} Pedido não aceite`,
  DM_DENIED_BODY: (guildName, reason) =>
    `O teu pedido de tag na **${guildName}** não foi aceite desta vez.\n` +
    (reason ? `\n**Motivo:** ${reason}\n` : '') +
    '\n' +
    '_Para reapelar, fala directo com a chefia no servidor._\n' +
    '— Ballas Gang',

  // ── Fallback message quando DMs fechados ──
  DM_FALLBACK_NOTICE:
    `${E.WARN} Não consegui mandar-te DM _(tens DMs fechados?)_ ` +
    'Lê a mensagem e, se quiseres receber futuras directamente, abre DMs do servidor.',

  // ── Guards / estados (vistos pelo user) ──
  ALREADY_IN_HOUSE: `${E.WARN} Já estás na casa — não precisas de pedir outra vez.`,
  HAS_PENDING: `${E.PENDENTE} Já tens pedido em análise. Espera — o oficial vai ler.`,
  HAS_PRIOR_APPROVED: `${E.WARN} Já tiveste tag aprovada antes. Fala com a chefia — só eles reabrem onboarding.`,
  HAS_ACTIVE_RECORD: role =>
    `${E.WARN} Já tens registo activo como **${role}**. Se saíste e voltaste, fala com a chefia para reactivar.`,
  COOLDOWN: `${E.WARN} Calma — muitos pedidos seguidos. Aguarda alguns minutos e tenta de novo.`,

  // ── /rg-meu-pedido ──
  MY_REQUEST_NONE: `${E.ENTRADA} Nunca pediste tag neste servidor. Vai ao portão e clica **Dar a Cara**.`,
  MY_REQUEST_PENDING_TITLE: `${E.PENDENTE} Pedido em Análise`,
  MY_REQUEST_APPROVED_TITLE: `${E.OK} Pedido Aprovado`,
  MY_REQUEST_DENIED_TITLE: `${E.BLOQUEADO} Pedido Negado`,
};

module.exports = ONBOARDING;
