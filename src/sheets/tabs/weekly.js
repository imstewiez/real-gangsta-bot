'use strict';
/**
 * Tab Resumo Semanal — comparativo premium esta semana vs anterior.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, mutedCell, numCell, formatDelta } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths,
} = require('./_common');
const { getWeeklySummary, getTrending } = require('../queries');

const COL_COUNT = 8;

async function syncWeekly(batch, sheetId) {
  const [{ current, previous, bounds }, trend] = await Promise.all([
    getWeeklySummary(),
    getTrending(),
  ]);

  let row = headerBlock(batch, sheetId, {
    title: 'Resumo Semanal · Peso da Semana',
    subtitle: `semana actual ${bounds.current.start} → ${bounds.current.end}  ·  anterior ${bounds.previous.start} → ${bounds.previous.end}`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── KPI strip: pilares da semana ─────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'PILARES DA SEMANA', hint: `${current.ops || 0} saídas concluídas`, columnCount: COL_COUNT,
  });

  const winRate = (current.ops || 0) > 0 ? (current.wins || 0) / current.ops : 0;
  const kd = (current.deaths || 0) > 0 ? (current.kills || 0) / current.deaths : (current.kills || 0);
  const dNet = formatDelta(Number(previous.net) || 0, Number(current.net) || 0, 'pct');
  const dKills = formatDelta(previous.kills || 0, current.kills || 0, 'pct');

  row = kpiStrip(batch, sheetId, row, [
    { label: 'Win Rate',     value: winRate, numberFormat: NUM_FMT.PCT,
      delta: `${current.wins || 0}V · ${current.losses || 0}D · ${current.draws || 0}E`,
      deltaDirection: 'flat' },
    { label: 'K/D',          value: kd, numberFormat: NUM_FMT.KD,
      delta: `${current.kills || 0}k · ${current.deaths || 0}d`,
      deltaDirection: dKills.direction },
    { label: 'Lucro Líq.',   value: Number(current.net) || 0, numberFormat: NUM_FMT.EURO,
      delta: `${dNet.arrow} ${(dNet.value * 100).toFixed(1)}% vs anterior`,
      deltaDirection: dNet.direction },
    { label: 'Entregas',     value: current.entregas || 0, numberFormat: NUM_FMT.INT,
      delta: `vendas: ${current.vendas || 0}`,
      deltaDirection: 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Comparativo detalhado ────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'COMPARATIVO DETALHADO', hint: 'esta semana vs anterior', columnCount: COL_COUNT,
  });

  const headers = ['Métrica', 'Esta Semana', 'Semana Anterior', 'Δ Absoluto', 'Δ %', ''];
  row = tableHeader(batch, sheetId, row, headers.concat(Array(COL_COUNT - headers.length).fill('')));

  const rows = [
    { label: 'Saídas',             cur: current.ops       || 0, prev: previous.ops       || 0, fmt: NUM_FMT.INT },
    { label: 'Vitórias',           cur: current.wins      || 0, prev: previous.wins      || 0, fmt: NUM_FMT.INT },
    { label: 'Derrotas',           cur: current.losses    || 0, prev: previous.losses    || 0, fmt: NUM_FMT.INT },
    { label: 'Empates',            cur: current.draws     || 0, prev: previous.draws     || 0, fmt: NUM_FMT.INT },
    { label: 'Kills',              cur: current.kills     || 0, prev: previous.kills     || 0, fmt: NUM_FMT.INT },
    { label: 'Mortes',             cur: current.deaths    || 0, prev: previous.deaths    || 0, fmt: NUM_FMT.INT },
    { label: 'Material Fornecido', cur: Number(current.supplied) || 0, prev: Number(previous.supplied) || 0, fmt: NUM_FMT.EURO },
    { label: 'Material Devolvido', cur: Number(current.returned) || 0, prev: Number(previous.returned) || 0, fmt: NUM_FMT.EURO },
    { label: 'Lucro Bruto',        cur: Number(current.gross)    || 0, prev: Number(previous.gross)    || 0, fmt: NUM_FMT.EURO },
    { label: 'Lucro Líquido',      cur: Number(current.net)      || 0, prev: Number(previous.net)      || 0, fmt: NUM_FMT.EURO },
    { label: 'Material Perdido',   cur: Number(trend.lost.current),   prev: Number(trend.lost.previous), fmt: NUM_FMT.EURO },
    { label: 'Entregas (itens)',   cur: current.entregas  || 0, prev: null, fmt: NUM_FMT.INT },
    { label: 'Vendas (itens)',     cur: current.vendas    || 0, prev: null, fmt: NUM_FMT.INT },
  ].map(m => {
    const hasPrev = m.prev !== null;
    const absDelta = hasPrev ? m.cur - m.prev : 0;
    const { value: pctVal, direction, arrow } = formatDelta(m.prev || 0, m.cur, 'pct');
    const deltaFont = direction === 'up' ? { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.GREEN_DEEP }
                    : direction === 'down' ? { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.RED_SIGNAL }
                    : { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY };

    const isEuro = m.fmt.pattern && m.fmt.pattern.includes('€');
    const cells = [
      bodyBoldCell(m.label),
      numCell(m.cur, m.fmt),
      hasPrev ? numCell(m.prev, m.fmt, { font: { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY } })
              : mutedCell('—', { align: 'RIGHT' }),
      hasPrev ? numCell(absDelta, isEuro ? NUM_FMT.EURO_DELTA : NUM_FMT.INT_DELTA, { font: deltaFont })
              : mutedCell('—', { align: 'RIGHT' }),
      hasPrev ? numCell(pctVal, NUM_FMT.PCT_DELTA, { font: deltaFont })
              : mutedCell('—', { align: 'RIGHT' }),
      cell(hasPrev ? arrow : '—', { bg: COLOR.BG_APP, font: deltaFont, align: 'CENTER', vAlign: 'MIDDLE' }),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });

  row = tableBody(batch, sheetId, row, rows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Resumo Semanal');

  setWidths(batch, sheetId, [200, 120, 130, 120, 100, 70, 80, 80]);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncWeekly };
