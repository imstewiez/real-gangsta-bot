'use strict';
/**
 * Copy do ecossistema Bairristas — painel, stats, rankings, resumos, logs.
 *
 * Tom: firme, bairro, sem exagero. Linguagem de casa, não de ERP.
 */

const E = require('./emojis');
const { inlineSign } = require('./footers');

const BAIRRISTAS = {
  // ── Painel principal ─────────────────────────────────────────────────────
  PANEL: {
    TITLE: `${E.CASA} Casa — Bairrista`,
    DESCRIPTION:
      'O que mexes aqui conta — para a semana, para a subida, para o topo.\n' +
      '\n' +
      `${E.MATERIAL} **Registar** — entrega ou vende material\n` +
      `${E.FIRMA} **Movimento no Bairro** — o teu peso na casa\n` +
      `${E.MEDAL_1} **Ranking** — quem rende mais\n` +
      `${E.ENCOMENDA} **Encomendas** — o que pediste à firma\n` +
      '\n' +
      `${inlineSign('HOUSE')}`,
  },

  // ── Movimento no Bairro (cockpit pessoal) ────────────────────────────────
  MOVIMENTO: {
    TITLE: (name) => `${E.FIRMA} Movimento de ${name} no bairro`,
    NO_DATA: 'Ainda não tens movimento na casa. Começa a trazer material.',

    // Secções
    MATERIAL_TITLE: `${E.MATERIAL} Material`,
    RANKING_TITLE: `${E.MEDAL_1} A tua posição`,
    SAIDA_TITLE: `${E.SAIDA} Combate`,
    PROGRESSO_TITLE: `${E.TOPO} Progressão`,
    STREAK_TITLE: `${E.FIRMA} Consistência`,

    // Labels material
    WEEK_LABEL: 'Esta semana',
    MONTH_LABEL: 'Este mês',
    ALLTIME_LABEL: 'All-time',
    DELIVERIES: 'entregas',
    SALES: 'vendas',
    TOTAL: 'total',
    VALUE: 'valor',

    // Labels ranking
    WEEK_RANK: 'Semanal',
    MONTH_RANK: 'Mensal',
    ALLTIME_RANK: 'Histórico',
    ABOVE: 'Acima',
    BELOW: 'Abaixo',
    EVOLUTION: 'Evolução',
    RISING: 'a subir',
    FALLING: 'a descer',
    STABLE: 'estável',
    NEW_ENTRY: 'entrada nova',

    // Labels combate
    SAIDAS: 'saídas',
    KILLS: 'kills',
    DEATHS: 'mortes',
    KD: 'K/D',
    SURVIVAL: 'sobrevivência',
    MVP: 'MVPs',
    RETURN_RATE: 'devolução',

    // Labels streak
    CURRENT_STREAK: 'Streak actual',
    BEST_STREAK: 'Melhor streak',
    WEEKS: 'semanas',
  },

  // ── Rankings ─────────────────────────────────────────────────────────────
  RANKING: {
    TITLE_WEEK: (label) => `${E.TOPO} Topo Semanal — ${label}`,
    TITLE_MONTH: (label) => `${E.TOPO} Topo Mensal — ${label}`,
    TITLE_ALLTIME: `${E.TOPO} Topo Histórico — Bairristas`,
    EMPTY: 'Sem dados para este período.',
    HEADER_WEEK: 'Quem mexeu mais esta semana.',
    HEADER_MONTH: 'Quem rendeu mais este mês.',
    HEADER_ALLTIME: 'Os nomes com mais peso na casa.',
    YOUR_POSITION: 'A tua posição',
    SCORE: 'score',
    DELTA_UP: (n) => `↑ subiste ${n}`,
    DELTA_DOWN: (n) => `↓ desceste ${n}`,
    DELTA_FLAT: '→ mantiveste',
  },

  // ── Logs de movimento ────────────────────────────────────────────────────
  LOG: {
    ENTREGA_TITLE: `${E.MATERIAL} Entrega registada`,
    VENDA_TITLE: `${E.LUCRO} Venda registada`,
    ITEM: 'Item',
    QTY: 'Quantidade',
    VALUE: 'Valor',
    MEMBER: 'Nome',
    WEEK_TOTAL: 'Total semanal',
    RANK_IMPACT: 'Posição semanal',
    NOTES: 'Notas',
  },

  // ── Resumos automáticos ──────────────────────────────────────────────────
  SUMMARY: {
    DAILY_TITLE: (date) => `${E.MATERIAL} Resumo do dia — ${date}`,
    DAILY_EMPTY: 'Dia calmo. Ninguém trouxe material.',
    DAILY_TOTAL: 'Total do dia',
    DAILY_TOP: 'Top 3',
    DAILY_TOP_ITEM: 'Material mais entregue',

    WEEKLY_TITLE: (label) => `${E.TOPO} Resumo semanal — ${label}`,
    WEEKLY_TOP: 'Top 5 da semana',
    WEEKLY_TOTAL: 'Total da semana',
    WEEKLY_BEST_STREAK: 'Maior streak',
    WEEKLY_RISING: 'Maior subida',

    MONTHLY_TITLE: (label) => `${E.MEDAL_1} Resumo mensal — ${label}`,
    MONTHLY_TOP: 'Top do mês',
    MONTHLY_TOTAL: 'Total do mês',
    MONTHLY_BEST: 'Melhor performer',
    MONTHLY_KILLS: 'Kills do mês',
  },

  // ── Progresso de tier ────────────────────────────────────────────────────
  PROGRESS: {
    TITLE: `${E.TOPO} Progresso de tier`,
    CURRENT_TIER: 'Tier actual',
    NEXT_TIER: 'Próximo tier',
    REMAINING: 'Falta',
    MAXED: 'Estás no topo automático. Subida manual pela chefia.',
    UNITS: 'itens',
  },
};

module.exports = BAIRRISTAS;
