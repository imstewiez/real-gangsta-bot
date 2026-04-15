'use strict';
/**
 * Tab Membros — roster mestre com KPI bar + banding + pills de role.
 */

const { COLOR, NUM_FMT, bodyCell, numCell, pillCell, conditionalGradient, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getMembersFull } = require('../queries');

const HEADERS = [
  'Nome', 'Discord', 'Role', 'Tier', 'Estado', 'Entrada', 'Última Saída',
  'Entregas', 'Itens Totais', 'Vendas',
  'Saídas', 'W', 'L', 'K', 'D', 'K/D',
  'Surv', 'Return', 'Lucro', 'MVPs',
];

function rolePill(role) {
  const map = {
    chefia:          { label: 'CHEFIA',     bg: COLOR.RED_DEEP },
    oficial:         { label: 'OFICIAL',    bg: COLOR.RED_BLOOD },
    chefe_moradores: { label: 'PATRÃO',     bg: COLOR.GOLD },
    morador:         { label: 'MORADOR',    bg: COLOR.GRAPHITE },
    inativo:         { label: 'INATIVO',    bg: COLOR.GRAY_DARK },
  };
  const m = map[role];
  return m ? pillCell(m.label, m.bg) : bodyCell(role || '—');
}

function tierPill(tier) {
  const map = {
    young_blood:     { label: 'YB',  bg: COLOR.GRAPHITE },
    o_gunao:         { label: 'OG',  bg: COLOR.RED_BLOOD },
    gangster_fodido: { label: 'GF',  bg: COLOR.RED_DEEP },
    patrao_di_zona:  { label: 'PDZ', bg: COLOR.GOLD },
  };
  const m = map[tier];
  return m ? pillCell(m.label, m.bg) : bodyCell(tier || '—');
}

function statusPill(st) {
  if (st === 'ativo' || !st) return pillCell('ACTIVO', COLOR.GREEN_DEEP);
  if (st === 'inativo') return pillCell('INACTIVO', COLOR.GRAY_DARK);
  return bodyCell(st);
}

function fmtDate(d) { try { return d ? new Date(d).toISOString().split('T')[0] : '—'; } catch { return '—'; } }

async function syncMembers(batch, sheetId) {
  const rows = await getMembersFull();
  const COL_COUNT = HEADERS.length;

  const moradores = rows.filter(m => m.role === 'morador' || m.role === 'chefe_moradores').length;
  const oficiais = rows.filter(m => m.role === 'oficial' || m.role === 'chefia').length;
  const totalWeightedEntregas = rows.reduce((a, m) => a + Number(m.weighted_entregas || 0), 0);
  const totalKills = rows.reduce((a, m) => a + (m.kills || 0), 0);

  let row = writeHeader(batch, sheetId, 'Membros · Ficha da Casa', COL_COUNT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Na Casa',         value: rows.length,           fmt: NUM_FMT.INT },
    { label: 'Moradores',       value: moradores,             fmt: NUM_FMT.INT },
    { label: 'Oficiais',        value: oficiais,              fmt: NUM_FMT.INT },
    { label: 'Itens Entregues', value: totalWeightedEntregas, fmt: NUM_FMT.INT },
    { label: 'Kills Totais',    value: totalKills,            fmt: NUM_FMT.INT },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(m => [
    bodyCell(m.display_name || m.username || '—'),
    bodyCell(m.discord_id || ''),
    rolePill(m.role),
    tierPill(m.tier),
    statusPill(m.status),
    bodyCell(fmtDate(m.joined_at)),
    bodyCell(fmtDate(m.last_saida)),
    numCell(m.entregas, NUM_FMT.INT),
    numCell(Number(m.weighted_entregas), NUM_FMT.INT),
    numCell(m.vendas, NUM_FMT.INT),
    numCell(m.saidas_total, NUM_FMT.INT),
    numCell(m.wins, NUM_FMT.INT),
    numCell(m.losses, NUM_FMT.INT),
    numCell(m.kills, NUM_FMT.INT),
    numCell(m.deaths, NUM_FMT.INT),
    numCell(Number(m.kd), NUM_FMT.DEC),
    numCell(Number(m.survival_rate) / 100, NUM_FMT.PCT),
    numCell(Number(m.return_rate) / 100, NUM_FMT.PCT),
    numCell(Number(m.profit), NUM_FMT.EURO),
    numCell(m.mvps, NUM_FMT.INT),
  ]);

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  batch.addRule(conditionalGradient(sheetId, firstDataRow, 15, firstDataRow + dataRows.length, 16, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
  batch.addRule(conditionalGradient(sheetId, firstDataRow, 16, firstDataRow + dataRows.length, 17, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
  batch.addRule(conditionalGradient(sheetId, firstDataRow, 17, firstDataRow + dataRows.length, 18, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
  batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 18, firstDataRow + dataRows.length, 19, 1000, COLOR.GREEN_SOFT));
  batch.addRule(conditionalLessThan(sheetId, firstDataRow, 18, firstDataRow + dataRows.length, 19, -500, COLOR.RED_SIGNAL_SOFT));

  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);
  batch.freezeCols(sheetId, 1);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT);

  setWidths(batch, sheetId, [160, 150, 85, 60, 80, 95, 95, 75, 100, 65, 65, 45, 45, 45, 45, 55, 65, 75, 95, 60]);
}

module.exports = { syncMembers };
