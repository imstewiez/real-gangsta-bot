'use strict';
/**
 * Tab Oficiais — vista focada em oficiais + chefia, com KPI + banding.
 */

const { COLOR, NUM_FMT, bodyCell, numCell, pillCell, conditionalGradient } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getMembersFull } = require('../queries');

const HEADERS = [
  'Nome', 'Role', 'Saídas', 'W', 'L', 'Winrate',
  'Kills', 'Mortes', 'K/D', 'MVPs',
  'Lucro', 'Return', 'Surv', 'Última Saída',
];

function rolePill(role) {
  if (role === 'chefia') return pillCell('CHEFIA', COLOR.RED_DEEP);
  if (role === 'oficial') return pillCell('OFICIAL', COLOR.RED_BLOOD);
  return bodyCell(role || '—');
}

function fmtDate(d) { try { return d ? new Date(d).toISOString().split('T')[0] : '—'; } catch { return '—'; } }

const OFICIAL_ROLES = new Set(['oficial', 'chefia']);

async function syncOficiais(batch, sheetId) {
  const all = await getMembersFull();
  const rows = all.filter(m => OFICIAL_ROLES.has(m.role));
  const COL_COUNT = HEADERS.length;

  const totalKills = rows.reduce((a, m) => a + (m.kills || 0), 0);
  const totalMVPs = rows.reduce((a, m) => a + (m.mvps || 0), 0);
  const avgKD = rows.length ? rows.reduce((a, m) => a + Number(m.kd || 0), 0) / rows.length : 0;

  let row = writeHeader(batch, sheetId, 'Oficiais · Núcleo da Firma', COL_COUNT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Oficiais',  value: rows.length, fmt: NUM_FMT.INT },
    { label: 'Kills',     value: totalKills,  fmt: NUM_FMT.INT },
    { label: 'MVPs',      value: totalMVPs,   fmt: NUM_FMT.INT },
    { label: 'K/D Médio', value: avgKD,       fmt: NUM_FMT.DEC },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(m => {
    const winRate = m.saidas_total > 0 ? m.wins / m.saidas_total : 0;
    return [
      bodyCell(m.display_name || '—'),
      rolePill(m.role),
      numCell(m.saidas_total, NUM_FMT.INT),
      numCell(m.wins, NUM_FMT.INT),
      numCell(m.losses, NUM_FMT.INT),
      numCell(winRate, NUM_FMT.PCT),
      numCell(m.kills, NUM_FMT.INT),
      numCell(m.deaths, NUM_FMT.INT),
      numCell(Number(m.kd), NUM_FMT.DEC),
      numCell(m.mvps, NUM_FMT.INT),
      numCell(Number(m.profit), NUM_FMT.EURO),
      numCell(Number(m.return_rate) / 100, NUM_FMT.PCT),
      numCell(Number(m.survival_rate) / 100, NUM_FMT.PCT),
      bodyCell(fmtDate(m.last_saida)),
    ];
  });

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  batch.addRule(conditionalGradient(sheetId, firstDataRow, 5, firstDataRow + dataRows.length, 6, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
  batch.addRule(conditionalGradient(sheetId, firstDataRow, 8, firstDataRow + dataRows.length, 9, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT);

  setWidths(batch, sheetId, [160, 90, 60, 45, 45, 80, 60, 65, 55, 60, 95, 75, 70, 95]);
}

module.exports = { syncOficiais };
