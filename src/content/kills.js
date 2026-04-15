'use strict';
/**
 * Copy do sistema de kills.
 */

const E = require('./emojis');

const KILLS = {
  TITLE: `${E.KILL} Kills`,
  LOG_TITLE: `${E.AUDIT} Registo de Kills`,
  EMPTY: '_Sem kills registados._',

  LABELS: {
    VITIMA: 'Vítima',
    FACCAO: 'Facção',
    SPOT: 'Spot',
    SAIDA: 'Saída',
    QUANDO: 'Quando',
  },

  LEADERBOARD_TITLE: `${E.DERROTA} Top Killers — Firma`,
  LEADERBOARD_PLACE: (place, userId, kills) =>
    `${place} <@${userId}> — **${kills}**`,
};

module.exports = KILLS;
