'use strict';
/**
 * Tab Spots — análise agregada por spot com KPI bar + banding.
 */

const { COLOR, NUM_FMT, bodyCell, numCell, pillCell, conditionalGradient, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getSpotsFull } = require('../queries');

const HEADERS = [
  'Spot', 'Saídas', 'V', 'D', 'E', 'N/C', 'Winrate',
  'Kills', 'Mortes', 'K/D',
  'Bruto', 'Líquido', 'Perdido', 'Melhor Nome', 'Última Saída',
];

function tierPill(winRate) {
  if (winRate >= 0.7) return pillCell('PREMIUM', COLOR.GREEN_DEEP);
  if (winRate >= 0.5) return pillCell('SÓLIDO', COLOR.YELLOW_DEEP);
  if (winRate >= 0.3) return pillCell('MÉDIO', COLOR.GRAY_DARK);
  return pillCell('FRACO', COLOR.RED_DEEP);
}

async function syncSpots(batch, sheetId) {
  const rows = await getSpotsFull();
  const COL_COUNT = HEADERS.length;

  const totalSaidas = rows.reduce((a, r) => a + (r.total_saidas || 0), 0);
  const totalNet = rows.reduce((a, r) => a + Number(r.total_net_value || 0), 0);
  const bestSpot = rows[0]?.spot || '—';

  let row = writeHeader(batch, sheetId, 'Spots · Ponto dos Spots', COL_COUNT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Spots Activos', value: rows.length, fmt: NUM_FMT.INT },
    { label: 'Total Saídas',  value: totalSaidas, fmt: NUM_FMT.INT },
    { label: 'Net Total',     value: totalNet,    fmt: NUM_FMT.EURO },
    { label: 'Top Spot',      value: bestSpot,    fmt: null },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(s => {
    const wr = Number(s.win_rate) || 0;
    return [
      bodyCell(s.spot || '—'),
      numCell(s.total_saidas, NUM_FMT.INT),
      numCell(s.wins, NUM_FMT.INT),
      numCell(s.losses, NUM_FMT.INT),
      numCell(s.draws, NUM_FMT.INT),
      numCell(s.no_conflict_runs, NUM_FMT.INT),
      tierPill(wr),
      numCell(s.our_kills, NUM_FMT.INT),
      numCell(s.our_deaths, NUM_FMT.INT),
      numCell(Number(s.kd), NUM_FMT.DEC),
      numCell(Number(s.total_gross_value), NUM_FMT.EURO),
      numCell(Number(s.total_net_value), NUM_FMT.EURO),
      numCell(Number(s.total_lost_value), NUM_FMT.EURO),
      bodyCell(s.best_member_name || '—'),
      bodyCell(s.last_saida_date ? new Date(s.last_saida_date).toISOString().split('T')[0] : '—'),
    ];
  });

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  batch.addRule(conditionalGradient(sheetId, firstDataRow, 9, firstDataRow + dataRows.length, 10, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
  batch.addRule(conditionalLessThan(sheetId, firstDataRow, 11, firstDataRow + dataRows.length, 12, 0, COLOR.RED_SIGNAL_SOFT));
  batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 11, firstDataRow + dataRows.length, 12, 1000, COLOR.GREEN_SOFT));

  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT);

  setWidths(batch, sheetId, [140, 70, 50, 50, 50, 55, 90, 60, 65, 55, 90, 95, 85, 140, 100]);
}

module.exports = { syncSpots };
