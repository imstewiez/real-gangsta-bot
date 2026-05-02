'use strict';
/**
 * Tab Rankings v2 — tabela master unificada.
 *
 * Colunas: Rank | Nome | Tier | Semanal | Mensal | All-Time | Streak | Status
 * Cada membro aparece 1x só; scores de cada período em colunas adjacentes.
 * Permite ver consistência (quem está em todos os tops vs one-hit).
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, numCell, rankCell } = require('../theme');
const {
  headerBlock,
  sectionHeader,
  spacer,
  divider,
  tableHeader,
  tableBody,
  footerBlock,
  autoResizeAll,
  gangTitle,
} = require('./_common');
const { getBairristaRankings } = require('../queries');

const COL_COUNT = 10;

function _rankBadge(rank) {
  const palettes = {
    1: { bg: COLOR.GOLD_SOFT, fg: COLOR.GOLD_DEEP },
    2: { bg: COLOR.SILVER_SOFT, fg: COLOR.SILVER_DEEP },
    3: { bg: COLOR.BRONZE_SOFT, fg: COLOR.BRONZE_DEEP },
  };
  const p = palettes[rank] || { bg: COLOR.BG_APP, fg: COLOR.GRAY_LIGHT };
  return cell(`${rank}.`, {
    bg: p.bg,
    font: { fontFamily: 'Inter', fontSize: 10, bold: rank <= 3, foregroundColor: p.fg },
    align: 'CENTER',
    vAlign: 'MIDDLE',
  });
}

async function syncRankings(batch, sheetId) {
  const { weekly, monthly, allTime, streaks, weekBounds, monthBounds } = await getBairristaRankings();

  // Build unified member map
  const memberMap = new Map();

  weekly.forEach((r, i) => {
    if (!memberMap.has(r.discord_id))
      memberMap.set(r.discord_id, { ...r, weeklyRank: i + 1, monthlyRank: null, allTimeRank: null });
    else memberMap.get(r.discord_id).weeklyRank = i + 1;
  });
  monthly.forEach((r, i) => {
    if (!memberMap.has(r.discord_id))
      memberMap.set(r.discord_id, { ...r, weeklyRank: null, monthlyRank: i + 1, allTimeRank: null });
    else memberMap.get(r.discord_id).monthlyRank = i + 1;
  });
  allTime.forEach((r, i) => {
    if (!memberMap.has(r.discord_id))
      memberMap.set(r.discord_id, { ...r, weeklyRank: null, monthlyRank: null, allTimeRank: i + 1 });
    else memberMap.get(r.discord_id).allTimeRank = i + 1;
  });

  const streakMap = new Map(streaks.map(s => [s.discord_id, s.streak_len || 0]));

  // Sort by best rank across all periods (weighted: weekly > monthly > alltime)
  const unified = Array.from(memberMap.values()).sort((a, b) => {
    const score = m => (m.weeklyRank || 999) * 10000 + (m.monthlyRank || 999) * 100 + (m.allTimeRank || 999);
    return score(a) - score(b);
  });

  let row = 0;

  // ── 1. Header ──────────────────────────────────────────────────────────────
  row = headerBlock(batch, sheetId, {
    title: gangTitle('Rankings'),
    subtitle: `semana ${weekBounds.start} → ${weekBounds.end} · mês ${monthBounds.start}`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  batch.freezeRows(sheetId, row);

  // ── 2. Tabela Master Unificada ───────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'RANKING MASTER',
    hint: 'consistência entre períodos',
    columnCount: COL_COUNT,
  });

  const headers = ['Rank', 'Nome', 'Tier', 'Semanal', 'Mensal', 'All-Time', 'Score', 'Streak', 'Status'];
  row = tableHeader(batch, sheetId, row, headers.concat(Array(COL_COUNT - headers.length).fill('')));

  const rows = unified.slice(0, 20).map((r, i) => {
    const rank = i + 1;
    const streak = streakMap.get(r.discord_id) || 0;
    let status = '—';
    if (r.weeklyRank && r.monthlyRank && r.allTimeRank) status = 'Consistente';
    else if (r.weeklyRank && r.monthlyRank) status = 'Em forma';
    else if (r.weeklyRank) status = 'One-hit';
    else if (r.allTimeRank) status = 'Veterano';

    const cells = [
      _rankBadge(rank),
      rank <= 3 ? bodyBoldCell(r.display_name || '—') : bodyCell(r.display_name || '—'),
      bodyCell(r.tier || '—'),
      r.weeklyRank
        ? numCell(r.weeklyRank, NUM_FMT.INT)
        : cell('—', {
            bg: COLOR.BG_APP,
            font: { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY },
            align: 'CENTER',
            vAlign: 'MIDDLE',
          }),
      r.monthlyRank
        ? numCell(r.monthlyRank, NUM_FMT.INT)
        : cell('—', {
            bg: COLOR.BG_APP,
            font: { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY },
            align: 'CENTER',
            vAlign: 'MIDDLE',
          }),
      r.allTimeRank
        ? numCell(r.allTimeRank, NUM_FMT.INT)
        : cell('—', {
            bg: COLOR.BG_APP,
            font: { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY },
            align: 'CENTER',
            vAlign: 'MIDDLE',
          }),
      numCell(Math.round(Number(r.hybrid_score ?? r.weighted_value ?? 0)), NUM_FMT.INT),
      numCell(streak, NUM_FMT.INT),
      bodyCell(status),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, rows);

  // ── 3. Secções por período (top 5 cada, para detalhe) ────────────────────
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  row = sectionHeader(batch, sheetId, row, {
    title: 'TOP 5 SEMANAL',
    hint: `${weekBounds.start} → ${weekBounds.end}`,
    columnCount: COL_COUNT,
  });
  row = tableHeader(
    batch,
    sheetId,
    row,
    ['#', 'Nome', 'Tier', 'Entregas', 'Vendas', 'Saídas', 'Score'].concat(Array(COL_COUNT - 7).fill(''))
  );
  const weeklyRows = weekly.slice(0, 5).map((r, i) => {
    const cells = [
      rankCell(i + 1),
      bodyBoldCell(r.display_name || '—'),
      bodyCell(r.tier || '—'),
      numCell(r.deliveries || 0, NUM_FMT.INT),
      numCell(r.sales || 0, NUM_FMT.INT),
      numCell(r.operations_count || 0, NUM_FMT.INT),
      numCell(Math.round(Number(r.hybrid_score ?? 0)), NUM_FMT.INT),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, weeklyRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  row = sectionHeader(batch, sheetId, row, {
    title: 'TOP 5 MENSAL',
    hint: monthBounds.start,
    columnCount: COL_COUNT,
  });
  row = tableHeader(
    batch,
    sheetId,
    row,
    ['#', 'Nome', 'Tier', 'Entregas', 'Vendas', 'Saídas', 'Score'].concat(Array(COL_COUNT - 7).fill(''))
  );
  const monthlyRows = monthly.slice(0, 5).map((r, i) => {
    const cells = [
      rankCell(i + 1),
      bodyBoldCell(r.display_name || '—'),
      bodyCell(r.tier || '—'),
      numCell(r.deliveries || 0, NUM_FMT.INT),
      numCell(r.sales || 0, NUM_FMT.INT),
      numCell(r.operations_count || 0, NUM_FMT.INT),
      numCell(Math.round(Number(r.hybrid_score ?? 0)), NUM_FMT.INT),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, monthlyRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  row = sectionHeader(batch, sheetId, row, {
    title: 'TOP 5 ALL-TIME',
    hint: 'desde sempre',
    columnCount: COL_COUNT,
  });
  row = tableHeader(
    batch,
    sheetId,
    row,
    ['#', 'Nome', 'Tier', 'Entregas', 'Vendas', 'Saídas', 'Score'].concat(Array(COL_COUNT - 7).fill(''))
  );
  const allTimeRows = allTime.slice(0, 5).map((r, i) => {
    const cells = [
      rankCell(i + 1),
      bodyBoldCell(r.display_name || '—'),
      bodyCell(r.tier || '—'),
      numCell(r.deliveries || 0, NUM_FMT.INT),
      numCell(r.sales || 0, NUM_FMT.INT),
      numCell(r.operations_count || 0, NUM_FMT.INT),
      numCell(Math.round(Number(r.hybrid_score ?? 0)), NUM_FMT.INT),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, allTimeRows);

  // ── 4. Streaks ───────────────────────────────────────────────────────────
  if (streaks.length) {
    row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
    row = sectionHeader(batch, sheetId, row, {
      title: 'STREAKS',
      hint: 'semanas consecutivas com material entregue/vendido',
      columnCount: COL_COUNT,
    });
    row = tableHeader(batch, sheetId, row, ['#', 'Nome', 'Semanas', 'Status'].concat(Array(COL_COUNT - 4).fill('')));
    const streakRows = streaks.map((s, i) => {
      const cells = [
        rankCell(i + 1),
        bodyBoldCell(s.display_name || '—'),
        numCell(s.streak_len || 0, NUM_FMT.INT),
        bodyCell(s.streak_len >= 4 ? 'Imparável' : s.streak_len >= 2 ? 'Consistente' : 'Na luta'),
      ];
      while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
      return cells;
    });
    row = tableBody(batch, sheetId, row, streakRows);
  }

  // ── 5. Footer ────────────────────────────────────────────────────────────
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Rankings');

  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncRankings };
