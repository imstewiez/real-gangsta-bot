'use strict';
/**
 * Tab Rankings — leaderboard completo da Firma RedWood.
 *
 * Secções:
 *   1. Top 10 Semanal (entregas, vendas, saídas, score híbrido)
 *   2. Top 10 Mensal
 *   3. Top 10 All-Time
 *   4. Streaks (semanas consecutivas com material)
 */

const {
  COLOR,
  NUM_FMT,
  cell,
  bodyCell,
  bodyBoldCell,
  numCell,
} = require('../theme');
const {
  headerBlock,
  sectionHeader,
  spacer,
  divider,
  tableHeader,
  tableBody,
  footerBlock,
  autoResizeAll,
} = require('./_common');
const { getBairristaRankings } = require('../queries');

const COL_COUNT = 10;

function _rankBadge(rank) {
  const palettes = {
    1: { bg: COLOR.GOLD_SOFT, fg: COLOR.GOLD_DEEP, icon: '🥇' },
    2: { bg: COLOR.SILVER_SOFT, fg: COLOR.SILVER_DEEP, icon: '🥈' },
    3: { bg: COLOR.BRONZE_SOFT, fg: COLOR.BRONZE_DEEP, icon: '🥉' },
  };
  const p = palettes[rank] || { bg: COLOR.BG_APP, fg: COLOR.GRAY_LIGHT, icon: `${rank}.` };
  return cell(`${p.icon}`, {
    bg: p.bg,
    font: { fontFamily: 'Inter', fontSize: 10, bold: rank <= 3, foregroundColor: p.fg },
    align: 'CENTER',
    vAlign: 'MIDDLE',
  });
}

function _buildRankingRows(rows, valueKey, valueFormat, extraCols = []) {
  return rows.map((r, i) => {
    const rank = i + 1;
    const cells = [
      _rankBadge(rank),
      rank <= 3 ? bodyBoldCell(r.display_name || '—') : bodyCell(r.display_name || '—'),
      bodyCell(r.tier || '—'),
    ];
    for (const { key, fmt } of extraCols) {
      cells.push(numCell(r[key] || 0, fmt || NUM_FMT.INT));
    }
    cells.push(numCell(r[valueKey] || 0, valueFormat));
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
}

async function syncRankings(batch, sheetId) {
  const { weekly, monthly, allTime, streaks, weekBounds, monthBounds } = await getBairristaRankings();

  let row = 0;

  // ── 1. Header ──────────────────────────────────────────────────────────────
  row = headerBlock(batch, sheetId, {
    title: 'Rankings · Firma RedWood',
    subtitle: `semana ${weekBounds.start} → ${weekBounds.end} · mês ${monthBounds.start}`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  batch.freezeRows(sheetId, row);

  // ── 2. Top 10 Semanal ──────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🏆 TOP 10 — SEMANA',
    hint: `${weekBounds.start} → ${weekBounds.end}`,
    columnCount: COL_COUNT,
  });

  const weeklyHeaders = ['#', 'Nome', 'Tier', 'Entregas', 'Vendas', 'Saídas', 'Score Híbrido'];
  row = tableHeader(batch, sheetId, row, weeklyHeaders.concat(Array(COL_COUNT - weeklyHeaders.length).fill('')));

  const weeklyRows = _buildRankingRows(weekly, 'hybrid_score', NUM_FMT.INT, [
    { key: 'deliveries', fmt: NUM_FMT.INT },
    { key: 'sales', fmt: NUM_FMT.INT },
    { key: 'operations_count', fmt: NUM_FMT.INT },
  ]);
  row = tableBody(batch, sheetId, row, weeklyRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── 3. Top 10 Mensal ───────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🏆 TOP 10 — MÊS',
    hint: monthBounds.start,
    columnCount: COL_COUNT,
  });

  const monthlyHeaders = ['#', 'Nome', 'Tier', 'Entregas', 'Vendas', 'Saídas', 'Score Híbrido'];
  row = tableHeader(batch, sheetId, row, monthlyHeaders.concat(Array(COL_COUNT - monthlyHeaders.length).fill('')));

  const monthlyRows = _buildRankingRows(monthly, 'hybrid_score', NUM_FMT.INT, [
    { key: 'deliveries', fmt: NUM_FMT.INT },
    { key: 'sales', fmt: NUM_FMT.INT },
    { key: 'operations_count', fmt: NUM_FMT.INT },
  ]);
  row = tableBody(batch, sheetId, row, monthlyRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── 4. Top 10 All-Time ─────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🏆 TOP 10 — HISTÓRICO',
    hint: 'desde sempre',
    columnCount: COL_COUNT,
  });

  const allTimeHeaders = ['#', 'Nome', 'Tier', 'Entregas', 'Vendas', 'Saídas', 'Score Híbrido'];
  row = tableHeader(batch, sheetId, row, allTimeHeaders.concat(Array(COL_COUNT - allTimeHeaders.length).fill('')));

  const allTimeRows = _buildRankingRows(allTime, 'hybrid_score', NUM_FMT.INT, [
    { key: 'deliveries', fmt: NUM_FMT.INT },
    { key: 'sales', fmt: NUM_FMT.INT },
    { key: 'operations_count', fmt: NUM_FMT.INT },
  ]);
  row = tableBody(batch, sheetId, row, allTimeRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── 5. Streaks ─────────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🔥 STREAKS',
    hint: 'semanas consecutivas com material entregue/vendido',
    columnCount: COL_COUNT,
  });

  const streakHeaders = ['#', 'Nome', 'Semanas', 'Status'];
  row = tableHeader(batch, sheetId, row, streakHeaders.concat(Array(COL_COUNT - streakHeaders.length).fill('')));

  const streakRows = streaks.map((s, i) => {
    const cells = [
      _rankBadge(i + 1),
      bodyBoldCell(s.display_name || '—'),
      numCell(s.streak_len || 0, NUM_FMT.INT),
      bodyCell(s.streak_len >= 4 ? '🔥 Imparável' : s.streak_len >= 2 ? '💪 Consistente' : '👍 Na luta'),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, streakRows);

  // ── 6. Footer ──────────────────────────────────────────────────────────────
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Rankings');

  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncRankings };
