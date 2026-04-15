'use strict';
/**
 * Tab Combate — kills + spots numa folha (tudo o que se passa nas ruas).
 *   Secção 1: Panorama de combate (total kills, semana, top killer/facção)
 *   Secção 2: Top 3 spots rentáveis (ranking block)
 *   Secção 3: Flop 3 spots arriscados (ranking block)
 *   Secção 4: Tabela completa spots
 *   Secção 5: Kill log (últimos 500)
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, mutedCell, numCell, badgeCell,
  conditionalGradient, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  rankingBlock, footerBlock, autoResizeColumns,
} = require('./_common');
const { getKillsFull, getKillsKPIs, getSpotsFull } = require('../queries');
const { growSheet } = require('../cleanup');

const SPOTS_HEADERS = [
  'Spot', 'Saídas', 'V', 'D', 'E', 'N/C', 'Winrate', 'Tier',
  'Kills', 'Mortes', 'K/D',
  'Bruto', 'Líquido', 'Perdido', 'Melhor Nome', 'Última',
];
const KILLS_HEADERS = [
  'Data/Hora', 'Killer', 'Vítima', 'Facção', 'Spot', 'Saída', 'Confirmado', 'Notas',
];
const COL_COUNT = SPOTS_HEADERS.length; // 16 — spots é o mais largo

function tierBadge(winRate) {
  if (winRate >= 0.7) return badgeCell('PREMIUM', COLOR.GREEN_DEEP);
  if (winRate >= 0.5) return badgeCell('SÓLIDO',  COLOR.YELLOW_DEEP);
  if (winRate >= 0.3) return badgeCell('MÉDIO',   COLOR.GRAY_DARK);
  return badgeCell('FRACO', COLOR.RED_DEEP);
}

function fmtDT(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 16); } catch { return String(d); }
}

async function syncCombate(batch, sheetId) {
  const [kpi, kills, spots] = await Promise.all([
    getKillsKPIs(), getKillsFull(500), getSpotsFull(),
  ]);

  const totalSaidas = spots.reduce((a, r) => a + (r.total_saidas || 0), 0);
  const totalNetSp  = spots.reduce((a, r) => a + Number(r.total_net_value || 0), 0);
  const activeSpots = spots.filter(r => (r.total_saidas || 0) > 0);
  const avgWR       = activeSpots.length ? activeSpots.reduce((a, r) => a + Number(r.win_rate || 0), 0) / activeSpots.length : 0;
  const top3  = [...spots].sort((a, b) => Number(b.total_net_value || 0) - Number(a.total_net_value || 0)).slice(0, 3);
  const flop3 = [...spots].sort((a, b) => Number(a.total_net_value || 0) - Number(b.total_net_value || 0)).slice(0, 3);

  growSheet(batch, sheetId, { rows: Math.max(kills.length + spots.length + 80, 200) });

  let row = headerBlock(batch, sheetId, {
    title: 'Combate · Quem Pesou na Rua',
    subtitle: `${kpi.total} kills · ${activeSpots.length} spots activos · ${totalSaidas} saídas`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Panorama ─────────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'PANORAMA DE COMBATE', hint: 'all-time + semana', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Kills Total', value: kpi.total, numberFormat: NUM_FMT.INT,  delta: `${kpi.week} esta semana`, deltaDirection: kpi.week > 0 ? 'up' : 'flat' },
    { label: 'Top Killer',  value: kpi.topKiller ? kpi.topKiller.display_name : '—', numberFormat: null, delta: kpi.topKiller ? `${kpi.topKiller.kills} kills` : '—', deltaDirection: 'up' },
    { label: 'Top Facção',  value: kpi.topFaction ? kpi.topFaction.victim_faction : '—', numberFormat: null, delta: kpi.topFaction ? `${kpi.topFaction.n} vítimas` : '—', deltaDirection: 'flat' },
    { label: 'WR Spots',    value: avgWR, numberFormat: NUM_FMT.PCT, delta: `lucro total: ${Math.round(totalNetSp)} €`, deltaDirection: avgWR >= 0.5 ? 'up' : 'down' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Top 3 spots rentáveis ────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'TOP 3 · SPOTS MAIS RENTÁVEIS', hint: 'por lucro líquido', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['#', 'Spot', 'Saídas', 'Winrate', 'Lucro (€)', ...Array(COL_COUNT - 5).fill('')]);
  row = rankingBlock(batch, sheetId, row, top3.map((s, i) => ({
    rank: i + 1,
    label: s.spot || '—',
    value: Number(s.total_net_value) || 0,
    valueFormat: NUM_FMT.EURO,
    sub: `${s.total_saidas} saídas · ${(Number(s.win_rate) * 100).toFixed(0)}% WR`,
  })), COL_COUNT, { labelCol: 1, valueCol: 4 });

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Flop 3 spots arriscados ──────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'FLOP 3 · SPOTS ARRISCADOS', hint: 'por prejuízo ou mortes', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['#', 'Spot', 'Saídas', 'Mortes', 'Lucro (€)', ...Array(COL_COUNT - 5).fill('')]);
  row = rankingBlock(batch, sheetId, row, flop3.map((s, i) => ({
    rank: i + 1,
    label: s.spot || '—',
    value: Number(s.total_net_value) || 0,
    valueFormat: NUM_FMT.EURO,
    sub: `${s.total_saidas} saídas · ${s.our_deaths} mortes`,
  })), COL_COUNT, { labelCol: 1, valueCol: 4 });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Tabela spots ─────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'TABELA COMPLETA · SPOTS', hint: 'todos com actividade registada', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, SPOTS_HEADERS);
  const spotsFirstRow = row;

  const spotRows = spots.map(s => {
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
  row = tableBody(batch, sheetId, row, spotRows);

  if (spotRows.length) {
    const N = spotRows.length;
    batch.addRule(conditionalGradient(sheetId, spotsFirstRow, 6, spotsFirstRow + N, 7, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, spotsFirstRow, 10, spotsFirstRow + N, 11, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalLessThan(sheetId, spotsFirstRow, 12, spotsFirstRow + N, 13, 0, COLOR.RED_SIGNAL_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, spotsFirstRow, 12, spotsFirstRow + N, 13, 1000, COLOR.GREEN_SOFT));
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Kill log ─────────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'KILL LOG', hint: `últimas ${kills.length} kills · filtros activos`, columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, KILLS_HEADERS.concat(Array(COL_COUNT - KILLS_HEADERS.length).fill('')));

  const killRows = kills.map(k => {
    const cells = [
      bodyCell(fmtDT(k.created_at)),
      bodyBoldCell(k.killer_name || '—'),
      bodyCell(k.victim_name || '—'),
      captionCell(k.victim_faction || '—'),
      bodyCell(k.spot || '—'),
      k.saida_id ? bodyCell(`#${k.saida_id}`) : mutedCell('—'),
      captionCell(k.confirmed_by_name || '—'),
      bodyCell(k.notes || '', { wrap: true }),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, killRows, { basicFilter: true, columnCount: COL_COUNT });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Combate');
  autoResizeColumns(batch, sheetId, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncCombate };
