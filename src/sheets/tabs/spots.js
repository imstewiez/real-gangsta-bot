'use strict';
/**
 * Tab Spots — heatmap operacional por spot.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, mutedCell, numCell, badgeCell,
  conditionalGradient, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  rankingBlock, footerBlock, setWidths, autoResizeColumns,
} = require('./_common');
const { getSpotsFull } = require('../queries');

const HEADERS = [
  'Spot', 'Saídas', 'V', 'D', 'E', 'N/C', 'Winrate', 'Tier',
  'Kills', 'Mortes', 'K/D',
  'Bruto', 'Líquido', 'Perdido', 'Melhor Nome', 'Última',
];
const COL_COUNT = HEADERS.length;

function tierBadge(winRate) {
  if (winRate >= 0.7) return badgeCell('PREMIUM', COLOR.GREEN_DEEP);
  if (winRate >= 0.5) return badgeCell('SÓLIDO',  COLOR.YELLOW_DEEP);
  if (winRate >= 0.3) return badgeCell('MÉDIO',   COLOR.GRAY_DARK);
  return badgeCell('FRACO', COLOR.RED_DEEP);
}

async function syncSpots(batch, sheetId) {
  const rows = await getSpotsFull();

  const totalSaidas = rows.reduce((a, r) => a + (r.total_saidas || 0), 0);
  const totalNet    = rows.reduce((a, r) => a + Number(r.total_net_value || 0), 0);
  const activeSpots = rows.filter(r => (r.total_saidas || 0) > 0);
  const avgWR       = activeSpots.length ? activeSpots.reduce((a, r) => a + Number(r.win_rate || 0), 0) / activeSpots.length : 0;

  const top3 = [...rows].sort((a, b) => Number(b.total_net_value || 0) - Number(a.total_net_value || 0)).slice(0, 3);
  const flop3 = [...rows].sort((a, b) => Number(a.total_net_value || 0) - Number(b.total_net_value || 0)).slice(0, 3);

  let row = headerBlock(batch, sheetId, {
    title: 'Spots · Ponto dos Spots',
    subtitle: `${activeSpots.length} spots activos — ${totalSaidas} saídas totais`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: 'PANORAMA GERAL', hint: 'acumulado', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Spots Activos', value: activeSpots.length, numberFormat: NUM_FMT.INT, delta: `${rows.length} totais`, deltaDirection: 'flat' },
    { label: 'Saídas',        value: totalSaidas,        numberFormat: NUM_FMT.INT, delta: `média ${(totalSaidas / Math.max(activeSpots.length, 1)).toFixed(1)}/spot`, deltaDirection: 'flat' },
    { label: 'Lucro Total',   value: totalNet,           numberFormat: NUM_FMT.EURO, delta: `spots: ${activeSpots.length}`, deltaDirection: totalNet > 0 ? 'up' : 'down' },
    { label: 'Win Rate Med.', value: avgWR,              numberFormat: NUM_FMT.PCT, delta: 'média dos spots activos', deltaDirection: avgWR >= 0.5 ? 'up' : 'down' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Top 3 rentáveis ──────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'TOP 3 · MAIS RENTÁVEIS', hint: 'por lucro líquido', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['#', 'Spot', 'Saídas', 'Winrate', 'Lucro (€)', 'K/D', '', '', '', '', '', '', '', '', '', '']);
  row = rankingBlock(batch, sheetId, row, top3.map((s, i) => ({
    rank: i + 1,
    label: s.spot || '—',
    value: Number(s.total_net_value) || 0,
    valueFormat: NUM_FMT.EURO,
    sub: `${s.total_saidas} saídas · ${(Number(s.win_rate) * 100).toFixed(0)}% WR`,
  })), COL_COUNT, { labelCol: 1, valueCol: 4 });

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Flop 3 perigosos ─────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'FLOP 3 · MAIS ARRISCADOS', hint: 'por prejuízo ou mortes', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['#', 'Spot', 'Saídas', 'Mortes', 'Lucro (€)', 'K/D', '', '', '', '', '', '', '', '', '', '']);
  row = rankingBlock(batch, sheetId, row, flop3.map((s, i) => ({
    rank: i + 1,
    label: s.spot || '—',
    value: Number(s.total_net_value) || 0,
    valueFormat: NUM_FMT.EURO,
    sub: `${s.total_saidas} saídas · ${s.our_deaths} mortes`,
  })), COL_COUNT, { labelCol: 1, valueCol: 4 });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Tabela completa ──────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'TABELA COMPLETA', hint: 'todos os spots com dados', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(s => {
    const wr = Number(s.win_rate) || 0;
    return [
      bodyBoldCell(s.spot || '—'),
      numCell(s.total_saidas, NUM_FMT.INT),
      numCell(s.wins, NUM_FMT.INT),
      numCell(s.losses, NUM_FMT.INT),
      numCell(s.draws, NUM_FMT.INT),
      numCell(s.no_conflict_runs, NUM_FMT.INT),
      numCell(wr, NUM_FMT.PCT),
      tierBadge(wr),
      numCell(s.our_kills, NUM_FMT.INT),
      numCell(s.our_deaths, NUM_FMT.INT),
      numCell(Number(s.kd), NUM_FMT.KD),
      numCell(Number(s.total_gross_value), NUM_FMT.EURO),
      numCell(Number(s.total_net_value), NUM_FMT.EURO),
      numCell(Number(s.total_lost_value), NUM_FMT.EURO),
      bodyCell(s.best_member_name || '—'),
      captionCell(s.last_saida_date ? new Date(s.last_saida_date).toISOString().split('T')[0] : '—'),
    ];
  });
  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  if (dataRows.length) {
    const N = dataRows.length;
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 6, firstDataRow + N, 7, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 10, firstDataRow + N, 11, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalLessThan(sheetId, firstDataRow, 12, firstDataRow + N, 13, 0, COLOR.RED_SIGNAL_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 12, firstDataRow + N, 13, 1000, COLOR.GREEN_SOFT));
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Spots');

  autoResizeColumns(batch, sheetId, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncSpots };
