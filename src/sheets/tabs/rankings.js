'use strict';
/**
 * Tab Rankings — blocos premium para cada eixo competitivo.
 * Cada bloco mostra top 10 com 1º/2º/3º destacados em gold/silver/bronze.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, numCell, rankCell } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, tableHeader, tableBody,
  footerBlock, setWidths, autoResizeColumns,
} = require('./_common');
const { getRankings } = require('../queries');

const COL_COUNT = 7;

function buildBlock(batch, sheetId, row, { title, hint, headers, items, render }) {
  row = sectionHeader(batch, sheetId, row, { title, hint, columnCount: COL_COUNT });
  row = tableHeader(batch, sheetId, row, headers.concat(Array(COL_COUNT - headers.length).fill('')));

  const rows = items.slice(0, 10).map((item, idx) => {
    const rank = idx + 1;
    const line = [rankCell(rank), ...render(item, rank)];
    while (line.length < COL_COUNT) line.push(cell('', { bg: COLOR.BG_APP }));
    return line;
  });
  row = tableBody(batch, sheetId, row, rows);
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  return row;
}

async function syncRankings(batch, sheetId) {
  const r = await getRankings();

  let row = headerBlock(batch, sheetId, {
    title: 'Rankings · Topo do Guetto',
    subtitle: 'tops por eixo — actualizado a cada sync',
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // Top entregas
  row = buildBlock(batch, sheetId, row, {
    title: '📦 TOP ENTREGAS',
    hint: 'quantidade de material entregue (all-time)',
    headers: ['#', 'Nome', 'Tier', 'Itens', 'Valor (€)', ''],
    items: r.topEntregas,
    render: (x, rank) => [
      rank <= 3 ? bodyBoldCell(x.display_name) : bodyCell(x.display_name),
      captionCell(x.tier || '—'),
      numCell(x.qty, NUM_FMT.INT),
      numCell(Number(x.weighted), NUM_FMT.EURO),
      cell('', { bg: COLOR.BG_APP }),
    ],
  });
  row = divider(batch, sheetId, row, COL_COUNT, 'hair');

  // Top kills
  row = buildBlock(batch, sheetId, row, {
    title: '🎯 TOP KILLS',
    hint: 'kills totais em saídas',
    headers: ['#', 'Nome', 'Kills', 'K/D', '', ''],
    items: r.topKills,
    render: (x, rank) => [
      rank <= 3 ? bodyBoldCell(x.display_name) : bodyCell(x.display_name),
      numCell(x.kills_total, NUM_FMT.INT),
      numCell(Number(x.kd_ratio), NUM_FMT.KD),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ],
  });
  row = divider(batch, sheetId, row, COL_COUNT, 'hair');

  // Top profit
  row = buildBlock(batch, sheetId, row, {
    title: '💰 TOP LUCRO GERADO',
    hint: 'lucro líquido gerado nas saídas',
    headers: ['#', 'Nome', 'Lucro (€)', '', '', ''],
    items: r.topProfit,
    render: (x, rank) => [
      rank <= 3 ? bodyBoldCell(x.display_name) : bodyCell(x.display_name),
      numCell(Number(x.profit_generated), NUM_FMT.EURO),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ],
  });
  row = divider(batch, sheetId, row, COL_COUNT, 'hair');

  // MVP
  row = buildBlock(batch, sheetId, row, {
    title: '🏆 TOP MVP',
    hint: 'melhor jogador em cada saída',
    headers: ['#', 'Nome', 'MVPs', 'Saídas', '% MVP', ''],
    items: r.topMVP,
    render: (x, rank) => [
      rank <= 3 ? bodyBoldCell(x.display_name) : bodyCell(x.display_name),
      numCell(x.mvp_count, NUM_FMT.INT),
      numCell(x.saidas_total, NUM_FMT.INT),
      numCell((x.saidas_total > 0) ? x.mvp_count / x.saidas_total : 0, NUM_FMT.PCT),
      cell('', { bg: COLOR.BG_APP }),
    ],
  });
  row = divider(batch, sheetId, row, COL_COUNT, 'hair');

  // Survival
  row = buildBlock(batch, sheetId, row, {
    title: '🛡️ TOP SOBREVIVÊNCIA',
    hint: 'mínimo 3 saídas',
    headers: ['#', 'Nome', 'Survival', 'Saídas', '', ''],
    items: r.topSurvival,
    render: (x, rank) => [
      rank <= 3 ? bodyBoldCell(x.display_name) : bodyCell(x.display_name),
      numCell(Number(x.survival_rate) / 100, NUM_FMT.PCT),
      numCell(x.saidas_total, NUM_FMT.INT),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ],
  });
  row = divider(batch, sheetId, row, COL_COUNT, 'hair');

  // Discipline
  row = buildBlock(batch, sheetId, row, {
    title: '📋 TOP DISCIPLINA MATERIAL',
    hint: 'taxa de devolução de material',
    headers: ['#', 'Nome', 'Return Rate', '', '', ''],
    items: r.topDiscipline,
    render: (x, rank) => [
      rank <= 3 ? bodyBoldCell(x.display_name) : bodyCell(x.display_name),
      numCell(Number(x.material_return_rate) / 100, NUM_FMT.PCT),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ],
  });
  row = divider(batch, sheetId, row, COL_COUNT, 'hair');

  // K/D
  row = buildBlock(batch, sheetId, row, {
    title: '⚔️ TOP K/D',
    hint: 'mínimo 3 encontros (kills + deaths)',
    headers: ['#', 'Nome', 'K/D', 'Kills', 'Deaths', ''],
    items: r.topKD,
    render: (x, rank) => [
      rank <= 3 ? bodyBoldCell(x.display_name) : bodyCell(x.display_name),
      numCell(Number(x.kd_ratio), NUM_FMT.KD),
      numCell(x.kills_total, NUM_FMT.INT),
      numCell(x.deaths_total, NUM_FMT.INT),
      cell('', { bg: COLOR.BG_APP }),
    ],
  });

  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Rankings');
  autoResizeColumns(batch, sheetId, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncRankings };
