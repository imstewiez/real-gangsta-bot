'use strict';
/**
 * Tab Dashboard — central de comando RedWood (v2 redesign).
 *
 * Blocos (topo → fundo):
 *   1. Header premium
 *   2. Panorama da semana — miniKPIRow 8 cards (2 rows × 4)
 *   3. Destaques da semana — tabela compacta com rankCell metálico
 *   4. Tendência — 6 métricas core com contexto médio
 *   5. Stock por categoria — breakdown com Δ vs anterior
 *   6. Alertas automáticos
 *   7. Footer
 */

const {
  COLOR,
  FONT,
  NUM_FMT,
  cell,
  bodyCell,
  bodyBoldCell,
  mutedCell,
  numCell,
  formatDelta,
  rankCell,
} = require('../theme');
const {
  headerBlock,
  sectionHeader,
  spacer,
  divider,
  miniKPIRow,
  tableHeader,
  tableBody,
  alertBox,
  footerBlock,
  totalRow,
  autoResizeAll,
  gangTitle,
} = require('./_common');
const { getDashboardKPIs, getTopMovers, getTrending, getAlerts, getStockByCategory } = require('../queries');

const COL_COUNT = 12;

function _deltaCard(current, previous, { kind = 'pct', label = '' } = {}) {
  const { value, direction, arrow } = formatDelta(previous, current, kind);
  const pctText =
    kind === 'pct' ? `${arrow} ${(value * 100).toFixed(1)}%` : `${arrow} ${value >= 0 ? '+' : ''}${value}`;
  return { hint: `${pctText} vs anterior${label ? ' · ' + label : ''}`, direction };
}

async function syncDashboard(batch, sheetId) {
  const [k, movers, trend, alerts, byCat] = await Promise.all([
    getDashboardKPIs(),
    getTopMovers(),
    getTrending(),
    getAlerts(),
    getStockByCategory(),
  ]);

  let row = 0;

  // ── 1. Header ────────────────────────────────────────────────────────────
  row = headerBlock(batch, sheetId, {
    title: gangTitle('Dashboard'),
    subtitle: `panorama operacional · semana ${k.weekBounds.start} → ${k.weekBounds.end}`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  batch.freezeRows(sheetId, row);

  // ── 2. Panorama da Semana — miniKPIRow 8 cards (2 rows de 4) ──────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'PANORAMA DA SEMANA',
    hint: 'últimos 7 dias',
    columnCount: COL_COUNT,
  });

  const d_net = _deltaCard(k.netWeek, k.netPrevWeek);
  const d_kills = _deltaCard(k.killsWeek, k.killsPrevWeek);
  const d_entregas = _deltaCard(k.weekEntradas, k.prevEntradas);
  const winRate = k.winRate || 0;

  // Row A: 4 cards
  row = miniKPIRow(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Saídas',
        value: k.saidasTotal,
        numberFormat: NUM_FMT.INT,
        delta: `${k.saidasWins}V · ${k.saidasLosses}D`,
        deltaDirection: 'flat',
      },
      {
        label: 'Win Rate',
        value: winRate,
        numberFormat: NUM_FMT.PCT,
        delta: winRate >= 0.5 ? 'saldo positivo' : 'abaixo do par',
        deltaDirection: winRate >= 0.5 ? 'up' : 'down',
      },
      {
        label: 'Lucro Líq.',
        value: Number(k.netWeek) || 0,
        numberFormat: NUM_FMT.EURO,
        delta: d_net.hint,
        deltaDirection: d_net.direction,
      },
      {
        label: 'K/D Org',
        value: Number(k.kdOrg) || 0,
        numberFormat: NUM_FMT.KD,
        delta: `${k.killsWeek}k · ${k.deathsWeek}d`,
        deltaDirection: 'flat',
      },
    ],
    COL_COUNT
  );

  // Row B: 4 cards
  row = miniKPIRow(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Entregas',
        value: k.weekEntradas,
        numberFormat: NUM_FMT.INT,
        delta: d_entregas.hint,
        deltaDirection: d_entregas.direction,
      },
      {
        label: 'Valor Stock',
        value: Number(k.stockValue) || 0,
        numberFormat: NUM_FMT.EURO,
        delta: `${k.stockQty} un. em stock`,
        deltaDirection: 'flat',
      },
      {
        label: 'Kills Semana',
        value: k.killsWeek,
        numberFormat: NUM_FMT.INT,
        delta: d_kills.hint,
        deltaDirection: d_kills.direction,
      },
      {
        label: 'Material Perd.',
        value: k.lostUnitsWeek,
        numberFormat: NUM_FMT.INT,
        delta: `devolvido: ${k.returnedUnitsWeek} un.`,
        deltaDirection: 'flat',
      },
    ],
    COL_COUNT
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── 3. Destaques da Semana — tabela compacta com rankCell ────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'DESTAQUES DA SEMANA',
    hint: 'top performers',
    columnCount: COL_COUNT,
  });

  const fmtMover = r => (r ? `${r.display_name || '—'}` : '—');
  const highlights = [
    {
      rank: 1,
      label: 'Top Contributor (entregas)',
      value: fmtMover(movers.topEntregas[0]),
      sub: movers.topEntregas[0] ? `${Number(movers.topEntregas[0].value).toLocaleString('pt-PT')} un.` : '—',
    },
    {
      rank: 1,
      label: 'Top Killer',
      value: fmtMover(movers.topKills[0]),
      sub: movers.topKills[0] ? `${movers.topKills[0].value} kills` : '—',
    },
    {
      rank: 1,
      label: 'Top Líder por Lucro',
      value: movers.topProfit[0] ? movers.topProfit[0].display_name : '—',
      sub: movers.topProfit[0] ? `${Math.round(Number(movers.topProfit[0].value)).toLocaleString('pt-PT')}€` : '—',
    },
    {
      rank: 1,
      label: 'Spot Mais Rentável',
      value: k.topSpotProfit ? k.topSpotProfit.spot : '—',
      sub: k.topSpotProfit ? `${Math.round(Number(k.topSpotProfit.total_net_value)).toLocaleString('pt-PT')}€` : '—',
    },
    {
      rank: 1,
      label: 'Spot Mais Perigoso',
      value: k.topSpotDanger ? k.topSpotDanger.spot : '—',
      sub: k.topSpotDanger ? `${k.topSpotDanger.our_deaths} mortes` : '—',
    },
  ];

  const destaqueHeaders = ['Rank', 'Categoria', 'Nome', 'Valor', 'Contexto'];
  row = tableHeader(batch, sheetId, row, destaqueHeaders.concat(Array(COL_COUNT - destaqueHeaders.length).fill('')));

  const destaqueRows = highlights.map(h => {
    const cells = [
      rankCell(h.rank),
      bodyBoldCell(h.label, { font: { ...FONT.BODY_BOLD, foregroundColor: COLOR.GRAY_LIGHT } }),
      bodyBoldCell(h.value, { align: 'LEFT' }),
      numCell(
        h.sub.includes('€') ? Number(h.sub.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')) : h.sub,
        h.sub.includes('€') ? NUM_FMT.EURO : NUM_FMT.INT
      ),
      bodyCell(h.sub, { align: 'LEFT' }),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, destaqueRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── 4. Tendência — 6 métricas core com contexto ──────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'TENDÊNCIA',
    hint: 'esta semana vs anterior · média por saída',
    columnCount: COL_COUNT,
  });

  const trendHeaders = ['Métrica', 'Esta Semana', 'Semana Ant.', 'Δ Absoluto', 'Δ %', 'Média / Saída'];
  row = tableHeader(batch, sheetId, row, trendHeaders.concat(Array(COL_COUNT - trendHeaders.length).fill('')));

  const saidasTotal = Number(trend.saidas.current) || 1;
  const trendRows = [
    ['Saídas', trend.saidas, NUM_FMT.INT, null],
    ['Vitórias', trend.wins, NUM_FMT.INT, null],
    ['Kills', trend.kills, NUM_FMT.INT, trend.kills.current / saidasTotal],
    ['Mortes', trend.deaths, NUM_FMT.INT, trend.deaths.current / saidasTotal],
    ['Lucro (€)', trend.net, NUM_FMT.EURO, trend.net.current / saidasTotal],
    ['Entregas (itens)', trend.entregas, NUM_FMT.INT, null],
  ].map(([label, series, fmt, avgPerSaida]) => {
    const cur = Number(series.current) || 0;
    const prev = Number(series.previous) || 0;
    const absDelta = cur - prev;
    const { value: pctVal, direction } = formatDelta(prev, cur, 'pct');
    const deltaFont =
      direction === 'up'
        ? { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.GREEN_DEEP }
        : direction === 'down'
          ? { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.RED_SIGNAL }
          : { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY };
    const cells = [
      bodyCell(label),
      numCell(cur, fmt),
      numCell(prev, fmt, { font: { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY } }),
      numCell(absDelta, fmt.pattern && fmt.pattern.includes('€') ? NUM_FMT.EURO_DELTA : NUM_FMT.INT_DELTA, {
        font: deltaFont,
      }),
      numCell(pctVal, NUM_FMT.PCT_DELTA, { font: deltaFont }),
      avgPerSaida !== null
        ? numCell(avgPerSaida, fmt.pattern && fmt.pattern.includes('€') ? NUM_FMT.EURO : NUM_FMT.DEC1)
        : mutedCell('—', { align: 'CENTER' }),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, trendRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── 5. Stock por categoria ───────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'STOCK POR CATEGORIA',
    hint: `${byCat.length} categorias activas`,
    columnCount: COL_COUNT,
  });

  const catHeaders = ['Categoria', 'Nº Itens', 'Quantidade', 'Valor (€)', '% do Total', 'Δ Semana'];
  row = tableHeader(batch, sheetId, row, catHeaders.concat(Array(COL_COUNT - catHeaders.length).fill('')));

  const totalCatValue = byCat.reduce((a, r) => a + Number(r.total_value || 0), 0);
  const catRows = byCat.map(r => {
    const val = Number(r.total_value) || 0;
    const pct = totalCatValue > 0 ? val / totalCatValue : 0;
    const cells = [
      bodyBoldCell(r.category || '—'),
      numCell(r.items_count, NUM_FMT.INT),
      numCell(r.total_qty, NUM_FMT.INT),
      numCell(val, NUM_FMT.EURO),
      numCell(pct, NUM_FMT.PCT),
      mutedCell('—', { align: 'CENTER' }), // placeholder para Δ (requer query histórica)
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, catRows);
  const totalItems = byCat.reduce((a, r) => a + (r.items_count || 0), 0);
  const totalQty = byCat.reduce((a, r) => a + (r.total_qty || 0), 0);
  row = totalRow(batch, sheetId, row, {
    label: 'TOTAL',
    columnCount: COL_COUNT,
    values: [
      { col: 1, value: totalItems, numberFormat: NUM_FMT.INT },
      { col: 2, value: totalQty, numberFormat: NUM_FMT.INT },
      { col: 3, value: totalCatValue, numberFormat: NUM_FMT.EURO },
      { col: 4, value: 1, numberFormat: NUM_FMT.PCT },
    ],
  });

  // ── 6. Alertas ───────────────────────────────────────────────────────────
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');
  row = sectionHeader(batch, sheetId, row, {
    title: 'ALERTAS',
    hint: alerts.length ? `${alerts.length} itens` : 'tudo sob controlo',
    columnCount: COL_COUNT,
  });

  if (alerts.length === 0) {
    row = alertBox(batch, sheetId, row, {
      kind: 'success',
      message: 'Sem alertas — tudo sob controlo.',
      columnCount: COL_COUNT,
    });
  } else {
    for (const a of alerts.slice(0, 6)) {
      row = alertBox(batch, sheetId, row, { kind: a.kind, message: a.message, columnCount: COL_COUNT });
    }
  }

  // ── 7. Footer ────────────────────────────────────────────────────────────
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Dashboard');

  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncDashboard };
