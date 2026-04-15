'use strict';
/**
 * Tab Participantes — detalhe por participação em saída com scores e MVPs.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, mutedCell, numCell, badgeCell,
  conditionalGradient, conditionalGreaterThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths,
} = require('./_common');
const { getParticipantsFull } = require('../queries');
const { growSheet } = require('../cleanup');

const HEADERS = [
  'Saída', 'Data', 'Spot', 'Nome', 'Role',
  'Próprio?', 'Org?',
  'Fornecido', 'Devolvido', 'Perdido', 'Consumido',
  'K', 'M', 'Vivo?', 'Veio?', 'MVP',
  'Perf', 'Disc', 'Notas',
];
const COL_COUNT = HEADERS.length;

function boolBadge(v) {
  if (v === true)  return badgeCell('SIM', COLOR.GREEN_DEEP);
  if (v === false) return badgeCell('NÃO', COLOR.RED_DEEP);
  return mutedCell('—', { align: 'CENTER' });
}
function mvpCell(v) {
  return v ? badgeCell('MVP', COLOR.GOLD) : mutedCell('—', { align: 'CENTER' });
}
function fmtDate(d) { try { return d ? new Date(d).toISOString().split('T')[0] : '—'; } catch { return '—'; } }

async function syncParticipantes(batch, sheetId) {
  const rows = await getParticipantsFull(2000);

  const mvps         = rows.filter(p => p.mvp_flag).length;
  const deaths       = rows.filter(p => p.survived === false).length;
  const totalKills   = rows.reduce((a, p) => a + (p.kills || 0), 0);
  const returnedBR   = rows.filter(p => p.returned_bairro).length;
  const participacoes = rows.length;
  const survivalRate = participacoes ? 1 - (deaths / participacoes) : 0;

  growSheet(batch, sheetId, { rows: Math.max(participacoes + 50, 200) });

  const FREEZE_AT = 4;
  let row = headerBlock(batch, sheetId, {
    title: 'Participantes · Quem Rende na Rua',
    subtitle: `${participacoes} participações registadas · ${mvps} MVPs · ${deaths} mortes`,
    columnCount: COL_COUNT,
    freezeAt: FREEZE_AT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: 'INDICADORES AGREGADOS', hint: 'todas as participações', columnCount: COL_COUNT, freezeAt: FREEZE_AT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Participações', value: participacoes, numberFormat: NUM_FMT.INT, delta: `${returnedBR} regressaram`, deltaDirection: 'flat' },
    { label: 'MVPs',          value: mvps,          numberFormat: NUM_FMT.INT, delta: `${(participacoes ? mvps / participacoes : 0 * 100).toFixed(0)}% taxa MVP`, deltaDirection: 'flat' },
    { label: 'Kills Totais',  value: totalKills,    numberFormat: NUM_FMT.INT, delta: `${deaths} mortes`, deltaDirection: 'flat' },
    { label: 'Survival Rate', value: survivalRate,  numberFormat: NUM_FMT.PCT, delta: survivalRate >= 0.7 ? 'sólido' : 'atenção', deltaDirection: survivalRate >= 0.7 ? 'up' : 'down' },
  ], COL_COUNT, { freezeAt: FREEZE_AT });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  row = sectionHeader(batch, sheetId, row, {
    title: 'LEDGER DE PARTICIPAÇÕES', hint: 'filtros activos', columnCount: COL_COUNT, freezeAt: FREEZE_AT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(p => [
    bodyBoldCell(`#${p.saida_id}`),
    bodyCell(fmtDate(p.date)),
    bodyCell(p.spot || '—'),
    bodyCell(p.display_name || '—'),
    captionCell(p.role || 'membro'),
    boolBadge(p.brought_own_material),
    boolBadge(p.received_org_material),
    numCell(Number(p.issued), NUM_FMT.EURO),
    numCell(Number(p.returned), NUM_FMT.EURO),
    numCell(Number(p.lost), NUM_FMT.EURO),
    numCell(Number(p.consumed), NUM_FMT.EURO),
    numCell(p.kills, NUM_FMT.INT),
    numCell(p.deaths, NUM_FMT.INT),
    boolBadge(p.survived),
    boolBadge(p.returned_bairro),
    mvpCell(p.mvp_flag),
    numCell(Number(p.perf), NUM_FMT.DEC),
    numCell(Number(p.disc), NUM_FMT.DEC),
    bodyCell(p.notes || '', { wrap: true }),
  ]);

  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  if (dataRows.length) {
    const N = dataRows.length;
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 11, firstDataRow + N, 12, 2, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 16, firstDataRow + N, 17, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 17, firstDataRow + N, 18, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
  }

  batch.freezeCols(sheetId, FREEZE_AT);
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, FREEZE_AT, 'Participantes');

  setWidths(batch, sheetId, [55, 85, 120, 150, 85, 75, 75, 85, 85, 80, 85, 40, 40, 70, 70, 60, 65, 65, 200]);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncParticipantes };
