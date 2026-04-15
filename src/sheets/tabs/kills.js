'use strict';
/**
 * Tab Kills — kill log com KPI bar premium + banding.
 */

const { COLOR, NUM_FMT, bodyCell, numCell } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getKillsFull, getKillsKPIs } = require('../queries');

const HEADERS = [
  'Data/Hora', 'Killer', 'Vítima', 'Facção', 'Spot', 'Saída', 'Confirmado', 'Notas',
];

function fmtDT(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 16); } catch { return String(d); }
}

async function syncKills(batch, sheetId) {
  const kpi = await getKillsKPIs();
  const rows = await getKillsFull(1000);
  const COL_COUNT = HEADERS.length;

  let row = writeHeader(batch, sheetId, 'Kills · Quem Pesou na Rua', COL_COUNT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Total',         value: kpi.total, fmt: NUM_FMT.INT },
    { label: 'Esta Semana',   value: kpi.week,  fmt: NUM_FMT.INT },
    { label: 'Top Killer',    value: kpi.topKiller ? `${kpi.topKiller.display_name} (${kpi.topKiller.kills})` : '—', fmt: null },
    { label: 'Top Facção',    value: kpi.topFaction ? `${kpi.topFaction.victim_faction} (${kpi.topFaction.n})` : '—', fmt: null },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(k => [
    bodyCell(fmtDT(k.created_at)),
    bodyCell(k.killer_name || '—'),
    bodyCell(k.victim_name || '—'),
    bodyCell(k.victim_faction || '—'),
    bodyCell(k.spot || '—'),
    k.saida_id ? bodyCell(`#${k.saida_id}`) : bodyCell('—'),
    bodyCell(k.confirmed_by_name || '—'),
    bodyCell(k.notes || '', { wrap: true }),
  ]);

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT);

  setWidths(batch, sheetId, [140, 160, 160, 130, 140, 70, 160, 260]);
}

module.exports = { syncKills };
