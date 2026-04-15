'use strict';
/**
 * Tab Dashboard — central de comando RedWood.
 *
 * Blocos (topo → fundo):
 *   1. Header premium (título + período + timestamp)
 *   2. KPI strip principal (4 cards: Saídas, Win Rate, Lucro €, K/D)
 *   3. KPI strip secundário (4 cards: Entregas, Stock €, Kills, Material Perdido)
 *   4. Destaques da semana (top performer por eixo)
 *   5. Tendência vs semana anterior (comparativo com delta colorido)
 *   6. Stock por categoria (breakdown)
 *   7. Alertas automáticos
 *   8. Footer com assinatura
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, mutedCell, captionCell, numCell, formatDelta } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  rankingBlock, alertBox, footerBlock, setWidths,
} = require('./_common');
const {
  getDashboardKPIs, getTopMovers, getTrending, getAlerts, getStockByCategory,
} = require('../queries');

const COL_COUNT = 12;

function _deltaCard(current, previous, { kind = 'pct', label = '' } = {}) {
  const { value, direction, arrow } = formatDelta(previous, current, kind);
  const pctText = kind === 'pct' ? `${arrow} ${(value * 100).toFixed(1)}%` : `${arrow} ${value >= 0 ? '+' : ''}${value}`;
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
    title:    'Dashboard · Firma RedWood',
    subtitle: `panorama operacional · semana ${k.weekBounds.start} → ${k.weekBounds.end}`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── 2. KPI strip principal ───────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'PANORAMA DA SEMANA', hint: 'últimos 7 dias', columnCount: COL_COUNT,
  });

  const d_net    = _deltaCard(k.netWeek, k.netPrevWeek);
  const d_kills  = _deltaCard(k.killsWeek, k.killsPrevWeek);
  const winRate  = k.winRate || 0;

  row = kpiStrip(batch, sheetId, row, [
    { label: 'Saídas',     value: k.saidasTotal, numberFormat: NUM_FMT.INT,
      delta: `${k.saidasWins}V · ${k.saidasLosses}D`, deltaDirection: 'flat' },
    { label: 'Win Rate',   value: winRate, numberFormat: NUM_FMT.PCT,
      delta: winRate >= 0.5 ? 'saldo positivo' : 'abaixo do par', deltaDirection: winRate >= 0.5 ? 'up' : 'down' },
    { label: 'Lucro Líq.', value: Number(k.netWeek) || 0, numberFormat: NUM_FMT.EURO,
      delta: d_net.hint, deltaDirection: d_net.direction },
    { label: 'K/D Org',    value: Number(k.kdOrg) || 0, numberFormat: NUM_FMT.KD,
      delta: `${k.killsWeek}k · ${k.deathsWeek}d`, deltaDirection: 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── 3. KPI strip secundário ──────────────────────────────────────────────
  const d_entregas = _deltaCard(k.weekEntradas, k.prevEntradas);

  row = kpiStrip(batch, sheetId, row, [
    { label: 'Entregas',       value: k.weekEntradas, numberFormat: NUM_FMT.INT,
      delta: d_entregas.hint, deltaDirection: d_entregas.direction },
    { label: 'Valor Stock',    value: Number(k.stockValue) || 0, numberFormat: NUM_FMT.EURO,
      delta: `${k.stockQty} unidades em stock`, deltaDirection: 'flat' },
    { label: 'Kills Semana',   value: k.killsWeek, numberFormat: NUM_FMT.INT,
      delta: d_kills.hint, deltaDirection: d_kills.direction },
    { label: 'Material Perd.', value: Number(k.lostMaterial) || 0, numberFormat: NUM_FMT.EURO,
      delta: `devolvido: ${Math.round(Number(k.returnedMaterial) || 0)} €`, deltaDirection: 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── 4. Destaques ─────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'DESTAQUES DA SEMANA', hint: 'top performers', columnCount: COL_COUNT,
  });

  const fmtMover = (r) => r ? `${r.display_name} · ${Number(r.value).toLocaleString('pt-PT')}` : '—';
  const highlights = [
    { icon: '🏆', label: 'Top Contributor (entregas)', value: fmtMover(movers.topEntregas[0]), unit: 'un.' },
    { icon: '🎯', label: 'Top Killer',                  value: fmtMover(movers.topKills[0]),    unit: 'kills' },
    { icon: '💰', label: 'Top Líder por Lucro',         value: movers.topProfit[0] ? `${movers.topProfit[0].display_name} · ${Math.round(Number(movers.topProfit[0].value)).toLocaleString('pt-PT')} €` : '—', unit: '' },
    { icon: '📍', label: 'Spot Mais Rentável',          value: k.topSpotProfit ? `${k.topSpotProfit.spot} · ${Math.round(Number(k.topSpotProfit.total_net_value)).toLocaleString('pt-PT')} €` : '—', unit: '' },
    { icon: '⚠',  label: 'Spot Mais Perigoso',          value: k.topSpotDanger ? `${k.topSpotDanger.spot} · ${k.topSpotDanger.our_deaths} mortes` : '—', unit: '' },
  ];
  for (const h of highlights) {
    const lineCells = [
      cell(h.icon, { bg: COLOR.BG_APP, font: { fontFamily: 'Inter', fontSize: 13 }, align: 'CENTER', vAlign: 'MIDDLE' }),
      bodyCell(h.label, { font: { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.GRAY_LIGHT }, align: 'LEFT' }),
    ];
    for (let i = 2; i < COL_COUNT - 1; i++) lineCells.push(cell('', { bg: COLOR.BG_APP }));
    lineCells.push(bodyBoldCell(h.value, { align: 'RIGHT' }));
    batch.updateCells(sheetId, row, 0, [lineCells]);
    batch.mergeCells(sheetId, row, row + 1, 1, COL_COUNT - 1);
    batch.setRowHeight(sheetId, row, 22);
    row += 1;
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── 5. Tendência ─────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'TENDÊNCIA', hint: 'esta semana vs anterior', columnCount: COL_COUNT,
  });

  const trendHeaders = ['Métrica', 'Esta Semana', 'Semana Anterior', 'Δ Absoluto', 'Δ %', 'Direcção'];
  row = tableHeader(batch, sheetId, row, trendHeaders.concat(Array(COL_COUNT - trendHeaders.length).fill('')));

  const trendRows = [
    ['Saídas',     trend.saidas,   NUM_FMT.INT],
    ['Vitórias',   trend.wins,     NUM_FMT.INT],
    ['Kills',      trend.kills,    NUM_FMT.INT],
    ['Mortes',     trend.deaths,   NUM_FMT.INT],
    ['Lucro (€)',  trend.net,      NUM_FMT.EURO],
    ['Bruto (€)',  trend.gross,    NUM_FMT.EURO],
    ['Perdido (€)',trend.lost,     NUM_FMT.EURO],
    ['Entregas',   trend.entregas, NUM_FMT.INT],
  ].map(([label, series, fmt]) => {
    const cur = Number(series.current) || 0;
    const prev = Number(series.previous) || 0;
    const absDelta = cur - prev;
    const { value: pctVal, direction, arrow } = formatDelta(prev, cur, 'pct');
    const deltaFont = direction === 'up' ? { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.GREEN_DEEP }
                    : direction === 'down' ? { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.RED_SIGNAL }
                    : { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY };
    const cells = [
      bodyCell(label),
      numCell(cur, fmt),
      numCell(prev, fmt, { font: { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY } }),
      numCell(absDelta, fmt.pattern.includes('€') ? NUM_FMT.EURO_DELTA : NUM_FMT.INT_DELTA, { font: deltaFont }),
      numCell(pctVal, NUM_FMT.PCT_DELTA, { font: deltaFont }),
      cell(arrow, { bg: COLOR.BG_APP, font: deltaFont, align: 'CENTER', vAlign: 'MIDDLE' }),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, trendRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── 6. Stock por categoria ───────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'STOCK POR CATEGORIA', hint: `${byCat.length} categorias activas`, columnCount: COL_COUNT,
  });

  const catHeaders = ['Categoria', 'Nº Itens', 'Quantidade', 'Valor (€)', '% do Total'];
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
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, catRows);

  // ── 7. Alertas ───────────────────────────────────────────────────────────
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');
  row = sectionHeader(batch, sheetId, row, {
    title: 'ALERTAS', hint: alerts.length ? `${alerts.length} itens` : 'tudo sob controlo', columnCount: COL_COUNT,
  });

  if (alerts.length === 0) {
    row = alertBox(batch, sheetId, row, { kind: 'success', message: 'Sem alertas — operação estável.', columnCount: COL_COUNT });
  } else {
    for (const a of alerts.slice(0, 6)) {
      row = alertBox(batch, sheetId, row, { kind: a.kind, message: a.message, columnCount: COL_COUNT });
    }
  }

  // ── 8. Footer ────────────────────────────────────────────────────────────
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Dashboard');

  // Column widths — 12 colunas de ~100px cada
  const widths = [140, 110, 110, 110, 90, 70, 90, 90, 90, 90, 90, 110];
  setWidths(batch, sheetId, widths);

  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncDashboard };
