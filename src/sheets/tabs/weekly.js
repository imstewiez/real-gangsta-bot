'use strict';
/**
 * Tab Resumo Semanal — comparativo esta semana vs anterior.
 */

const { COLOR, NUM_FMT, cell, bodyCell, numCell, subHeaderCell, kpiLabelCell, kpiValueCell, kpiDeltaCell } = require('../theme');
const { writeHeader, setWidths } = require('./_common');
const { getWeeklySummary } = require('../queries');

const COL_COUNT = 8;

function pctDelta(curr, prev) {
  if (!prev || prev === 0) return curr > 0 ? '▲ novo' : '—';
  const diff = curr - prev;
  const pct = (diff / Math.abs(prev)) * 100;
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
  return `${arrow} ${Math.abs(pct).toFixed(0)}%`;
}

async function syncWeekly(batch, sheetId) {
  const { current, previous, bounds } = await getWeeklySummary();

  let row = writeHeader(batch, sheetId, 'Resumo Semanal · Peso da Semana', COL_COUNT);

  // ── Subheader com as duas semanas ──
  batch.updateCells(sheetId, row, 0, [[
    subHeaderCell('MÉTRICA'),
    subHeaderCell(`SEMANA ATUAL  (${bounds.current.start} → ${bounds.current.end})`),
    cell('', { bg: COLOR.CHARCOAL }),
    subHeaderCell(`SEMANA ANTERIOR  (${bounds.previous.start} → ${bounds.previous.end})`),
    cell('', { bg: COLOR.CHARCOAL }),
    subHeaderCell('VARIAÇÃO'),
    ...Array(COL_COUNT - 6).fill(cell('', { bg: COLOR.CHARCOAL })),
  ]]);
  batch.mergeCells(sheetId, row, row + 1, 1, 3);
  batch.mergeCells(sheetId, row, row + 1, 3, 5);
  batch.setRowHeight(sheetId, row, 28);
  row += 1;

  // ── Linhas de métricas ──
  const metrics = [
    ['Saídas',               current.ops || 0,     previous.ops || 0, NUM_FMT.INT],
    ['Vitórias',             current.wins || 0,    previous.wins || 0, NUM_FMT.INT],
    ['Derrotas',             current.losses || 0,  previous.losses || 0, NUM_FMT.INT],
    ['Empates',              current.draws || 0,   previous.draws || 0, NUM_FMT.INT],
    ['Kills',                current.kills || 0,   previous.kills || 0, NUM_FMT.INT],
    ['Mortes',               current.deaths || 0,  previous.deaths || 0, NUM_FMT.INT],
    ['Material Fornecido',   Number(current.supplied) || 0, Number(previous.supplied) || 0, NUM_FMT.EURO],
    ['Material Devolvido',   Number(current.returned) || 0, Number(previous.returned) || 0, NUM_FMT.EURO],
    ['Lucro Bruto',          Number(current.gross) || 0,    Number(previous.gross) || 0, NUM_FMT.EURO],
    ['Lucro Líquido',        Number(current.net) || 0,      Number(previous.net) || 0, NUM_FMT.EURO],
    ['Entregas (itens)',     current.entregas || 0,  null, NUM_FMT.INT],
    ['Vendas (itens)',       current.vendas || 0,    null, NUM_FMT.INT],
    ['Itens Totais',         Number(current.weighted) || 0, null, NUM_FMT.INT],
  ];

  for (const [label, curr, prev, fmt] of metrics) {
    const delta = prev !== null ? pctDelta(curr, prev) : '—';
    const pos = prev !== null && prev !== 0 ? curr >= prev : null;

    batch.updateCells(sheetId, row, 0, [[
      cell(label, { bg: COLOR.BLACK, font: { fontSize: 11, bold: true, foregroundColor: COLOR.GRAY_LIGHT }, align: 'LEFT', vAlign: 'MIDDLE' }),
      numCell(curr, fmt),
      cell('', { bg: COLOR.BLACK }),
      prev !== null ? numCell(prev, fmt) : cell('—', { bg: COLOR.BLACK, font: { foregroundColor: COLOR.GRAY }, align: 'RIGHT', vAlign: 'MIDDLE' }),
      cell('', { bg: COLOR.BLACK }),
      kpiDeltaCell(delta, pos),
      ...Array(COL_COUNT - 6).fill(cell('', { bg: COLOR.BLACK })),
    ]]);
    batch.mergeCells(sheetId, row, row + 1, 1, 3);
    batch.mergeCells(sheetId, row, row + 1, 3, 5);
    batch.setRowHeight(sheetId, row, 24);
    row += 1;
  }

  setWidths(batch, sheetId, [200, 100, 100, 100, 100, 130, 100, 100]);
  batch.freezeRows(sheetId, 2);
}

module.exports = { syncWeekly };
