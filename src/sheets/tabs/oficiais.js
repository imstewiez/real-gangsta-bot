'use strict';
/**
 * Tab Oficiais — núcleo operacional da firma com KPIs agregados + tabela
 * rica com win rate, K/D, MVPs, profit contribution.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, numCell, badgeCell,
  conditionalGradient, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths,
} = require('./_common');
const { getMembersFull } = require('../queries');

const HEADERS = [
  'Nome', 'Role', 'Saídas', 'V', 'D', 'Win Rate',
  'Kills', 'Mortes', 'K/D', 'MVPs',
  'Lucro Gerado', 'Return', 'Surv', 'Última Saída',
];
const COL_COUNT = HEADERS.length;

function rolePill(role) {
  if (role === 'chefia')  return badgeCell('CHEFIA',  COLOR.RED_DEEP);
  if (role === 'oficial') return badgeCell('OFICIAL', COLOR.RED_BLOOD);
  return bodyCell(role || '—');
}

function fmtDate(d) { try { return d ? new Date(d).toISOString().split('T')[0] : '—'; } catch { return '—'; } }

const OFICIAL_ROLES = new Set(['oficial', 'chefia']);

async function syncOficiais(batch, sheetId) {
  const all = await getMembersFull();
  const rows = all.filter(m => OFICIAL_ROLES.has(m.role));

  const totalKills   = rows.reduce((a, m) => a + (m.kills || 0), 0);
  const totalMVPs    = rows.reduce((a, m) => a + (m.mvps || 0), 0);
  const totalProfit  = rows.reduce((a, m) => a + Number(m.profit || 0), 0);
  const totalSaidas  = rows.reduce((a, m) => a + (m.saidas_total || 0), 0);
  const totalWins    = rows.reduce((a, m) => a + (m.wins || 0), 0);
  const avgKD        = rows.length ? rows.reduce((a, m) => a + Number(m.kd || 0), 0) / rows.length : 0;
  const collectiveWR = totalSaidas > 0 ? totalWins / totalSaidas : 0;

  let row = headerBlock(batch, sheetId, {
    title: 'Oficiais · Núcleo da Firma',
    subtitle: `${rows.length} oficiais activos — performance agregada`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: 'PERFORMANCE AGREGADA', hint: 'all-time', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Oficiais',      value: rows.length,    numberFormat: NUM_FMT.INT, delta: `${rows.filter(m => m.role === 'chefia').length} chefia`, deltaDirection: 'flat' },
    { label: 'Win Rate',      value: collectiveWR,   numberFormat: NUM_FMT.PCT, delta: `${totalWins}V em ${totalSaidas} saídas`, deltaDirection: collectiveWR >= 0.5 ? 'up' : 'down' },
    { label: 'K/D Médio',     value: avgKD,          numberFormat: NUM_FMT.KD, delta: `${totalKills} kills totais`, deltaDirection: avgKD >= 1 ? 'up' : 'flat' },
    { label: 'Lucro Gerado',  value: totalProfit,    numberFormat: NUM_FMT.EURO, delta: `${totalMVPs} MVPs`, deltaDirection: totalProfit > 0 ? 'up' : 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  row = sectionHeader(batch, sheetId, row, {
    title: 'ROSTER OFICIAIS', hint: 'ordenado por K/D', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  rows.sort((a, b) => Number(b.kd || 0) - Number(a.kd || 0));

  const dataRows = rows.map(m => {
    const winRate = m.saidas_total > 0 ? m.wins / m.saidas_total : 0;
    return [
      bodyBoldCell(m.display_name || '—'),
      rolePill(m.role),
      numCell(m.saidas_total, NUM_FMT.INT),
      numCell(m.wins, NUM_FMT.INT),
      numCell(m.losses, NUM_FMT.INT),
      numCell(winRate, NUM_FMT.PCT),
      numCell(m.kills, NUM_FMT.INT),
      numCell(m.deaths, NUM_FMT.INT),
      numCell(Number(m.kd), NUM_FMT.KD),
      numCell(m.mvps, NUM_FMT.INT),
      numCell(Number(m.profit), NUM_FMT.EURO),
      numCell(Number(m.return_rate) / 100, NUM_FMT.PCT),
      numCell(Number(m.survival_rate) / 100, NUM_FMT.PCT),
      bodyCell(fmtDate(m.last_saida)),
    ];
  });

  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  if (dataRows.length) {
    const N = dataRows.length;
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 5, firstDataRow + N, 6,  COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 8, firstDataRow + N, 9,  COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 10, firstDataRow + N, 11, 1000, COLOR.GREEN_SOFT));
    batch.addRule(conditionalLessThan(sheetId, firstDataRow, 10, firstDataRow + N, 11, -500, COLOR.RED_SIGNAL_SOFT));
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Oficiais');

  setWidths(batch, sheetId, [170, 90, 60, 40, 40, 85, 55, 60, 55, 60, 110, 75, 70, 95]);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncOficiais };
