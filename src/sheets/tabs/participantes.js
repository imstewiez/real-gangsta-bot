'use strict';
/**
 * Tab Participantes — detalhe por participante com banding + pills.
 */

const { COLOR, NUM_FMT, bodyCell, numCell, pillCell, conditionalGradient, conditionalGreaterThan } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getParticipantsFull } = require('../queries');

const HEADERS = [
  'Saída', 'Data', 'Spot', 'Nome', 'Role',
  'Próprio?', 'Org?',
  'Fornecido', 'Devolvido', 'Perdido', 'Consumido',
  'K', 'M', 'Vivo?', 'Veio?', 'MVP',
  'Perf', 'Disc', 'Notas',
];

function boolPill(v) {
  if (v === true) return pillCell('SIM', COLOR.GREEN_DEEP);
  if (v === false) return pillCell('NÃO', COLOR.RED_DEEP);
  return bodyCell('—', { align: 'CENTER' });
}

function mvpCell(v) {
  return v
    ? pillCell('MVP', COLOR.GOLD)
    : bodyCell('—', { align: 'CENTER' });
}

function fmtDate(d) { try { return d ? new Date(d).toISOString().split('T')[0] : '—'; } catch { return '—'; } }

async function syncParticipantes(batch, sheetId) {
  const rows = await getParticipantsFull(2000);
  const COL_COUNT = HEADERS.length;

  const mvps = rows.filter(p => p.mvp_flag).length;
  const deaths = rows.filter(p => p.survived === false).length;
  const totalKills = rows.reduce((a, p) => a + (p.kills || 0), 0);

  let row = writeHeader(batch, sheetId, 'Participantes · Quem Rende na Rua', COL_COUNT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Participações', value: rows.length, fmt: NUM_FMT.INT },
    { label: 'MVPs',          value: mvps,        fmt: NUM_FMT.INT },
    { label: 'Mortes',        value: deaths,      fmt: NUM_FMT.INT },
    { label: 'Kills',         value: totalKills,  fmt: NUM_FMT.INT },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(p => [
    bodyCell(`#${p.saida_id}`),
    bodyCell(fmtDate(p.date)),
    bodyCell(p.spot || '—'),
    bodyCell(p.display_name || '—'),
    bodyCell(p.role || 'membro'),
    boolPill(p.brought_own_material),
    boolPill(p.received_org_material),
    numCell(Number(p.issued), NUM_FMT.EURO),
    numCell(Number(p.returned), NUM_FMT.EURO),
    numCell(Number(p.lost), NUM_FMT.EURO),
    numCell(Number(p.consumed), NUM_FMT.EURO),
    numCell(p.kills, NUM_FMT.INT),
    numCell(p.deaths, NUM_FMT.INT),
    boolPill(p.survived),
    boolPill(p.returned_bairro),
    mvpCell(p.mvp_flag),
    numCell(Number(p.perf), NUM_FMT.DEC),
    numCell(Number(p.disc), NUM_FMT.DEC),
    bodyCell(p.notes || '', { wrap: true }),
  ]);

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 11, firstDataRow + dataRows.length, 12, 2, COLOR.GREEN_SOFT));
  batch.addRule(conditionalGradient(sheetId, firstDataRow, 16, firstDataRow + dataRows.length, 17, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
  batch.addRule(conditionalGradient(sheetId, firstDataRow, 17, firstDataRow + dataRows.length, 18, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));

  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);
  batch.freezeCols(sheetId, 4);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT);

  setWidths(batch, sheetId, [60, 85, 120, 150, 90, 75, 75, 85, 85, 80, 85, 40, 40, 70, 70, 60, 65, 65, 200]);
}

module.exports = { syncParticipantes };
