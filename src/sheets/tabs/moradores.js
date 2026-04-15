'use strict';
/**
 * Tab Moradores — vista focada com KPI bar + pills de tier.
 */

const { COLOR, NUM_FMT, bodyCell, numCell, pillCell } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getMembersFull } = require('../queries');

const HEADERS = [
  'Nome', 'Tier', 'Entrada', 'Entregas', 'Itens Totais',
  'Vendas', 'Última Saída', 'Saídas', 'K/D',
  'Return', 'Surv', 'Lucro', 'MVPs',
];

function tierPill(tier) {
  const map = {
    young_blood:     { label: 'YOUNG BLOOD',     bg: COLOR.GRAPHITE },
    o_gunao:         { label: 'O GUNÃO',         bg: COLOR.RED_BLOOD },
    gangster_fodido: { label: 'GANGSTER FODIDO', bg: COLOR.RED_DEEP },
    patrao_di_zona:  { label: 'PATRÃO DI ZONA',  bg: COLOR.GOLD },
  };
  const m = map[tier];
  return m ? pillCell(m.label, m.bg) : bodyCell(tier || '—');
}

function fmtDate(d) { try { return d ? new Date(d).toISOString().split('T')[0] : '—'; } catch { return '—'; } }

const MORADOR_TIERS = new Set(['young_blood', 'o_gunao', 'gangster_fodido', 'patrao_di_zona']);
const MORADOR_ROLES = new Set(['morador', 'chefe_moradores']);

async function syncMoradores(batch, sheetId) {
  const all = await getMembersFull();
  const rows = all.filter(m => MORADOR_ROLES.has(m.role) || MORADOR_TIERS.has(m.tier));
  const COL_COUNT = HEADERS.length;

  const yb = rows.filter(m => m.tier === 'young_blood').length;
  const og = rows.filter(m => m.tier === 'o_gunao').length;
  const gf = rows.filter(m => m.tier === 'gangster_fodido').length;
  const totalValue = rows.reduce((a, m) => a + Number(m.weighted_entregas || 0), 0);

  let row = writeHeader(batch, sheetId, 'Moradores · Quem Pesa na Casa', COL_COUNT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Na Casa',         value: rows.length, fmt: NUM_FMT.INT },
    { label: 'Young Blood',     value: yb,          fmt: NUM_FMT.INT },
    { label: 'O Gunão',         value: og,          fmt: NUM_FMT.INT },
    { label: 'Gangster Fodido', value: gf,          fmt: NUM_FMT.INT },
    { label: 'Itens Entregues', value: totalValue,  fmt: NUM_FMT.INT },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(m => [
    bodyCell(m.display_name || '—'),
    tierPill(m.tier),
    bodyCell(fmtDate(m.joined_at)),
    numCell(m.entregas, NUM_FMT.INT),
    numCell(Number(m.weighted_entregas), NUM_FMT.INT),
    numCell(m.vendas, NUM_FMT.INT),
    bodyCell(fmtDate(m.last_saida)),
    numCell(m.saidas_total, NUM_FMT.INT),
    numCell(Number(m.kd), NUM_FMT.DEC),
    numCell(Number(m.return_rate) / 100, NUM_FMT.PCT),
    numCell(Number(m.survival_rate) / 100, NUM_FMT.PCT),
    numCell(Number(m.profit), NUM_FMT.EURO),
    numCell(m.mvps, NUM_FMT.INT),
  ]);

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT);

  setWidths(batch, sheetId, [160, 140, 95, 75, 100, 65, 95, 60, 55, 75, 75, 95, 60]);
}

module.exports = { syncMoradores };
