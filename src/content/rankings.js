'use strict';
/**
 * Copy de rankings / topos.
 */

const E = require('./emojis');

const RANKINGS = {
  TITLE: (label, week) => `${E.TOPO} ${label} — ${week}`,
  EMPTY_WEEK: 'Sem dados para esta semana.',
  ENTRY: (place, userId, value, extras) => `${place} <@${userId}> — ${value}${extras ? ` (${extras})` : ''}`,

  LABELS: {
    ENTREGAS: 'entregas',
    VENDAS: 'vendas',
    SAIDAS: 'saídas',
    KILLS: 'kills',
    PRESENCA: 'presença',
  },
};

module.exports = RANKINGS;
