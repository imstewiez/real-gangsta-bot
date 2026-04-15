'use strict';
/**
 * Tab Dashboard — KPIs no topo, cards visuais, resumos automáticos.
 * Layout:
 *   Row 0: Título RedWood + assinatura (linha preta)
 *   Row 2: faixa de 6 KPI cards (3 colunas cada)
 *   Row 6: faixa de mais 6 KPI cards
 *   Row 10: destaques da semana (top contributor, top killer, spots)
 *   Row 15+: mini-tabelas de "Peso da Semana" e "Balanço da Rua"
 */

const { COLOR, NUM_FMT, cell, titleCell, signatureCell, kpiLabelCell, kpiValueCell, kpiDeltaCell, headerCell, bodyCell, numCell, subHeaderCell, mutedCell } = require('../theme');
const { writeHeader, setWidths } = require('./_common');
const { getDashboardKPIs } = require('../queries');

const COL_COUNT = 12;

function fmtMoney(v) {
  const n = Number(v) || 0;
  return n;
}

function pctDelta(curr, prev) {
  if (!prev || prev === 0) return curr > 0 ? '▲ novo' : '—';
  const diff = curr - prev;
  const pct = (diff / Math.abs(prev)) * 100;
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
  return `${arrow} ${Math.abs(pct).toFixed(0)}% vs anterior`;
}

function isPositive(curr, prev) {
  if (prev === null || prev === undefined) return null;
  return curr >= prev;
}

function kpiBlock(label, value, deltaText, positive, fmt) {
  return [
    [kpiLabelCell(label.toUpperCase()), cell('', { bg: COLOR.CHARCOAL }), cell('', { bg: COLOR.CHARCOAL })],
    [kpiValueCell(value, fmt), cell('', { bg: COLOR.CHARCOAL }), cell('', { bg: COLOR.CHARCOAL })],
    [kpiDeltaCell(deltaText || ' ', positive), cell('', { bg: COLOR.CHARCOAL }), cell('', { bg: COLOR.CHARCOAL })],
  ];
}

async function syncDashboard(batch, sheetId) {
  const k = await getDashboardKPIs();

  // ── Row 0-1: Título + assinatura ─────────────────────────────────────────
  let row = writeHeader(batch, sheetId, 'Dashboard · Firma RedWood', COL_COUNT);
  row = 2;

  // ── Linha de período ─────────────────────────────────────────────────────
  batch.updateCells(sheetId, row, 0, [[
    mutedCell(`Semana ${k.weekBounds.start} → ${k.weekBounds.end}`),
    ...Array(COL_COUNT - 1).fill(cell('', { bg: COLOR.BLACK })),
  ]]);
  batch.mergeCells(sheetId, row, row + 1, 0, COL_COUNT);
  row += 1;

  // ── Bloco KPIs linha 1 (6 cards × 3 cols cada usando 2 colunas por card) ──
  // Usamos 4 cards em 12 colunas (3 cols por card) para um look mais arejado.
  // Cada card ocupa 3 rows × 3 cols.
  const kpis1 = [
    { label: 'Valor do Stock (€)', value: fmtMoney(k.stockValue),      delta: '—', pos: null, fmt: NUM_FMT.EURO },
    { label: 'Lucro Saídas Semana',value: fmtMoney(k.netWeek),         delta: pctDelta(k.netWeek, k.netPrevWeek), pos: isPositive(k.netWeek, k.netPrevWeek), fmt: NUM_FMT.EURO },
    { label: 'Entregas Semana',    value: k.weekEntradas,              delta: pctDelta(k.weekEntradas, k.prevEntradas), pos: isPositive(k.weekEntradas, k.prevEntradas), fmt: NUM_FMT.INT },
    { label: 'Material Devolvido', value: fmtMoney(k.returnedMaterial),delta: '—', pos: null, fmt: NUM_FMT.EURO },
  ];
  row += 1;
  await renderKpiRow(batch, sheetId, row, kpis1);
  row += 4;

  const kpis2 = [
    { label: 'Saídas',             value: k.saidasTotal,               delta: `${k.saidasWins}W / ${k.saidasLosses}L`, pos: null, fmt: NUM_FMT.INT },
    { label: 'Win Rate',           value: k.winRate,                   delta: '—', pos: null, fmt: NUM_FMT.PCT },
    { label: 'Kills Semana',       value: k.killsWeek,                 delta: pctDelta(k.killsWeek, k.killsPrevWeek), pos: isPositive(k.killsWeek, k.killsPrevWeek), fmt: NUM_FMT.INT },
    { label: 'K/D Org',            value: k.kdOrg,                     delta: `${k.killsWeek}k / ${k.deathsWeek}d`, pos: null, fmt: NUM_FMT.DEC },
  ];
  row += 1;
  await renderKpiRow(batch, sheetId, row, kpis2);
  row += 4;

  const kpis3 = [
    { label: 'Moradores Ativos',   value: k.moradoresAtivos,           delta: '—', pos: null, fmt: NUM_FMT.INT },
    { label: 'Oficiais Ativos',    value: k.oficiaisAtivos,            delta: '—', pos: null, fmt: NUM_FMT.INT },
    { label: 'Material Perdido',   value: fmtMoney(k.lostMaterial),    delta: '—', pos: null, fmt: NUM_FMT.EURO },
    { label: 'Stock (qtd)',        value: k.stockQty,                  delta: '—', pos: null, fmt: NUM_FMT.INT },
  ];
  row += 1;
  await renderKpiRow(batch, sheetId, row, kpis3);
  row += 4;

  // ── Destaques da Semana (banner) ─────────────────────────────────────────
  row += 1;
  batch.updateCells(sheetId, row, 0, [[
    subHeaderCell('DESTAQUES DA SEMANA'),
    ...Array(COL_COUNT - 1).fill(cell('', { bg: COLOR.CHARCOAL })),
  ]]);
  batch.mergeCells(sheetId, row, row + 1, 0, COL_COUNT);
  batch.setRowHeight(sheetId, row, 28);
  row += 1;

  const destaques = [
    ['🏆 Top Contributor', k.topContributor ? `${k.topContributor.display_name} · ${Number(k.topContributor.value).toLocaleString('pt-PT')} itens` : '—'],
    ['🎯 Top Killer',      k.topKiller      ? `${k.topKiller.display_name} · ${k.topKiller.kills} kills`                                                  : '—'],
    ['📍 Spot + Lucro',    k.topSpotProfit  ? `${k.topSpotProfit.spot} · ${Math.round(Number(k.topSpotProfit.total_net_value)).toLocaleString('pt-PT')} €`  : '—'],
    ['⚠️ Spot + Perigoso', k.topSpotDanger  ? `${k.topSpotDanger.spot} · ${k.topSpotDanger.our_deaths} mortes`                                              : '—'],
  ];
  for (const [label, value] of destaques) {
    const r = [
      cell(label, { bg: COLOR.BLACK, font: { bold: true, fontSize: 10, foregroundColor: COLOR.GRAY_LIGHT }, align: 'LEFT', vAlign: 'MIDDLE' }),
      cell(value, { bg: COLOR.BLACK, font: { fontSize: 11, foregroundColor: COLOR.WHITE }, align: 'LEFT', vAlign: 'MIDDLE' }),
      ...Array(COL_COUNT - 2).fill(cell('', { bg: COLOR.BLACK })),
    ];
    batch.updateCells(sheetId, row, 0, [r]);
    batch.mergeCells(sheetId, row, row + 1, 1, COL_COUNT);
    batch.setRowHeight(sheetId, row, 22);
    row += 1;
  }

  // ── Footer assinatura ────────────────────────────────────────────────────
  row += 2;
  batch.updateCells(sheetId, row, 0, [[
    signatureCell(),
    ...Array(COL_COUNT - 1).fill(cell('', { bg: COLOR.BLACK })),
  ]]);
  batch.mergeCells(sheetId, row, row + 1, 0, COL_COUNT);

  // ── Column widths ────────────────────────────────────────────────────────
  // Cards ocupam 3 colunas (mais arejado). 12 colunas total.
  for (let i = 0; i < COL_COUNT; i++) batch.setColumnWidth(sheetId, i, 100);
}

// Renderiza 4 cards numa linha, 3 colunas cada (12 colunas total).
// Cada card = 3 rows × 3 cols. Uses merge para ficar com visual de "bloco".
async function renderKpiRow(batch, sheetId, row, kpis) {
  // Row N+0: Label (all 4 cards)
  // Row N+1: Value (all 4 cards)
  // Row N+2: Delta  (all 4 cards)
  const labelRow = [];
  const valueRow = [];
  const deltaRow = [];
  for (let i = 0; i < 4; i++) {
    const k = kpis[i];
    if (!k) {
      labelRow.push(...Array(3).fill(cell('', { bg: COLOR.CHARCOAL })));
      valueRow.push(...Array(3).fill(cell('', { bg: COLOR.CHARCOAL })));
      deltaRow.push(...Array(3).fill(cell('', { bg: COLOR.CHARCOAL })));
      continue;
    }
    labelRow.push(kpiLabelCell(k.label.toUpperCase()), cell('', { bg: COLOR.CHARCOAL }), cell('', { bg: COLOR.CHARCOAL }));
    valueRow.push(kpiValueCell(k.value, k.fmt), cell('', { bg: COLOR.CHARCOAL }), cell('', { bg: COLOR.CHARCOAL }));
    deltaRow.push(kpiDeltaCell(k.delta, k.pos), cell('', { bg: COLOR.CHARCOAL }), cell('', { bg: COLOR.CHARCOAL }));
  }
  batch.updateCells(sheetId, row, 0, [labelRow, valueRow, deltaRow]);

  // Merges para cada card (3 cells × 3 rows)
  for (let i = 0; i < 4; i++) {
    const col = i * 3;
    batch.mergeCells(sheetId, row, row + 1, col, col + 3);       // label
    batch.mergeCells(sheetId, row + 1, row + 2, col, col + 3);   // value
    batch.mergeCells(sheetId, row + 2, row + 3, col, col + 3);   // delta
  }

  batch.setRowHeight(sheetId, row, 22);
  batch.setRowHeight(sheetId, row + 1, 40);
  batch.setRowHeight(sheetId, row + 2, 18);
}

module.exports = { syncDashboard };
