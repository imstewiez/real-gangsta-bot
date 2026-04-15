'use strict';
/**
 * Tab Saídas — histórico completo com KPIs operacionais e tabela premium.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, mutedCell, numCell, badgeCell,
  conditionalGreaterThan, conditionalLessThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths,
} = require('./_common');
const { getSaidasFull } = require('../queries');
const { growSheet } = require('../cleanup');

const HEADERS = [
  'ID', 'Data', 'Hora', 'Spot', 'Tipo', 'Líder', 'Grupo', 'Estado', 'Resultado',
  'Inimigo', 'Facção', 'Pplzz', 'K', 'M', 'Viv.', 'Vol.',
  'Fornecido', 'Devolvido', 'Perdido', 'Consumido',
  'Bruto', 'Líquido', 'Δ', 'Notas',
];
const COL_COUNT = HEADERS.length;

function resultBadge(r) {
  const map = {
    vitoria:      { label: 'VITÓRIA', bg: COLOR.GREEN_DEEP },
    derrota:      { label: 'DERROTA', bg: COLOR.RED_DEEP },
    empate:       { label: 'EMPATE',  bg: COLOR.YELLOW_DEEP },
    sem_conflito: { label: 'NEUTRO',  bg: COLOR.GRAY_DARK },
    abortada:     { label: 'ABORT.',  bg: COLOR.GRAPHITE },
  };
  const m = map[r];
  return m ? badgeCell(m.label, m.bg) : mutedCell('—', { align: 'CENTER' });
}

function statusBadge(s) {
  const map = {
    aberta:        { label: 'ABERTA',  bg: COLOR.GREEN_DEEP },
    em_preparacao: { label: 'PREP',    bg: COLOR.YELLOW_DEEP },
    em_curso:      { label: 'CURSO',   bg: COLOR.RED_DEEP },
    concluida:     { label: 'FECHADA', bg: COLOR.GRAPHITE },
    cancelada:     { label: 'CANCEL',  bg: COLOR.GRAY_DARK },
  };
  const m = map[s];
  return m ? badgeCell(m.label, m.bg) : bodyCell(s || '—');
}

async function syncSaidas(batch, sheetId) {
  const rows = await getSaidasFull(500);

  const concluidas = rows.filter(r => r.status === 'concluida');
  const wins       = concluidas.filter(r => r.result === 'vitoria').length;
  const losses     = concluidas.filter(r => r.result === 'derrota').length;
  const draws      = concluidas.filter(r => r.result === 'empate').length;
  const totalKills = rows.reduce((a, r) => a + (r.kills || 0), 0);
  const totalDeath = rows.reduce((a, r) => a + (r.deaths || 0), 0);
  const totalNet   = rows.reduce((a, r) => a + Number(r.net || 0), 0);
  const totalLost  = rows.reduce((a, r) => a + Number(r.lost || 0), 0);
  const winRate    = concluidas.length ? wins / concluidas.length : 0;

  // Grow antes de escrever — saidas pode ter 500+ rows
  growSheet(batch, sheetId, { rows: Math.max(rows.length + 40, 200) });

  let row = headerBlock(batch, sheetId, {
    title: 'Saídas · Movimento da Casa',
    subtitle: `histórico completo — ${rows.length} saídas (${concluidas.length} concluídas)`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: 'PANORAMA OPERACIONAL', hint: 'acumulado', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Saídas',    value: rows.length,  numberFormat: NUM_FMT.INT,  delta: `${concluidas.length} concluídas`, deltaDirection: 'flat' },
    { label: 'Win Rate',  value: winRate,      numberFormat: NUM_FMT.PCT,  delta: `${wins}V · ${losses}D · ${draws}E`, deltaDirection: winRate >= 0.5 ? 'up' : 'down' },
    { label: 'K/D Org',   value: totalDeath > 0 ? totalKills / totalDeath : totalKills, numberFormat: NUM_FMT.KD, delta: `${totalKills}k · ${totalDeath}d`, deltaDirection: 'flat' },
    { label: 'Balanço',   value: totalNet,     numberFormat: NUM_FMT.EURO, delta: `perdido: ${Math.round(totalLost)} €`, deltaDirection: totalNet > 0 ? 'up' : 'down' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  row = sectionHeader(batch, sheetId, row, {
    title: 'LEDGER DE SAÍDAS', hint: 'mais recentes no topo — filtros activos', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(s => [
    bodyBoldCell(`#${s.id}`),
    bodyCell(s.date ? new Date(s.date).toISOString().split('T')[0] : '—'),
    bodyCell(s.hora || '—'),
    bodyCell(s.spot || '—'),
    captionCell(s.tipo || '—'),
    bodyCell(s.leader_name || '—'),
    numCell(s.group_number || 1, NUM_FMT.INT),
    statusBadge(s.status),
    resultBadge(s.result),
    bodyCell(s.enemy_name || '—'),
    captionCell(s.enemy_faction || '—'),
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
    cell(s.was_profitable === true ? '▲' : s.was_profitable === false ? '▼' : '—', {
      bg: COLOR.BG_APP,
      font: s.was_profitable === true
        ? { fontFamily: 'Inter', fontSize: 11, bold: true, foregroundColor: COLOR.GREEN_DEEP }
        : s.was_profitable === false
        ? { fontFamily: 'Inter', fontSize: 11, bold: true, foregroundColor: COLOR.RED_SIGNAL }
        : { fontFamily: 'Inter', fontSize: 11, foregroundColor: COLOR.GRAY },
      align: 'CENTER', vAlign: 'MIDDLE',
    }),
    bodyCell(s.result_notes || '', { wrap: true }),
  ]);

  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  if (dataRows.length) {
    const N = dataRows.length;
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 12, firstDataRow + N, 13, 3, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 13, firstDataRow + N, 14, 2, COLOR.RED_SIGNAL_SOFT));
    batch.addRule(conditionalLessThan(sheetId, firstDataRow, 21, firstDataRow + N, 22, 0, COLOR.RED_SIGNAL_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 21, firstDataRow + N, 22, 500, COLOR.GREEN_SOFT));
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Saídas');

  setWidths(batch, sheetId, [55, 90, 55, 140, 75, 140, 50, 85, 90, 130, 100, 50, 40, 40, 45, 45, 85, 85, 75, 85, 85, 85, 45, 220]);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncSaidas };
