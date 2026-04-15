'use strict';
/**
 * Tab Resumo — consolida visão temporal semanal + diária numa única folha.
 *   Secção 1: Pilares da semana (KPI strip)
 *   Secção 2: Comparativo detalhado vs semana anterior
 *   Secção 3: Janela de 14 dias (KPI strip agregado)
 *   Secção 4: Breakdown diário com badges contextuais
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, mutedCell, numCell, badgeCell, formatDelta,
  conditionalGreaterThan, conditionalLessThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, autoResizeColumns,
} = require('./_common');
const { getWeeklySummary, getDailyBreakdown, getTrending } = require('../queries');

const COL_COUNT = 9;

function destaqueBadge(d) {
  const net = Number(d.net || 0);
  if (d.ops === 0 && Number(d.entradas) === 0 && Number(d.vendas) === 0) return mutedCell('—', { align: 'CENTER' });
  if (net > 500)  return badgeCell('BOM DIA',  COLOR.GREEN_DEEP);
  if (net < -200) return badgeCell('A PERDER', COLOR.RED_DEEP);
  if ((d.kills || 0) > 5)  return badgeCell('PESOU',    COLOR.GOLD);
  if ((d.deaths || 0) > 3) return badgeCell('DIA CARO', COLOR.RED_BLOOD);
  if (net > 0)    return badgeCell('POSITIVO', COLOR.GREEN_DEEP);
  return mutedCell('—', { align: 'CENTER' });
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().split('T')[0]; } catch { return String(d); }
}

async function syncResumo(batch, sheetId) {
  const [{ current, previous, bounds }, daily14, trend] = await Promise.all([
    getWeeklySummary(), getDailyBreakdown(14), getTrending(),
  ]);

  let row = headerBlock(batch, sheetId, {
    title: 'Resumo · Peso da Semana & Balanço da Rua',
    subtitle: `semana ${bounds.current.start} → ${bounds.current.end}  ·  anterior ${bounds.previous.start} → ${bounds.previous.end}  ·  14 dias`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Secção 1: Pilares da semana ──────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🎯 PILARES DA SEMANA', hint: `${current.ops || 0} saídas concluídas`, columnCount: COL_COUNT,
  });

  const winRate = (current.ops || 0) > 0 ? (current.wins || 0) / current.ops : 0;
  const kd = (current.deaths || 0) > 0 ? (current.kills || 0) / current.deaths : (current.kills || 0);
  const dNet = formatDelta(Number(previous.net) || 0, Number(current.net) || 0, 'pct');
  const dKills = formatDelta(previous.kills || 0, current.kills || 0, 'pct');

  row = kpiStrip(batch, sheetId, row, [
    { label: 'Win Rate',   value: winRate, numberFormat: NUM_FMT.PCT,
      delta: `${current.wins || 0}V · ${current.losses || 0}D · ${current.draws || 0}E`, deltaDirection: 'flat' },
    { label: 'K/D',        value: kd, numberFormat: NUM_FMT.KD,
      delta: `${current.kills || 0}k · ${current.deaths || 0}d`, deltaDirection: dKills.direction },
    { label: 'Lucro Líq.', value: Number(current.net) || 0, numberFormat: NUM_FMT.EURO,
      delta: `${dNet.arrow} ${(dNet.value * 100).toFixed(1)}% vs anterior`, deltaDirection: dNet.direction },
    { label: 'Entregas',   value: current.entregas || 0, numberFormat: NUM_FMT.INT,
      delta: `vendas: ${current.vendas || 0}`, deltaDirection: 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Secção 2: Comparativo detalhado ──────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '📊 COMPARATIVO · ESTA vs ANTERIOR', hint: 'deltas a verde/vermelho', columnCount: COL_COUNT,
  });

  const cmpHeaders = ['Métrica', 'Esta Semana', 'Semana Anterior', 'Δ Absoluto', 'Δ %', ''];
  row = tableHeader(batch, sheetId, row, cmpHeaders.concat(Array(COL_COUNT - cmpHeaders.length).fill('')));

  const cmpData = [
    { label: 'Saídas',                  cur: current.ops       || 0, prev: previous.ops       || 0, fmt: NUM_FMT.INT },
    { label: 'Vitórias',                cur: current.wins      || 0, prev: previous.wins      || 0, fmt: NUM_FMT.INT },
    { label: 'Derrotas',                cur: current.losses    || 0, prev: previous.losses    || 0, fmt: NUM_FMT.INT },
    { label: 'Empates',                 cur: current.draws     || 0, prev: previous.draws     || 0, fmt: NUM_FMT.INT },
    { label: 'Kills',                   cur: current.kills     || 0, prev: previous.kills     || 0, fmt: NUM_FMT.INT },
    { label: 'Mortes',                  cur: current.deaths    || 0, prev: previous.deaths    || 0, fmt: NUM_FMT.INT },
    { label: 'Material Fornecido (un)', cur: trend.supplied_units.current, prev: trend.supplied_units.previous, fmt: NUM_FMT.INT },
    { label: 'Material Devolvido (un)', cur: trend.returned_units.current, prev: trend.returned_units.previous, fmt: NUM_FMT.INT },
    { label: 'Material Perdido (un)',   cur: trend.lost_units.current,     prev: trend.lost_units.previous,     fmt: NUM_FMT.INT },
    { label: 'Material Consumido (un)', cur: trend.consumed_units.current, prev: trend.consumed_units.previous, fmt: NUM_FMT.INT },
    { label: 'Lucro Bruto (€)',         cur: Number(current.gross) || 0, prev: Number(previous.gross) || 0, fmt: NUM_FMT.EURO },
    { label: 'Lucro Líquido (€)',       cur: Number(current.net)   || 0, prev: Number(previous.net)   || 0, fmt: NUM_FMT.EURO },
    { label: 'Entregas (itens)',        cur: current.entregas  || 0, prev: null, fmt: NUM_FMT.INT },
    { label: 'Vendas (itens)',          cur: current.vendas    || 0, prev: null, fmt: NUM_FMT.INT },
  ].map(m => {
    const hasPrev = m.prev !== null;
    const absDelta = hasPrev ? m.cur - m.prev : 0;
    const { value: pctVal, direction, arrow } = formatDelta(m.prev || 0, m.cur, 'pct');
    const deltaFont = direction === 'up' ? { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.GREEN_DEEP }
                    : direction === 'down' ? { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.RED_SIGNAL }
                    : { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY };
    const isEuro = m.fmt.pattern && m.fmt.pattern.includes('€');
    const cells = [
      bodyBoldCell(m.label),
      numCell(m.cur, m.fmt),
      hasPrev ? numCell(m.prev, m.fmt, { font: { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.GRAY } })
              : mutedCell('—', { align: 'RIGHT' }),
      hasPrev ? numCell(absDelta, isEuro ? NUM_FMT.EURO_DELTA : NUM_FMT.INT_DELTA, { font: deltaFont })
              : mutedCell('—', { align: 'RIGHT' }),
      hasPrev ? numCell(pctVal, NUM_FMT.PCT_DELTA, { font: deltaFont })
              : mutedCell('—', { align: 'RIGHT' }),
      cell(hasPrev ? arrow : '—', { bg: COLOR.BG_APP, font: deltaFont, align: 'CENTER', vAlign: 'MIDDLE' }),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, cmpData);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Secção 3: Janela 14 dias (KPI strip) ─────────────────────────────────
  const totalNet   = daily14.reduce((a, r) => a + Number(r.net || 0), 0);
  const totalOps   = daily14.reduce((a, r) => a + (r.ops || 0), 0);
  const totalKills = daily14.reduce((a, r) => a + (r.kills || 0), 0);
  const totalEntr  = daily14.reduce((a, r) => a + Number(r.entradas || 0), 0);
  const diasOps    = daily14.filter(r => (r.ops || 0) > 0).length;

  row = sectionHeader(batch, sheetId, row, {
    title: '📅 JANELA DE 14 DIAS', hint: 'acumulado', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Dias c/ Operação', value: diasOps,    numberFormat: NUM_FMT.INT,  delta: `${daily14.length} dias totais`, deltaDirection: 'flat' },
    { label: 'Saídas',           value: totalOps,   numberFormat: NUM_FMT.INT,  delta: `média ${(totalOps / Math.max(diasOps, 1)).toFixed(1)}/dia útil`, deltaDirection: 'flat' },
    { label: 'Kills',            value: totalKills, numberFormat: NUM_FMT.INT,  delta: `média ${(totalKills / Math.max(diasOps, 1)).toFixed(1)}/dia útil`, deltaDirection: 'flat' },
    { label: 'Lucro Total',      value: totalNet,   numberFormat: NUM_FMT.EURO, delta: `entradas: ${totalEntr} un.`, deltaDirection: totalNet > 0 ? 'up' : totalNet < 0 ? 'down' : 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Secção 4: Breakdown diário ───────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '📆 BREAKDOWN DIÁRIO', hint: 'mais recente no topo', columnCount: COL_COUNT,
  });
  const dailyHeaders = ['Data', 'Saídas', 'Kills', 'Mortes', 'Líquido', 'Entradas', 'Vendas', 'Destaque', ''];
  row = tableHeader(batch, sheetId, row, dailyHeaders);
  const firstDataRow = row;

  const dailyRows = daily14.map(d => [
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
  row = tableBody(batch, sheetId, row, dailyRows, { basicFilter: true, columnCount: COL_COUNT });

  if (dailyRows.length) {
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 4, firstDataRow + dailyRows.length, 5, 0, COLOR.GREEN_SOFT));
    batch.addRule(conditionalLessThan(sheetId, firstDataRow, 4, firstDataRow + dailyRows.length, 5, 0, COLOR.RED_SIGNAL_SOFT));
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Resumo');
  autoResizeColumns(batch, sheetId, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncResumo };
