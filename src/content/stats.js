'use strict';
/**
 * Copy do painel de estatísticas (chefia::stats_open).
 */

const E = require('./emojis');

const STATS = {
  OPEN_PROMPT: `${E.TOPO} Estatísticas da casa — escolhe o que queres ver:`,

  SELECT_PLACEHOLDER: 'Escolhe a tabela',

  OPTIONS: [
    { value: 'top_kills',      label: `${E.KILL} Top Killers (saídas)`,   description: 'Mais kills acumulados' },
    { value: 'top_kd',         label: `${E.EMPATE} Top K/D`,              description: 'Melhor rácio kills/mortes' },
    { value: 'top_profit',     label: `${E.LUCRO} Top Lucro`,             description: 'Quem gera mais em saídas' },
    { value: 'top_mvp',        label: `${E.MVP} Top MVP`,                 description: 'Mais vezes MVP' },
    { value: 'top_survival',   label: `${E.OK} Top Sobrevivência`,        description: 'Quem sai sempre inteiro' },
    { value: 'top_discipline', label: `${E.MATERIAL} Top Disciplina`,     description: 'Devolve mais material que leva' },
    { value: 'spot_net',       label: `${E.ZONA} Spots — Lucro`,          description: 'Onde lucramos mais' },
    { value: 'spot_winrate',   label: `${E.VITORIA} Spots — Winrate`,     description: 'Onde vencemos mais' },
    { value: 'spot_deaths',    label: `${E.MORTE} Spots — Mortes`,        description: 'Onde caímos mais' },
    { value: 'org_kills',      label: `${E.DERROTA} Firma — Kills`,       description: 'Contagem total' },
  ],

  TITLES: {
    top_kills:      `${E.KILL} Top Killers`,
    top_kd:         `${E.EMPATE} Top K/D`,
    top_profit:     `${E.LUCRO} Top Lucro`,
    top_mvp:        `${E.MVP} Top MVP`,
    top_survival:   `${E.OK} Top Sobrevivência`,
    top_discipline: `${E.MATERIAL} Top Disciplina`,
    spot_net:       `${E.ZONA} Spots — Lucro Líquido`,
    spot_winrate:   `${E.VITORIA} Spots — Winrate`,
    spot_deaths:    `${E.MORTE} Spots — Onde Caímos Mais`,
    org_kills:      `${E.DERROTA} Kills da Firma`,
  },

  EMPTY: '_Sem dados ainda._',
  UNKNOWN_PICK: 'Opção desconhecida.',
};

module.exports = STATS;
