'use strict';
/**
 * Tab Rankings — blocos para Top Entregas, Top Kills, Top Profit, MVP,
 * Sobrevivência, Disciplina, K/D.
 */

const { COLOR, NUM_FMT, cell, bodyCell, numCell, headerCell, subHeaderCell } = require('../theme');
const { writeHeader, setWidths } = require('./_common');
const { getRankings } = require('../queries');

const COL_COUNT = 6;

function writeBlock(batch, sheetId, row, title, rows, columns) {
  // Subtítulo do bloco
  batch.updateCells(sheetId, row, 0, [[
    subHeaderCell(title),
    ...Array(COL_COUNT - 1).fill(cell('', { bg: COLOR.CHARCOAL })),
  ]]);
  batch.mergeCells(sheetId, row, row + 1, 0, COL_COUNT);
  batch.setRowHeight(sheetId, row, 26);
  row += 1;

  // Cabeçalho de colunas
  batch.updateCells(sheetId, row, 0, [columns.map(c => headerCell(c))]);
  batch.setRowHeight(sheetId, row, 22);
  row += 1;

  // Linhas
  const medals = ['🥇', '🥈', '🥉'];
  const data = rows.slice(0, 10).map((r, i) => {
    const place = medals[i] || `${i + 1}.`;
    return [bodyCell(place), ...r];
  });
  if (data.length) batch.updateCells(sheetId, row, 0, data);
  row += data.length + 1;

  return row;
}

async function syncRankings(batch, sheetId) {
  const r = await getRankings();

  let row = writeHeader(batch, sheetId, 'Rankings · Topo do Guetto', COL_COUNT);

  // Top entregas
  row = writeBlock(batch, sheetId, row,
    '🏅 TOP ENTREGAS (valor ponderado)',
    r.topEntregas.map(x => [
      bodyCell(x.display_name),
      bodyCell(x.tier || '—'),
      numCell(x.qty, NUM_FMT.INT),
      numCell(Number(x.weighted), NUM_FMT.EURO),
      bodyCell(''),
    ]),
    ['', 'Nome', 'Tier', 'Qtd', 'Valor (€)', '']
  );

  // Top kills
  row = writeBlock(batch, sheetId, row,
    '🎯 TOP KILLS',
    r.topKills.map(x => [
      bodyCell(x.display_name),
      numCell(x.kills_total, NUM_FMT.INT),
      numCell(Number(x.kd_ratio), NUM_FMT.DEC),
      bodyCell(''),
      bodyCell(''),
    ]),
    ['', 'Nome', 'Kills', 'K/D', '', '']
  );

  // Top profit
  row = writeBlock(batch, sheetId, row,
    '💰 TOP LUCRO GERADO',
    r.topProfit.map(x => [
      bodyCell(x.display_name),
      numCell(Number(x.profit_generated), NUM_FMT.EURO),
      bodyCell(''),
      bodyCell(''),
      bodyCell(''),
    ]),
    ['', 'Nome', 'Lucro', '', '', '']
  );

  // MVP
  row = writeBlock(batch, sheetId, row,
    '🏆 TOP MVP',
    r.topMVP.map(x => [
      bodyCell(x.display_name),
      numCell(x.mvp_count, NUM_FMT.INT),
      numCell(x.saidas_total, NUM_FMT.INT),
      bodyCell(''),
      bodyCell(''),
    ]),
    ['', 'Nome', 'MVPs', 'Saídas', '', '']
  );

  // Survival
  row = writeBlock(batch, sheetId, row,
    '🛡️ TOP SOBREVIVÊNCIA',
    r.topSurvival.map(x => [
      bodyCell(x.display_name),
      numCell(Number(x.survival_rate) / 100, NUM_FMT.PCT),
      numCell(x.saidas_total, NUM_FMT.INT),
      bodyCell(''),
      bodyCell(''),
    ]),
    ['', 'Nome', 'Survival', 'Saídas', '', '']
  );

  // Disciplina material
  row = writeBlock(batch, sheetId, row,
    '📦 TOP DISCIPLINA MATERIAL',
    r.topDiscipline.map(x => [
      bodyCell(x.display_name),
      numCell(Number(x.material_return_rate) / 100, NUM_FMT.PCT),
      bodyCell(''),
      bodyCell(''),
      bodyCell(''),
    ]),
    ['', 'Nome', 'Return Rate', '', '', '']
  );

  // K/D
  row = writeBlock(batch, sheetId, row,
    '⚖️ TOP K/D',
    r.topKD.map(x => [
      bodyCell(x.display_name),
      numCell(Number(x.kd_ratio), NUM_FMT.DEC),
      numCell(x.kills_total, NUM_FMT.INT),
      numCell(x.deaths_total, NUM_FMT.INT),
      bodyCell(''),
    ]),
    ['', 'Nome', 'K/D', 'Kills', 'Deaths', '']
  );

  setWidths(batch, sheetId, [50, 180, 120, 100, 110, 100]);
}

module.exports = { syncRankings };
