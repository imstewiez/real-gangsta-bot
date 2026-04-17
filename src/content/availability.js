'use strict';
/**
 * Copy de presença / disponibilidade.
 */

const E = require('./emojis');

const AVAILABILITY = {
  TITLE: `${E.PRESENCA} Presença Hoje`,
  PROMPT: 'Diz à casa se vais estar na rua. Poucas palavras, muita clareza.',

  STATE: {
    disponivel: { label: 'Na zona', emoji: E.DISPONIVEL },
    indisponivel: { label: 'Fora', emoji: E.INDISPONIVEL },
    talvez: { label: 'Talvez', emoji: E.TALVEZ },
  },

  SESSION_OPENED: (id, channelId) => `${E.OK} Sessão **#${id}** publicada em <#${channelId}>.`,
  SESSION_ALREADY_OPEN: id => `${E.WARN} Já há sessão aberta hoje (**#${id}**). Fecha primeiro.`,
  SESSION_CLOSED: id => `${E.BLOQUEADO} Sessão **#${id}** fechada.`,
  VOTE_RECORDED: (slot, label, emoji) => `${emoji} **${slot}** → **${label}**`,
  VOTE_BULK_RECORDED: (n, label, emoji) => `${emoji} ${n} slots marcados como **${label}**.`,
  REASON: {
    session_not_found: 'Sessão não encontrada.',
    session_closed: 'Sessão fechada — votos congelados.',
    invalid_state: 'Estado inválido.',
  },
};

module.exports = AVAILABILITY;
