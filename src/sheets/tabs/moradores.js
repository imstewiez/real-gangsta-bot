'use strict';
/**
 * Tab Moradores — foco nos moradores da casa, agrupados por tier com
 * contadores por nível + ranking interno.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, numCell, badgeCell,
  conditionalGradient } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths, autoResizeColumns,
} = require('./_common');
const { getMembersFull } = require('../queries');

const HEADERS = [
  'Nome', 'Tier', 'Entrada', 'Última Saída',
  'Entregas', 'Itens Totais', 'Vendas',
  'Saídas', 'V/D', 'K/D',
  'Surv', 'Return', 'Lucro', 'MVPs',
];
const COL_COUNT = HEADERS.length;

function tierPill(tier) {
  const map = {
    young_blood:     { label: 'YOUNG BLOOD',     bg: COLOR.GRAPHITE },
    o_gunao:         { label: 'O GUNÃO',         bg: COLOR.RED_BLOOD },
    gangster_fodido: { label: 'GANGSTER FODIDO', bg: COLOR.RED_DEEP },
    patrao_di_zona:  { label: 'PATRÃO DI ZONA',  bg: COLOR.GOLD },
  };
  const m = map[tier];
  return m ? badgeCell(m.label, m.bg) : bodyCell(tier || '—');
}

function fmtDate(d) { try { return d ? new Date(d).toISOString().split('T')[0] : '—'; } catch { return '—'; } }

const MORADOR_TIERS = new Set(['young_blood', 'o_gunao', 'gangster_fodido', 'patrao_di_zona']);
const MORADOR_ROLES = new Set(['morador', 'chefe_moradores']);
const TIER_ORDER = ['patrao_di_zona', 'gangster_fodido', 'o_gunao', 'young_blood'];

async function syncMoradores(batch, sheetId) {
  const all = await getMembersFull();
  const rows = all.filter(m => MORADOR_ROLES.has(m.role) || MORADOR_TIERS.has(m.tier));

  const counts = {};
  for (const t of TIER_ORDER) counts[t] = rows.filter(m => m.tier === t).length;
  const totalValue = rows.reduce((a, m) => a + Number(m.weighted_entregas || 0), 0);
  const totalMVPs  = rows.reduce((a, m) => a + (m.mvps || 0), 0);

  let row = headerBlock(batch, sheetId, {
    title: 'Moradores · Quem Pesa na Casa',
    subtitle: `${rows.length} moradores activos — agrupados por tier`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: 'DISTRIBUIÇÃO POR TIER', hint: 'topo → base', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Patrão Di Zona',  value: counts.patrao_di_zona,  numberFormat: NUM_FMT.INT, delta: 'topo da casa', deltaDirection: 'flat' },
    { label: 'Gangster Fodido', value: counts.gangster_fodido, numberFormat: NUM_FMT.INT, delta: 'elite', deltaDirection: 'flat' },
    { label: 'O Gunão',         value: counts.o_gunao,         numberFormat: NUM_FMT.INT, delta: 'estabilizados', deltaDirection: 'flat' },
    { label: 'Young Blood',     value: counts.young_blood,     numberFormat: NUM_FMT.INT, delta: 'a subir', deltaDirection: 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Itens Entregues', value: totalValue,           numberFormat: NUM_FMT.INT, delta: 'material total', deltaDirection: 'flat' },
    { label: 'MVPs',            value: totalMVPs,            numberFormat: NUM_FMT.INT, delta: 'entre moradores', deltaDirection: 'flat' },
    { label: 'Média Entregas',  value: rows.length ? totalValue / rows.length : 0, numberFormat: NUM_FMT.DEC1, delta: 'por morador', deltaDirection: 'flat' },
    { label: 'Saídas Médias',   value: rows.length ? rows.reduce((a, m) => a + (m.saidas_total || 0), 0) / rows.length : 0, numberFormat: NUM_FMT.DEC1, delta: 'por morador', deltaDirection: 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  row = sectionHeader(batch, sheetId, row, {
    title: 'ROSTER POR TIER', hint: 'ordenado por peso na casa', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  // Ordenar: tier rank (descendente), depois weighted_entregas descendente
  const tierRank = { patrao_di_zona: 4, gangster_fodido: 3, o_gunao: 2, young_blood: 1 };
  rows.sort((a, b) => (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0)
                    || Number(b.weighted_entregas || 0) - Number(a.weighted_entregas || 0));

  const dataRows = rows.map(m => [
    bodyBoldCell(m.display_name || '—'),
    tierPill(m.tier),
    bodyCell(fmtDate(m.joined_at)),
    bodyCell(fmtDate(m.last_saida)),
    numCell(m.entregas, NUM_FMT.INT),
    numCell(Number(m.weighted_entregas), NUM_FMT.INT),
    numCell(m.vendas, NUM_FMT.INT),
    numCell(m.saidas_total, NUM_FMT.INT),
    bodyCell(`${m.wins || 0}/${m.losses || 0}`, { align: 'CENTER' }),
    numCell(Number(m.kd), NUM_FMT.KD),
    numCell(Number(m.survival_rate) / 100, NUM_FMT.PCT),
    numCell(Number(m.return_rate) / 100, NUM_FMT.PCT),
    numCell(Number(m.profit), NUM_FMT.EURO),
    numCell(m.mvps, NUM_FMT.INT),
  ]);

  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  if (dataRows.length) {
    const N = dataRows.length;
    // Heatmap em Itens Totais (col 5), Lucro (col 12)
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 5, firstDataRow + N, 6, COLOR.BG_APP, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 12, firstDataRow + N, 13, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Moradores');

  autoResizeColumns(batch, sheetId, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncMoradores };
