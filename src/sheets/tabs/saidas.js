'use strict';
/**
 * Tab Saídas — histórico completo de saídas com KPI bar + banding.
 */

const { COLOR, NUM_FMT, cell, bodyCell, numCell, pillCell, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getSaidasFull } = require('../queries');

const HEADERS = [
  'ID', 'Data', 'Hora', 'Spot', 'Tipo', 'Líder', 'Grupo', 'Estado', 'Resultado',
  'Inimigo · Facção', 'Nomes', 'K', 'M', 'Vivos', 'Vieram',
  'Fornecido', 'Devolvido', 'Perdido', 'Consumido',
  'Bruto', 'Líquido', 'Lucro', 'Notas',
];

function resultPill(r) {
  const map = {
    vitoria:      { label: 'VITÓRIA', bg: COLOR.GREEN_DEEP },
    derrota:      { label: 'DERROTA', bg: COLOR.RED_DEEP },
    empate:       { label: 'EMPATE',  bg: COLOR.YELLOW_DEEP },
    sem_conflito: { label: 'NEUTRO',  bg: COLOR.GRAY_DARK },
    abortada:     { label: 'ABORT.',  bg: COLOR.GRAPHITE },
  };
  const m = map[r];
  return m ? pillCell(m.label, m.bg) : bodyCell('—');
}

function statusPill(s) {
  const map = {
    aberta:        { label: 'ABERTA',    bg: COLOR.GREEN_DEEP },
    em_preparacao: { label: 'PREP.',     bg: COLOR.YELLOW_DEEP },
    em_curso:      { label: 'EM CURSO',  bg: COLOR.RED_DEEP },
    concluida:     { label: 'FECHADA',   bg: COLOR.GRAPHITE },
    cancelada:     { label: 'CANCEL.',   bg: COLOR.GRAY_DARK },
  };
  const m = map[s];
  return m ? pillCell(m.label, m.bg) : bodyCell(s || '—');
}

async function syncSaidas(batch, sheetId) {
  const rows = await getSaidasFull(500);
  const COL_COUNT = HEADERS.length;

  // ── KPI bar: agrega rápido sobre todas as saídas ────────────────────────
  const wins = rows.filter(r => r.result === 'vitoria').length;
  const losses = rows.filter(r => r.result === 'derrota').length;
  const totalKills = rows.reduce((a, r) => a + (r.kills || 0), 0);
  const totalNet = rows.reduce((a, r) => a + Number(r.net || 0), 0);

  let row = writeHeader(batch, sheetId, 'Saídas · Movimento da Casa', COL_COUNT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Total',   value: rows.length, fmt: NUM_FMT.INT },
    { label: 'Vitórias',value: wins,        fmt: NUM_FMT.INT },
    { label: 'Derrotas',value: losses,      fmt: NUM_FMT.INT },
    { label: 'Kills',   value: totalKills,  fmt: NUM_FMT.INT },
    { label: 'Líquido', value: totalNet,    fmt: NUM_FMT.EURO },
    { label: 'Winrate', value: rows.length ? wins / rows.length : 0, fmt: NUM_FMT.PCT },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(s => [
    bodyCell(`#${s.id}`),
    bodyCell(s.date ? new Date(s.date).toISOString().split('T')[0] : ''),
    bodyCell(s.hora || '—'),
    bodyCell(s.spot || '—'),
    bodyCell(s.tipo || '—'),
    bodyCell(s.leader_name || '—'),
    numCell(s.group_number || 1, NUM_FMT.INT),
    statusPill(s.status),
    resultPill(s.result),
    bodyCell([s.enemy_name, s.enemy_faction].filter(Boolean).join(' · ') || '—'),
    numCell(s.participantes, NUM_FMT.INT),
    numCell(s.kills, NUM_FMT.INT),
    numCell(s.deaths, NUM_FMT.INT),
    numCell(s.survivors, NUM_FMT.INT),
    numCell(s.returned_bairro, NUM_FMT.INT),
    numCell(Number(s.supplied), NUM_FMT.EURO),
    numCell(Number(s.returned), NUM_FMT.EURO),
    numCell(Number(s.lost), NUM_FMT.EURO),
    numCell(Number(s.consumed), NUM_FMT.EURO),
    numCell(Number(s.gross), NUM_FMT.EURO),
    numCell(Number(s.net), NUM_FMT.EURO),
    bodyCell(s.was_profitable === true ? '▲' : s.was_profitable === false ? '▼' : '—', { align: 'CENTER' }),
    bodyCell(s.result_notes || '', { wrap: true }),
  ]);

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  // Conditional formatting
  batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 11, firstDataRow + dataRows.length, 12, 3, COLOR.GREEN_SOFT));
  batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 12, firstDataRow + dataRows.length, 13, 2, COLOR.RED_SIGNAL_SOFT));
  batch.addRule(conditionalLessThan(sheetId, firstDataRow, 20, firstDataRow + dataRows.length, 21, 0, COLOR.RED_SIGNAL_SOFT));
  batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 20, firstDataRow + dataRows.length, 21, 500, COLOR.GREEN_SOFT));

  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT);

  setWidths(batch, sheetId, [50, 90, 55, 140, 80, 140, 55, 85, 90, 180, 55, 45, 45, 55, 60, 85, 85, 75, 85, 85, 85, 55, 240]);
}

module.exports = { syncSaidas };
