'use strict';
/**
 * Copy do painel de rádio — frequências, histórico, trocas.
 */

const E = require('./emojis');

const RADIO = {
  TITLE:      `${E.RADIO} Frequências`,
  PROMPT:     'Frequências da zona. Principal e parceria aqui.',

  // Títulos de success embeds
  SET_TITLE:     `${E.RADIO} Frequência actualizada`,
  RANDOM_TITLE:  `${E.REFRESH} Frequência nova (random)`,
  SWAP_TITLE:    `${E.REFRESH} Frequências trocadas`,

  LABELS: {
    PRINCIPAL: 'Principal',
    PARCERIA:  'Parceria',
    HISTORICO: 'Histórico',
    POR:       'Por',
    ANTES:     'Antes',
    AGORA:     'Agora',
  },

  SET: (label, emoji, prev, next) =>
    `${emoji} ${label}: \`${prev || '—'}\` → \`${next}\`.`,
  RANDOM: (label, emoji, prev, next) =>
    `${E.REFRESH} ${label}: \`${prev || '—'}\` → \`${next}\`.`,
  SWAPPED: (principal, parceria) =>
    `${E.REFRESH} Trocadas: \`${principal}\` ↔ \`${parceria}\`.`,
  PUBLISHED: (channelId) =>
    `${E.RADIO} Painel publicado em <#${channelId}>.`,
  HISTORY_EMPTY: '_Sem histórico ainda._',
  HISTORY_LINE:  (when, by, label, prev, next) =>
    `\`${when}\` ${by} — ${label}: \`${prev || '—'}\` → \`${next}\``,
};

module.exports = RADIO;
