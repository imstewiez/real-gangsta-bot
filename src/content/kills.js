'use strict';
/**
 * Copy do sistema de kills — tom directo, sem celebração cringe.
 */

const E = require('./emojis');

const KILLS = {
  // Títulos principais
  TITLE: `${E.KILL} Kills`,
  LOG_TITLE: `${E.AUDIT} Registo de Kills`,
  LEADERBOARD_TITLE: `${E.MORTE} Cemitério — Topo da Firma`,
  REGISTERED_TITLE: `${E.KILL} Kill Registada`,

  // Estados
  EMPTY: '_Sem kills registadas ainda._',
  LEADERBOARD_EMPTY: '_Cemitério vazio — ninguém tem kills ainda._',

  // Field labels
  LABELS: {
    VITIMA: 'Vítima',
    FACCAO: 'Facção',
    SPOT: 'Spot',
    SAIDA: 'Saída',
    QUANDO: 'Quando',
    KILLS: 'Kills',
    K_D: 'K/D',
    STREAK: 'Streak',
    SEMANA: 'Esta semana',
  },

  // Linha formatada do leaderboard
  LEADERBOARD_PLACE: (place, userId, kills, extra = '') =>
    `${place} <@${userId}> — **${kills}**${extra ? `  ·  ${extra}` : ''}`,

  // Linha de kill registada (na description do success embed)
  REGISTERED_LINE: (victim, spot) => `${E.MORTE} **${victim}**${spot ? ` · *${spot}*` : ''}`,

  // Copy dinâmica para streak
  STREAK_LINE: n => `${E.KILL} streak: **${n}**`,
  RANK_ENTRY: pos => `${E.TOPO} entras no **top ${pos}** da firma.`,
  NEW_RECORD: () => `${E.TOPO} novo recorde pessoal.`,
};

module.exports = KILLS;
