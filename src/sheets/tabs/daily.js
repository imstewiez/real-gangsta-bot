'use strict';
/**
 * Tab Resumo Diário — últimos 14 dias com pills de destaque.
 */

const { COLOR, NUM_FMT, bodyCell, numCell, pillCell, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getDailyBreakdown } = require('../queries');

const HEADERS = [
  'Data', 'Saídas', 'Kills', 'Mortes', 'Líquido',
  'Entradas', 'Vendas', 'Destaque',
];

function destaquePill(row) {
  if (row.ops === 0 && Number(row.entradas) === 0 && Number(row.vendas) === 0) {
    return bodyCell('—', { align: 'CENTER' });
  }
  if (Number(row.net) > 500) return pillCell('BOM DIA', COLOR.GREEN_DEEP);
  if (Number(row.net) < -200) return pillCell('A PERDER', COLOR.RED_DEEP);
  if ((row.kills || 0) > 5) return pillCell('PESOU', COLOR.GOLD);
  if ((row.deaths || 0) > 3) return pillCell('DIA CARO', COLOR.RED_BLOOD);
  return bodyCell('—', { align: 'CENTER' });
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().split('T')[0]; } catch { return String(d); }
}

async function syncDaily(batch, sheetId) {
  const rows = await getDailyBreakdown(14);
  const COL_COUNT = HEADERS.length;

  const totalNet = rows.reduce((a, r) => a + Number(r.net || 0), 0);
  const totalOps = rows.reduce((a, r) => a + (r.ops || 0), 0);
  const totalKills = rows.reduce((a, r) => a + (r.kills || 0), 0);

  let row = writeHeader(batch, sheetId, 'Resumo Diário · Balanço da Rua', COL_COUNT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Janela',    value: '14 dias',  fmt: null },
    { label: 'Saídas',    value: totalOps,   fmt: NUM_FMT.INT },
    { label: 'Kills',     value: totalKills, fmt: NUM_FMT.INT },
    { label: 'Net Total', value: totalNet,   fmt: NUM_FMT.EURO },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(d => [
    bodyCell(fmtDate(d.day)),
    numCell(d.ops, NUM_FMT.INT),
    numCell(d.kills, NUM_FMT.INT),
    numCell(d.deaths, NUM_FMT.INT),
    numCell(Number(d.net), NUM_FMT.EURO),
    numCell(Number(d.entradas), NUM_FMT.INT),
    numCell(Number(d.vendas), NUM_FMT.INT),
    destaquePill(d),
  ]);

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 4, firstDataRow + dataRows.length, 5, 0, COLOR.GREEN_SOFT));
  batch.addRule(conditionalLessThan(sheetId, firstDataRow, 4, firstDataRow + dataRows.length, 5, 0, COLOR.RED_SIGNAL_SOFT));

  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT);

  setWidths(batch, sheetId, [110, 65, 60, 65, 110, 100, 100, 120]);
}

module.exports = { syncDaily };
