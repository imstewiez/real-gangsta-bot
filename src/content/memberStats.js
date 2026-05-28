'use strict';
/**
 * Copy das fichas pessoais do bairrista — performance/material/lucro.
 */

const E = require('./emojis');

const MEMBER_STATS = {
  // Labels dos drill-downs do cockpit pessoal
  DRILLDOWN: {
    MATERIAL: 'Material',
    PVP: 'PvP & Saídas',
    ENCOMENDAS: 'Encomendas',
    HISTORICO: 'Histórico',
    PROGRESSAO: 'Progressão',
  },

  // Performance / Combate
  COMBAT: {
    TITLE: `${E.KILL} A tua performance`,
    NO_DATA: 'Ainda não tens saídas fechadas. Aparece na rua.',

    KILLS: `${E.KILL} Kills`,
    DEATHS: `${E.MORTE} Mortes`,
    KD: `${E.EMPATE} K/D`,
    SURVIVAL: `${E.OK} Sobrevivência`,
    MVP: `${E.MVP} MVPs`,
    SAIDAS: `${E.SAIDA} Saídas`,
    WINS: `${E.VITORIA} Vitórias`,
    LOSSES: `${E.DERROTA} Derrotas`,
    WEEK_KILLS: `${E.KILL} Esta semana`,
    RANK: `${E.TOPO} Posição all-time`,
    LAST_KILL: `${E.KILL} Última kill`,
  },

  // Material
  MATERIAL: {
    TITLE: `${E.MATERIAL} O teu material`,
    NO_DATA: 'Ainda não recebeste material da Ballas Gang.',

    RECEBIDO: `${E.FORNECER} Recebido da Ballas Gang`,
    DEVOLVIDO: `${E.DEVOLVER} Devolveste`,
    PERDIDO: `${E.PERDIDO} Perdeste`,
    CONSUMIDO: `${E.CRAFT} Consumido`,
    RETURN_RATE: `${E.OK} Taxa de devolução`,
    LOSS_RATE: `${E.WARN} Taxa de perda`,
    TOP_ITEMS: `${E.MATERIAL} Material que mais levas`,
  },

  // Lucro / Spots
  PROFIT: {
    TITLE: `${E.LUCRO} O teu lucro`,
    NO_DATA: 'Ainda não fechaste saídas com lucro.',

    GENERATED: `${E.DINHEIRO} Lucro gerado`,
    SAIDAS: `${E.SAIDA} Saídas fechadas`,
    TOP_SPOTS: `${E.ZONA} Os teus spots`,
    RECENT: `${E.AUDIT} Últimas saídas`,
  },
};

module.exports = MEMBER_STATS;
