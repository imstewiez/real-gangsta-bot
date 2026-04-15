'use strict';
/**
 * Tab Resumo Diário — últimos 14 dias com KPIs do dia + breakdown.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, mutedCell, numCell, badgeCell, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths,
} = require('./_common');
const { getDailyBreakdown } = require('../queries');

const COL_COUNT = 9;
const HEADERS = ['Data', 'Saídas', 'Kills', 'Mortes', 'Líquido', 'Entradas', 'Vendas', 'Destaque', ''];

function destaqueBadge(d) {
  const net = Number(d.net || 0);
  if (d.ops === 0 && Number(d.entradas) === 0 && Number(d.vendas) === 0) {
    return mutedCell('—', { align: 'CENTER' });
  }
  if (net > 500) return badgeCell('BOM DIA', COLOR.GREEN_DEEP);
  if (net < -200) return badgeCell('A PERDER', COLOR.RED_DEEP);
  if ((d.kills || 0) > 5) return badgeCell('PESOU', COLOR.GOLD);
  if ((d.deaths || 0) > 3) return badgeCell('DIA CARO', COLOR.RED_BLOOD);
  if (net > 0) return badgeCell('POSITIVO', COLOR.GREEN_DEEP);
  return mutedCell('—', { align: 'CENTER' });
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().split('T')[0]; } catch { return String(d); }
}

async function syncDaily(batch, sheetId) {
  const rows = await getDailyBreakdown(14);

  const totalNet   = rows.reduce((a, r) => a + Number(r.net || 0), 0);
  const totalOps   = rows.reduce((a, r) => a + (r.ops || 0), 0);
  const totalKills = rows.reduce((a, r) => a + (r.kills || 0), 0);
  const totalEntr  = rows.reduce((a, r) => a + Number(r.entradas || 0), 0);
  const diasOps    = rows.filter(r => (r.ops || 0) > 0).length;

  let row = headerBlock(batch, sheetId, {
    title: 'Resumo Diário · Balanço da Rua',
    subtitle: `últimos 14 dias — ${diasOps} dias com operação`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── KPI strip ────────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'JANELA DE 14 DIAS', hint: 'acumulado', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Dias c/ Operação', value: diasOps,    numberFormat: NUM_FMT.INT, delta: `${rows.length} dias totais`, deltaDirection: 'flat' },
    { label: 'Saídas',           value: totalOps,   numberFormat: NUM_FMT.INT, delta: `média ${(totalOps / Math.max(diasOps, 1)).toFixed(1)}/dia útil`, deltaDirection: 'flat' },
    { label: 'Kills',            value: totalKills, numberFormat: NUM_FMT.INT, delta: `média ${(totalKills / Math.max(diasOps, 1)).toFixed(1)}/dia útil`, deltaDirection: 'flat' },
    { label: 'Lucro Total',      value: totalNet,   numberFormat: NUM_FMT.EURO, delta: `entradas: ${totalEntr} un.`, deltaDirection: totalNet > 0 ? 'up' : totalNet < 0 ? 'down' : 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Tabela dia-a-dia ─────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'BREAKDOWN DIÁRIO', hint: 'mais recente no topo', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(d => [
    bodyBoldCell(fmtDate(d.day)),
    numCell(d.ops, NUM_FMT.INT),
    numCell(d.kills, NUM_FMT.INT),
    numCell(d.deaths, NUM_FMT.INT),
    numCell(Number(d.net), NUM_FMT.EURO),
    numCell(Number(d.entradas), NUM_FMT.INT),
    numCell(Number(d.vendas), NUM_FMT.INT),
    destaqueBadge(d),
    cell('', { bg: COLOR.BG_APP }),
  ]);
  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  // Conditional formatting na coluna "Líquido"
  batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 4, firstDataRow + dataRows.length, 5, 0, COLOR.GREEN_SOFT));
  batch.addRule(conditionalLessThan(sheetId, firstDataRow, 4, firstDataRow + dataRows.length, 5, 0, COLOR.RED_SIGNAL_SOFT));

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Resumo Diário');

  setWidths(batch, sheetId, [110, 65, 60, 65, 110, 95, 95, 120, 60]);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncDaily };
