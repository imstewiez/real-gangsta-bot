'use strict';
/**
 * Copy do painel de rádio — frequência principal.
 */

const E = require('./emojis');

const RADIO = {
  TITLE: `${E.RADIO} Frequência`,
  PROMPT: 'Frequência principal da Firma.',

  // Títulos de success embeds
  SET_TITLE: `${E.RADIO} Frequência actualizada`,
  RANDOM_TITLE: `${E.REFRESH} Frequência nova (random)`,

  LABELS: {
    PRINCIPAL: 'Principal',
    HISTORICO: 'Histórico',
    POR: 'Por',
    ANTES: 'Antes',
    AGORA: 'Agora',
  },

  SET: (label, emoji, prev, next) => `${emoji} ${label}: \`${prev || '—'}\` → \`${next}\`.`,
  RANDOM: (label, emoji, prev, next) => `${E.REFRESH} ${label}: \`${prev || '—'}\` → \`${next}\`.`,
  PUBLISHED: channelId => `${E.RADIO} Painel publicado em <#${channelId}>.`,
  HISTORY_EMPTY: '_Sem histórico ainda._',
  HISTORY_LINE: (when, by, label, prev, next) => `\`${when}\` ${by} — ${label}: \`${prev || '—'}\` → \`${next}\``,
};

module.exports = RADIO;
