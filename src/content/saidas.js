'use strict';
/**
 * Copy do domínio saídas — embeds, prompts, publisher.
 *
 * Nada de "operação" no texto visível. Sempre "saída" / "movimento".
 */

const E = require('./emojis');

const SAIDAS = {
  // Criação
  CREATE_TITLE: `${E.SAIDA} Nova Saída`,
  CREATE_PROMPT: 'Escolhe o tipo de movimento e o spot. O resto acerta-se na rua.',

  WIZARD_TITLE: `${E.FECHAR} Liquidação de Saída`,
  WIZARD_DESC: (id) => `**Saída #${id}** — fecha nome a nome.`,
  WIZARD_PENDING_HINT: (n) =>
    `Pendentes: **${n}**. Escolhe o próximo — ou carrega em Concluir para auto-liquidar os restantes como vivos sem kills.`,

  WIZARD_SELECT_PLACEHOLDER: (n) =>
    `Próximo nome (${n} pendente${n === 1 ? '' : 's'})`,
  WIZARD_BTN_FINISH_PENDING: 'Concluir (auto-liquida restantes)',
  WIZARD_BTN_FINISH_DONE: 'Finalizar e publicar',

  WIZARD_SUMMARY: (id, kills, deaths, survivors, net, profitable, channel) =>
    `${E.FECHAR} Saída **#${id}** fechada.\n` +
    `${E.KILL} ${kills} kills · ${E.MORTE} ${deaths} mortes · ${E.OK} ${survivors} vivos\n` +
    `${E.LUCRO} Líquido: **${(net || 0).toLocaleString('pt-PT')} €** (${profitable ? 'lucro' : 'prejuízo'})\n` +
    `${E.INFO} Resultados publicados em <#${channel}>.`,

  // Resultados
  RESUMO_TITLE: (id) => `${E.SAIDA} Saída #${id} — Resumo`,
  DESTAQUES_TITLE: `${E.MVP} Destaques`,
  IMPACTO_TITLE: `${E.TOPO} Impacto Histórico`,

  LABELS: {
    SPOT: 'Spot',
    TIPO: 'Tipo',
    LIDER: 'Líder',
    INIMIGO: 'Inimigo',
    RESULTADO: 'Resultado',
    KILLS: 'Kills',
    MORTES: 'Mortes',
    MATERIAL_FORNECIDO: 'Fornecido',
    MATERIAL_DEVOLVIDO: 'Devolvido',
    MATERIAL_PERDIDO: 'Perdido',
    LUCRO_BRUTO: 'Bruto',
    LUCRO_LIQUIDO: 'Líquido',
    MVP: 'MVP',
    TOP_KILLER: 'Top Killer',
    MORTOS: 'Mortos',
    DEVOLVERAM: 'Devolveram',
    DEVENDO: 'Ficaram a dever',
    WINRATE: 'Winrate do spot',
    ORG_KILLS: 'Kills da firma (all-time)',
  },

  // Auto-liquidação
  AUTO_SETTLED: 'Auto-liquidado como vivo sem kills.',

  // Placeholders de modal
  MODAL: {
    KILLS_LABEL: 'Kills',
    DOWNS_LABEL: 'Downs',
    DIED_LABEL: 'Morreu? (S/N)',
    DIED_WITH_MAT_LABEL: 'Morreu com material da firma?',
    NOTES_LABEL: 'Notas',
    RESULT_LABEL: 'Resultado (win/loss/draw/sem_conflito)',
    ENEMY_LABEL: 'Inimigo · facção',
    CRAFT_LABEL: 'Valor craftado (€)',
    FLAGS_LABEL: 'Flags (fight,craft,dom)',
  },
};

// Tradução de resultado para label com emoji — usada em embeds.
const RESULT_LABEL = {
  win: `${E.VITORIA} Vitória`,
  loss: `${E.DERROTA} Derrota`,
  draw: `${E.EMPATE} Empate`,
  sem_conflito: `${E.INFO} Sem conflito`,
};

module.exports = { SAIDAS, RESULT_LABEL };
