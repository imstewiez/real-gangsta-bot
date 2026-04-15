'use strict';
/**
 * Tab Kills — kill log com KPIs operacionais e tabela limpa.
 */

const { COLOR, NUM_FMT, bodyCell, bodyBoldCell, captionCell, mutedCell, numCell } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths,
} = require('./_common');
const { getKillsFull, getKillsKPIs } = require('../queries');

const HEADERS = [
  'Data/Hora', 'Killer', 'Vítima', 'Facção', 'Spot', 'Saída', 'Confirmado', 'Notas',
];
const COL_COUNT = HEADERS.length;

function fmtDT(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 16); } catch { return String(d); }
}

async function syncKills(batch, sheetId) {
  const [kpi, rows] = await Promise.all([getKillsKPIs(), getKillsFull(1000)]);

  let row = headerBlock(batch, sheetId, {
    title: 'Kills · Quem Pesou na Rua',
    subtitle: `${kpi.total} kills registadas · ${kpi.week} esta semana`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: 'PANORAMA DE KILLS', hint: 'all-time + semana', columnCount: COL_COUNT,
  });

  const topKillerName   = kpi.topKiller   ? `${kpi.topKiller.display_name}` : '—';
  const topFactionName  = kpi.topFaction  ? `${kpi.topFaction.victim_faction}` : '—';
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Total',       value: kpi.total,          numberFormat: NUM_FMT.INT, delta: 'all-time', deltaDirection: 'flat' },
    { label: 'Esta Semana', value: kpi.week,           numberFormat: NUM_FMT.INT, delta: `${kpi.week > 0 ? '▲ activa' : '— calma'}`, deltaDirection: kpi.week > 0 ? 'up' : 'flat' },
    { label: 'Top Killer',  value: topKillerName,      numberFormat: null,        delta: kpi.topKiller ? `${kpi.topKiller.kills} kills` : '—', deltaDirection: 'up' },
    { label: 'Top Facção',  value: topFactionName,     numberFormat: null,        delta: kpi.topFaction ? `${kpi.topFaction.n} vítimas` : '—', deltaDirection: 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  row = sectionHeader(batch, sheetId, row, {
    title: 'KILL LOG', hint: 'mais recentes primeiro · filtros activos', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);

  const dataRows = rows.map(k => [
    bodyCell(fmtDT(k.created_at)),
    bodyBoldCell(k.killer_name || '—'),
    bodyCell(k.victim_name || '—'),
    captionCell(k.victim_faction || '—'),
    bodyCell(k.spot || '—'),
    k.saida_id ? bodyCell(`#${k.saida_id}`) : mutedCell('—'),
    captionCell(k.confirmed_by_name || '—'),
    bodyCell(k.notes || '', { wrap: true }),
  ]);
  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Kills');

  setWidths(batch, sheetId, [140, 160, 160, 130, 140, 70, 160, 260]);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncKills };
