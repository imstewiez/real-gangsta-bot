'use strict';
/**
 * Tab Inventário — stock actual com KPI bar + pills de estado.
 */

const { COLOR, NUM_FMT, bodyCell, numCell, pillCell, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getInventoryFull } = require('../queries');

const HEADERS = [
  'Item', 'Categoria', 'Qtd', 'Un.',
  'Valor Unit.', 'Valor Total',
  'Entradas', 'Saídas', 'Última Mov.', 'Estado',
];

function statePill(balance) {
  if (balance === 0) return pillCell('ESGOTADO', COLOR.RED_DEEP);
  if (balance <= 3) return pillCell('CRÍTICO', COLOR.RED_BLOOD);
  if (balance <= 10) return pillCell('BAIXO', COLOR.YELLOW_DEEP);
  return pillCell('NORMAL', COLOR.GREEN_DEEP);
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 16); } catch { return String(d); }
}

async function syncInventory(batch, sheetId) {
  const rows = await getInventoryFull();
  const COL_COUNT = HEADERS.length;

  const totalValue = rows.reduce((a, r) => a + Number(r.value_total || 0), 0);
  const critical = rows.filter(r => (r.balance || 0) <= 3).length;
  const totalItems = rows.length;

  let row = writeHeader(batch, sheetId, 'Inventário · Stock da Casa', COL_COUNT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Items',       value: totalItems, fmt: NUM_FMT.INT },
    { label: 'Valor Stock', value: totalValue, fmt: NUM_FMT.EURO },
    { label: 'Críticos',    value: critical,   fmt: NUM_FMT.INT },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(i => [
    bodyCell(i.name),
    bodyCell(i.category || '—'),
    numCell(i.balance, NUM_FMT.INT),
    bodyCell(i.unit || 'un'),
    numCell(Number(i.estimated_value), NUM_FMT.EURO_DEC),
    numCell(Number(i.value_total), NUM_FMT.EURO),
    numCell(i.total_in || 0, NUM_FMT.INT),
    numCell(i.total_out || 0, NUM_FMT.INT),
    bodyCell(fmtDate(i.last_movement)),
    statePill(i.balance || 0),
  ]);

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  batch.addRule(conditionalLessThan(sheetId, firstDataRow, 2, firstDataRow + dataRows.length, 3, 4, COLOR.RED_SIGNAL_SOFT));
  batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 2, firstDataRow + dataRows.length, 3, 50, COLOR.GREEN_SOFT));

  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT);

  setWidths(batch, sheetId, [200, 140, 60, 55, 90, 100, 75, 75, 150, 100]);
}

module.exports = { syncInventory };
