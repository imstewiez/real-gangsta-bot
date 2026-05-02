'use strict';
/**
 * Tab Resumo & Rankings v2 — fusão compacta de resumo temporal + rankings.
 */

const {
  COLOR,
  NUM_FMT,
  cell,
  bodyCell,
  bodyBoldCell,
  captionCell,
  mutedCell,
  numCell,
  badgeCell,
  killCell,
  deathCell,
  formatDelta,
  rankCell,
  conditionalGreaterThan,
  conditionalLessThan,
} = require('../theme');
const {
  headerBlock,
  sectionHeader,
  spacer,
  divider,
  miniKPIRow,
  tableHeader,
  tableBody,
  rankingBlock,
  totalRow,
  footerBlock,
  autoResizeAll,
  gangTitle,
} = require('./_common');
const {
  getWeeklySummary,
  getDailyBreakdown,
  getTrending,
  getRankings,
  getSpotsFull,
  getBairristaRankings,
} = require('../queries');

const COL_COUNT = 9;

function destaqueBadge(d, avgNet, avgKills) {
  const net = Number(d.net || 0);
  const kills = d.kills || 0;
  const deaths = d.deaths || 0;
  const hasActivity = (d.ops || 0) > 0 || Number(d.entradas) > 0 || Number(d.vendas) > 0;
  if (!hasActivity) return mutedCell('—', { align: 'CENTER' });
  if (net >= avgNet * 1.5 && net > 0) return badgeCell('BOM DIA', COLOR.GREEN_DEEP);
  if (net <= avgNet * 0.5 && net < 0) return badgeCell('A PERDER', COLOR.RED_DEEP);
  if (kills >= Math.max(avgKills * 1.5, 3)) return badgeCell('PESOU', COLOR.GOLD);
  if (deaths >= 3 && net < 0) return badgeCell('DIA CARO', COLOR.RED_BLOOD);
  if (net > 0) return badgeCell('POSITIVO', COLOR.GREEN_DEEP);
  return badgeCell('NEUTRO', COLOR.GRAY_DARK);
}

function fmtDate(d) {
  try {
    return d ? new Date(d).toISOString().split('T')[0] : '—';
  } catch {
    return '—';
  }
}

function _rankingBlockCompact(batch, sheetId, row, { title, hint, items, columns }) {
  row = sectionHeader(batch, sheetId, row, { title, hint, columnCount: COL_COUNT });
  row = tableHeader(batch, sheetId, row, columns.concat(Array(COL_COUNT - columns.length).fill('')));
  const sliced = items.slice(0, 5);
  const rows = sliced.map((item, i) => {
    const cells = [rankCell(i + 1), ...item.render];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  if (rows.length) row = tableBody(batch, sheetId, row, rows);
  else {
    const empty = [
      mutedCell('—', { align: 'CENTER' }),
      mutedCell('sem dados', { align: 'LEFT' }),
      ...Array(COL_COUNT - 2).fill(cell('', { bg: COLOR.BG_APP })),
    ];
    batch.updateCells(sheetId, row, 0, [empty]);
    row += 1;
  }
  return spacer(batch, sheetId, row, COL_COUNT, 'XS');
}

async function syncResumo(batch, sheetId) {
  const [{ current, previous, bounds }, daily14, trend, rk, spots, bairristaRk] = await Promise.all([
    getWeeklySummary(),
    getDailyBreakdown(14),
    getTrending(),
    getRankings(),
    getSpotsFull(),
    getBairristaRankings(),
  ]);

  let row = headerBlock(batch, sheetId, {
    title: gangTitle('Resumo & Rankings'),
    subtitle: `semana ${bounds.current.start} → ${bounds.current.end}  ·  anterior ${bounds.previous?.start || '—'} → ${bounds.previous?.end || '—'}  ·  14 dias`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  batch.freezeRows(sheetId, row);

  // ── A. Pilares da semana — miniKPIRow ────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'PILARES DA SEMANA',
    hint: `${current.ops || 0} saídas concluídas`,
    columnCount: COL_COUNT,
  });
  const winRate = (current.ops || 0) > 0 ? (current.wins || 0) / current.ops : 0;
  const kd = (current.deaths || 0) > 0 ? (current.kills || 0) / current.deaths : current.kills || 0;
  const dNet = formatDelta(Number(previous?.net) || 0, Number(current.net) || 0, 'pct');
  const dKills = formatDelta(Number(previous?.kills) || 0, current.kills || 0, 'pct');
  row = miniKPIRow(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Win Rate',
        value: winRate,
        numberFormat: NUM_FMT.PCT,
        delta: `${current.wins || 0}V · ${current.losses || 0}D · ${current.draws || 0}E`,
        deltaDirection: 'flat',
      },
      {
        label: 'K/D',
        value: kd,
        numberFormat: NUM_FMT.KD,
        delta: `${current.kills || 0}k · ${current.deaths || 0}d · ${dKills.arrow} vs anterior`,
        deltaDirection: dKills.direction,
      },
      {
        label: 'Lucro Líq.',
        value: Number(current.net) || 0,
        numberFormat: NUM_FMT.EURO,
        delta: `${dNet.arrow} ${(dNet.value * 100).toFixed(1)}% vs anterior`,
        deltaDirection: dNet.direction,
      },
      {
        label: 'Entregas',
        value: current.entregas || 0,
        numberFormat: NUM_FMT.INT,
        delta: `vendas: ${current.vendas || 0}`,
        deltaDirection: 'flat',
      },
    ],
    COL_COUNT
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── B. Comparativo detalhado (8 métricas) ────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'COMPARATIVO · ESTA vs ANTERIOR',
    hint: 'deltas coloridos',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, [
    'Métrica',
    'Esta Semana',
    'Semana Ant.',
    'Δ Absoluto',
    'Δ %',
    '',
    '',
    '',
    '',
  ]);
  const cmpData = [
    { label: 'Saídas', cur: current.ops || 0, prev: previous?.ops ?? null, fmt: NUM_FMT.INT },
    { label: 'Vitórias', cur: current.wins || 0, prev: previous?.wins ?? null, fmt: NUM_FMT.INT },
    { label: 'Kills', cur: current.kills || 0, prev: previous?.kills ?? null, fmt: NUM_FMT.INT },
    { label: 'Mortes', cur: current.deaths || 0, prev: previous?.deaths ?? null, fmt: NUM_FMT.INT },
    {
      label: 'Lucro Bruto (€)',
      cur: Number(current.gross) || 0,
      prev: Number(previous?.gross) || null,
      fmt: NUM_FMT.EURO,
    },
    {
      label: 'Lucro Líquido (€)',
      cur: Number(current.net) || 0,
      prev: Number(previous?.net) || null,
      fmt: NUM_FMT.EURO,
    },
    { label: 'Entregas (itens)', cur: current.entregas || 0, prev: null, fmt: NUM_FMT.INT },
    { label: 'Vendas (itens)', cur: current.vendas || 0, prev: null, fmt: NUM_FMT.INT },
  ].map(m => {
    const hasPrev = m.prev !== null;
    const absDelta = hasPrev ? m.cur - m.prev : 0;
    const { value: pctVal, direction } = formatDelta(m.prev || 0, m.cur, 'pct');
    const deltaFont =
      direction === 'up'
        ? { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.GREEN_DEEP }
        : direction === 'down'
          ? { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.RED_SIGNAL }
          : { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY };
    const isEuro = m.fmt.pattern && m.fmt.pattern.includes('€');
    const cells = [
      bodyBoldCell(m.label),
      numCell(m.cur, m.fmt),
      hasPrev
        ? numCell(m.prev, m.fmt, { font: { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY } })
        : mutedCell('—', { align: 'RIGHT' }),
      hasPrev
        ? numCell(absDelta, isEuro ? NUM_FMT.EURO_DELTA : NUM_FMT.INT_DELTA, { font: deltaFont })
        : mutedCell('—', { align: 'RIGHT' }),
      hasPrev ? numCell(pctVal, NUM_FMT.PCT_DELTA, { font: deltaFont }) : mutedCell('—', { align: 'RIGHT' }),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, cmpData);
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── C. Janela 14 dias ────────────────────────────────────────────────────
  const totalNet = daily14.reduce((a, r) => a + Number(r.net || 0), 0);
  const totalOps = daily14.reduce((a, r) => a + (r.ops || 0), 0);
  const totalKills = daily14.reduce((a, r) => a + (r.kills || 0), 0);
  const totalEntr = daily14.reduce((a, r) => a + Number(r.entradas || 0), 0);
  const diasOps = daily14.filter(r => (r.ops || 0) > 0).length;

  row = sectionHeader(batch, sheetId, row, {
    title: 'JANELA DE 14 DIAS',
    hint: 'acumulado',
    columnCount: COL_COUNT,
  });
  row = miniKPIRow(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Dias c/ Op.',
        value: diasOps,
        numberFormat: NUM_FMT.INT,
        delta: `${daily14.length} dias totais`,
        deltaDirection: 'flat',
      },
      {
        label: 'Saídas',
        value: totalOps,
        numberFormat: NUM_FMT.INT,
        delta: `média ${(totalOps / Math.max(diasOps, 1)).toFixed(1)}/dia`,
        deltaDirection: 'flat',
      },
      {
        label: 'Kills',
        value: totalKills,
        numberFormat: NUM_FMT.INT,
        delta: `média ${(totalKills / Math.max(diasOps, 1)).toFixed(1)}/dia`,
        deltaDirection: 'flat',
      },
      {
        label: 'Lucro Total',
        value: totalNet,
        numberFormat: NUM_FMT.EURO,
        delta: `entradas: ${totalEntr} un.`,
        deltaDirection: totalNet > 0 ? 'up' : totalNet < 0 ? 'down' : 'flat',
      },
    ],
    COL_COUNT
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = tableHeader(batch, sheetId, row, [
    'Data',
    'Saídas',
    'Kills',
    'Mortes',
    'Líquido',
    'Entradas',
    'Vendas',
    'Destaque',
    '',
  ]);
  const avgNet14 = daily14.length ? daily14.reduce((a, r) => a + Number(r.net || 0), 0) / daily14.length : 0;
  const avgKills14 = daily14.length ? daily14.reduce((a, r) => a + (r.kills || 0), 0) / daily14.length : 0;

  const firstDailyRow = row;
  const dailyRows = daily14.map(d => [
    bodyBoldCell(fmtDate(d.day)),
    numCell(d.ops, NUM_FMT.INT),
    killCell(d.kills),
    deathCell(d.deaths),
    numCell(Number(d.net), NUM_FMT.EURO),
    numCell(Number(d.entradas), NUM_FMT.INT),
    numCell(Number(d.vendas), NUM_FMT.INT),
    destaqueBadge(d, avgNet14, avgKills14),
    cell('', { bg: COLOR.BG_APP }),
  ]);
  row = tableBody(batch, sheetId, row, dailyRows);
  if (dailyRows.length) {
    row = totalRow(batch, sheetId, row, {
      label: 'TOTAL 14 DIAS',
      columnCount: COL_COUNT,
      values: [
        { col: 1, value: totalOps, numberFormat: NUM_FMT.INT },
        { col: 2, value: totalKills, numberFormat: NUM_FMT.INT },
        { col: 3, value: daily14.reduce((a, r) => a + (r.deaths || 0), 0), numberFormat: NUM_FMT.INT },
        { col: 4, value: totalNet, numberFormat: NUM_FMT.EURO },
        { col: 5, value: totalEntr, numberFormat: NUM_FMT.INT },
        { col: 6, value: daily14.reduce((a, r) => a + Number(r.vendas || 0), 0), numberFormat: NUM_FMT.INT },
      ],
    });
    batch.addRule(
      conditionalGreaterThan(sheetId, firstDailyRow, 4, firstDailyRow + dailyRows.length, 5, 0, COLOR.GREEN_SOFT)
    );
    batch.addRule(
      conditionalLessThan(sheetId, firstDailyRow, 4, firstDailyRow + dailyRows.length, 5, 0, COLOR.RED_SIGNAL_SOFT)
    );
  }
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── D. Spots — top 3 rentáveis + flop 3 perigosos numa tabela ────────────
  const top3 = [...spots].sort((a, b) => Number(b.total_net_value || 0) - Number(a.total_net_value || 0)).slice(0, 3);
  const flop3 = [...spots].sort((a, b) => Number(a.total_net_value || 0) - Number(b.total_net_value || 0)).slice(0, 3);

  row = sectionHeader(batch, sheetId, row, {
    title: 'SPOTS · RENTÁVEIS vs PERIGOSOS',
    hint: 'top 3 lucro · flop 3 prejuízo',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['#', 'Spot', 'Saídas', 'Winrate', 'Lucro (€)', 'Mortes', 'Tier', '', '']);

  const spotRows = [
    ...top3.map((s, i) => ({
      rank: i + 1,
      label: s.spot || '—',
      sub: `${s.total_saidas} saídas`,
      value: Number(s.total_net_value) || 0,
      deaths: s.our_deaths || 0,
      wr: (Number(s.win_rate) * 100).toFixed(0) + '%',
      tier: 'PREMIUM',
    })),
    ...flop3.map((s, i) => ({
      rank: i + 1,
      label: s.spot || '—',
      sub: `${s.total_saidas} saídas`,
      value: Number(s.total_net_value) || 0,
      deaths: s.our_deaths || 0,
      wr: (Number(s.win_rate) * 100).toFixed(0) + '%',
      tier: 'FRACO',
    })),
  ];

  const spotTableRows = spotRows.map(s => {
    const isTop = s.value >= 0;
    const cells = [
      rankCell(s.rank),
      bodyBoldCell(s.label),
      captionCell(s.sub),
      bodyCell(s.wr),
      numCell(s.value, NUM_FMT.EURO),
      numCell(s.deaths, NUM_FMT.INT),
      isTop ? badgeCell('RENTÁVEL', COLOR.GREEN_DEEP) : badgeCell('PERIGOSO', COLOR.RED_DEEP),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ];
    return cells;
  });
  row = tableBody(batch, sheetId, row, spotTableRows);
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── E. Rankings competitivos compactos (top 5 cada) ──────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'RANKINGS COMPETITIVOS',
    hint: 'top 5 por eixo',
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'XS');

  row = _rankingBlockCompact(batch, sheetId, row, {
    title: 'TOP ENTREGAS',
    hint: 'quantidade de material entregue · peso ponderado',
    columns: ['#', 'Nome', 'Tier', 'Itens', 'Peso'],
    items: rk.topEntregas.map(x => ({
      render: [
        bodyBoldCell(x.display_name || '—'),
        captionCell(x.tier || '—'),
        numCell(x.qty, NUM_FMT.INT),
        numCell(Number(x.weighted), NUM_FMT.INT),
      ],
    })),
  });
  row = _rankingBlockCompact(batch, sheetId, row, {
    title: 'TOP KILLS',
    hint: 'kills em saídas',
    columns: ['#', 'Nome', 'Kills', 'K/D'],
    items: rk.topKills.map(x => ({
      render: [
        bodyBoldCell(x.display_name || '—'),
        numCell(x.kills_total, NUM_FMT.INT),
        numCell(Number(x.kd_ratio), NUM_FMT.KD),
      ],
    })),
  });
  row = _rankingBlockCompact(batch, sheetId, row, {
    title: 'TOP LUCRO GERADO',
    hint: 'líquido em saídas lideradas',
    columns: ['#', 'Nome', 'Lucro (€)'],
    items: rk.topProfit.map(x => ({
      render: [bodyBoldCell(x.display_name || '—'), numCell(Number(x.profit_generated), NUM_FMT.EURO)],
    })),
  });
  row = _rankingBlockCompact(batch, sheetId, row, {
    title: 'TOP MVP',
    hint: 'melhor em cada saída',
    columns: ['#', 'Nome', 'MVPs', 'Saídas', '% MVP'],
    items: rk.topMVP.map(x => ({
      render: [
        bodyBoldCell(x.display_name || '—'),
        numCell(x.mvp_count, NUM_FMT.INT),
        numCell(x.saidas_total, NUM_FMT.INT),
        numCell(x.saidas_total > 0 ? x.mvp_count / x.saidas_total : 0, NUM_FMT.PCT),
      ],
    })),
  });
  row = _rankingBlockCompact(batch, sheetId, row, {
    title: 'TOP SOBREVIVÊNCIA',
    hint: 'mínimo 3 saídas',
    columns: ['#', 'Nome', 'Survival', 'Saídas'],
    items: rk.topSurvival.map(x => ({
      render: [
        bodyBoldCell(x.display_name || '—'),
        numCell(Number(x.survival_rate) / 100, NUM_FMT.PCT),
        numCell(x.saidas_total, NUM_FMT.INT),
      ],
    })),
  });
  row = _rankingBlockCompact(batch, sheetId, row, {
    title: 'TOP DISCIPLINA MATERIAL',
    hint: 'taxa de devolução',
    columns: ['#', 'Nome', 'Return Rate'],
    items: rk.topDiscipline.map(x => ({
      render: [bodyBoldCell(x.display_name || '—'), numCell(Number(x.material_return_rate) / 100, NUM_FMT.PCT)],
    })),
  });
  row = _rankingBlockCompact(batch, sheetId, row, {
    title: 'TOP K/D',
    hint: 'mínimo 3 encontros',
    columns: ['#', 'Nome', 'K/D', 'Kills', 'Deaths'],
    items: rk.topKD.map(x => ({
      render: [
        bodyBoldCell(x.display_name || '—'),
        numCell(Number(x.kd_ratio), NUM_FMT.KD),
        killCell(x.kills_total),
        deathCell(x.deaths_total),
      ],
    })),
  });

  // ── F. Bairristas — Rankings compactos ───────────────────────────────────
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');
  row = sectionHeader(batch, sheetId, row, {
    title: 'BAIRRISTAS · RANKINGS',
    hint: 'semanal, mensal, histórico + streaks',
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'XS');

  const bairristaColumns = ['#', 'Nome', 'Tier', 'Entregas', 'Vendas', 'Saídas', 'Score'];
  const bairristaRender = x => [
    bodyBoldCell(x.display_name || '—'),
    captionCell(x.tier || '—'),
    numCell(x.deliveries || 0, NUM_FMT.INT),
    numCell(x.sales || 0, NUM_FMT.INT),
    numCell(x.operations_count || x.saidas_total || 0, NUM_FMT.INT),
    numCell(Math.round(Number(x.hybrid_score ?? x.weighted_value ?? 0)), NUM_FMT.INT),
  ];

  row = _rankingBlockCompact(batch, sheetId, row, {
    title: `TOP BAIRRISTAS SEMANAL · ${bairristaRk.weekBounds.start}`,
    hint: 'hybrid score · semana em curso',
    columns: bairristaColumns,
    items: bairristaRk.weekly.map(x => ({ render: bairristaRender(x) })),
  });
  row = _rankingBlockCompact(batch, sheetId, row, {
    title: `TOP BAIRRISTAS MENSAL · ${bairristaRk.monthBounds.start}`,
    hint: 'hybrid score · mês em curso',
    columns: bairristaColumns,
    items: bairristaRk.monthly.map(x => ({ render: bairristaRender(x) })),
  });
  row = _rankingBlockCompact(batch, sheetId, row, {
    title: 'TOP BAIRRISTAS ALL-TIME',
    hint: 'acumulado desde sempre',
    columns: bairristaColumns,
    items: bairristaRk.allTime.map(x => ({ render: bairristaRender(x) })),
  });

  if (bairristaRk.streaks.length) {
    row = _rankingBlockCompact(batch, sheetId, row, {
      title: 'TOP STREAKS',
      hint: 'semanas consecutivas com material',
      columns: ['#', 'Nome', 'Streak'],
      items: bairristaRk.streaks.map(x => ({
        render: [bodyBoldCell(x.display_name || '—'), numCell(x.streak_len || 0, NUM_FMT.INT)],
      })),
    });
  }

  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Resumo & Rankings');
  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncResumo };
