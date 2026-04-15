'use strict';
/**
 * Copy do painel de rádio — frequências, histórico, trocas.
 */

const E = require('./emojis');

const RADIO = {
  TITLE: `${E.RADIO} Frequências`,
  PROMPT: 'Trata das frequências do bairro. Principal e parceria num sítio só.',

  LABELS: {
    PRINCIPAL: 'Principal',
    PARCERIA: 'Parceria',
    HISTORICO: 'Histórico',
  },

  SET: (label, emoji, prev, next) =>
    `${emoji} ${label}: \`${prev || '—'}\` → \`${next}\`.`,
  RANDOM: (label, emoji, prev, next) =>
    `🎲 ${label}: \`${prev || '—'}\` → \`${next}\`.`,
  SWAPPED: (principal, parceria) =>
    `${E.REFRESH} Trocadas: ${E.RADIO} \`${principal}\` ↔ 🤝 \`${parceria}\`.`,
  PUBLISHED: (channelId) =>
    `${E.RADIO} Painel publicado em <#${channelId}>.`,
  HISTORY_EMPTY: '_Sem histórico ainda._',
};

module.exports = RADIO;
