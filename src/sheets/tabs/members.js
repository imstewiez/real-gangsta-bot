'use strict';
/**
 * Tab Membros — roster mestre. KPI strip + tabela premium com pills,
 * banding, filtro e conditional formatting.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, numCell, pillCell, badgeCell,
  conditionalGradient, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths, autoResizeColumns,
} = require('./_common');
const { getMembersFull } = require('../queries');

const HEADERS = [
  'Nome', 'Discord', 'Role', 'Tier', 'Estado', 'Entrada', 'Última Saída',
  'Entregas', 'Itens Totais', 'Vendas',
  'Saídas', 'V', 'D', 'K', 'M', 'K/D',
  'Surv', 'Return', 'Lucro', 'MVPs',
];
const COL_COUNT = HEADERS.length;

function rolePill(role) {
  const map = {
    chefia:          { label: 'CHEFIA',   bg: COLOR.RED_DEEP },
    oficial:         { label: 'OFICIAL',  bg: COLOR.RED_BLOOD },
    chefe_moradores: { label: 'PATRÃO',   bg: COLOR.GOLD },
    morador:         { label: 'MORADOR',  bg: COLOR.GRAPHITE },
    inativo:         { label: 'INACTIVO', bg: COLOR.GRAY_DARK },
  };
  const m = map[role];
  return m ? badgeCell(m.label, m.bg) : bodyCell(role || '—');
}

function tierPill(tier) {
  const map = {
    young_blood:     { label: 'YB',  bg: COLOR.GRAPHITE },
    o_gunao:         { label: 'OG',  bg: COLOR.RED_BLOOD },
    gangster_fodido: { label: 'GF',  bg: COLOR.RED_DEEP },
    patrao_di_zona:  { label: 'PDZ', bg: COLOR.GOLD },
  };
  const m = map[tier];
  return m ? badgeCell(m.label, m.bg) : bodyCell(tier || '—');
}

function statusBadge(st) {
  if (st === 'ativo' || !st) return badgeCell('ACTIVO', COLOR.GREEN_DEEP);
  if (st === 'inativo')      return badgeCell('INACTIVO', COLOR.GRAY_DARK);
  if (st === 'arquivado')    return badgeCell('ARQUIVADO', COLOR.IRON);
  return bodyCell(st);
}

function fmtDate(d) { try { return d ? new Date(d).toISOString().split('T')[0] : '—'; } catch { return '—'; } }

async function syncMembers(batch, sheetId) {
  const rows = await getMembersFull();

  const moradores = rows.filter(m => m.role === 'morador' || m.role === 'chefe_moradores').length;
  const oficiais  = rows.filter(m => m.role === 'oficial' || m.role === 'chefia').length;
  const totalEntregas = rows.reduce((a, m) => a + Number(m.weighted_entregas || 0), 0);
  const totalKills    = rows.reduce((a, m) => a + (m.kills || 0), 0);
  const totalProfit   = rows.reduce((a, m) => a + Number(m.profit || 0), 0);
  const avgKD         = rows.length ? rows.reduce((a, m) => a + Number(m.kd || 0), 0) / rows.length : 0;

  const FREEZE_AT = 1;
  let row = headerBlock(batch, sheetId, {
    title: 'Membros · Ficha da Casa',
    subtitle: `${rows.length} registos — roster completo`,
    columnCount: COL_COUNT,
    freezeAt: FREEZE_AT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: 'RESUMO DA CASA', hint: 'todos os activos', columnCount: COL_COUNT, freezeAt: FREEZE_AT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Membros',   value: rows.length,      numberFormat: NUM_FMT.INT, delta: `${moradores} moradores · ${oficiais} oficiais`, deltaDirection: 'flat' },
    { label: 'Entregues', value: totalEntregas,    numberFormat: NUM_FMT.INT, delta: 'material total', deltaDirection: 'flat' },
    { label: 'Kills',     value: totalKills,       numberFormat: NUM_FMT.INT, delta: `KD médio ${avgKD.toFixed(2)}`, deltaDirection: 'flat' },
    { label: 'Lucro',     value: totalProfit,      numberFormat: NUM_FMT.EURO, delta: 'gerado colectivamente', deltaDirection: totalProfit > 0 ? 'up' : 'flat' },
  ], COL_COUNT, { freezeAt: FREEZE_AT });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  row = sectionHeader(batch, sheetId, row, {
    title: 'ROSTER', hint: 'filtros activos — ordenar por qualquer coluna', columnCount: COL_COUNT, freezeAt: FREEZE_AT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(m => [
    bodyBoldCell(m.display_name || m.username || '—'),
    captionCell(m.discord_id || ''),
    rolePill(m.role),
    tierPill(m.tier),
    statusBadge(m.status),
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
    numCell(Number(m.kd), NUM_FMT.KD),
    numCell(Number(m.survival_rate) / 100, NUM_FMT.PCT),
    numCell(Number(m.return_rate) / 100, NUM_FMT.PCT),
    numCell(Number(m.profit), NUM_FMT.EURO),
    numCell(m.mvps, NUM_FMT.INT),
  ]);

  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  // Conditional formatting: K/D (col 15), Surv (16), Return (17), Lucro (18)
  if (dataRows.length) {
    const N = dataRows.length;
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 15, firstDataRow + N, 16, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 16, firstDataRow + N, 17, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGradient(sheetId, firstDataRow, 17, firstDataRow + N, 18, COLOR.RED_SIGNAL_SOFT, COLOR.YELLOW_SOFT, COLOR.GREEN_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 18, firstDataRow + N, 19, 1000, COLOR.GREEN_SOFT));
    batch.addRule(conditionalLessThan(sheetId, firstDataRow, 18, firstDataRow + N, 19, -500, COLOR.RED_SIGNAL_SOFT));
  }

  batch.freezeCols(sheetId, FREEZE_AT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, FREEZE_AT, 'Membros');

  autoResizeColumns(batch, sheetId, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncMembers };
