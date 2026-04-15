'use strict';
/**
 * Tab Membros — roster consolidado (geral + moradores + oficiais) com secções
 * por agregado + roster completo filtrável.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, numCell, badgeCell,
  conditionalGradient, conditionalGreaterThan, conditionalLessThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, autoResizeColumns,
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
  if (st === 'ativo' || !st) return badgeCell('ACTIVO',    COLOR.GREEN_DEEP);
  if (st === 'inativo')      return badgeCell('INACTIVO',  COLOR.GRAY_DARK);
  if (st === 'arquivado')    return badgeCell('ARQUIVADO', COLOR.IRON);
  return bodyCell(st);
}

function fmtDate(d) { try { return d ? new Date(d).toISOString().split('T')[0] : '—'; } catch { return '—'; } }

const MORADOR_ROLES = new Set(['morador', 'chefe_moradores']);
const OFICIAL_ROLES = new Set(['oficial', 'chefia']);
const TIER_ORDER    = ['patrao_di_zona', 'gangster_fodido', 'o_gunao', 'young_blood'];

async function syncMembros(batch, sheetId) {
  const rows = await getMembersFull();

  const moradores = rows.filter(m => MORADOR_ROLES.has(m.role));
  const oficiais  = rows.filter(m => OFICIAL_ROLES.has(m.role));

  const totalEntregas = rows.reduce((a, m) => a + Number(m.weighted_entregas || 0), 0);
  const totalKills    = rows.reduce((a, m) => a + (m.kills || 0), 0);
  const totalProfit   = rows.reduce((a, m) => a + Number(m.profit || 0), 0);
  const avgKD         = rows.length ? rows.reduce((a, m) => a + Number(m.kd || 0), 0) / rows.length : 0;

  // Oficiais agregados
  const oTotalSaidas  = oficiais.reduce((a, m) => a + (m.saidas_total || 0), 0);
  const oTotalWins    = oficiais.reduce((a, m) => a + (m.wins || 0), 0);
  const oTotalKills   = oficiais.reduce((a, m) => a + (m.kills || 0), 0);
  const oTotalMVPs    = oficiais.reduce((a, m) => a + (m.mvps || 0), 0);
  const oAvgKD        = oficiais.length ? oficiais.reduce((a, m) => a + Number(m.kd || 0), 0) / oficiais.length : 0;
  const oCollectiveWR = oTotalSaidas > 0 ? oTotalWins / oTotalSaidas : 0;

  // Tier counts (dos moradores)
  const tierCounts = {};
  for (const t of TIER_ORDER) tierCounts[t] = moradores.filter(m => m.tier === t).length;

  const FREEZE_AT = 1;
  let row = headerBlock(batch, sheetId, {
    title: 'Membros · Ficha da Casa',
    subtitle: `${rows.length} membros · ${moradores.length} moradores · ${oficiais.length} oficiais`,
    columnCount: COL_COUNT,
    freezeAt: FREEZE_AT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Secção 1: Resumo Casa ────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'RESUMO DA CASA', hint: 'todos os membros activos', columnCount: COL_COUNT, freezeAt: FREEZE_AT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Membros',   value: rows.length,    numberFormat: NUM_FMT.INT, delta: `${moradores.length} moradores · ${oficiais.length} oficiais`, deltaDirection: 'flat' },
    { label: 'Entregues', value: totalEntregas,  numberFormat: NUM_FMT.INT, delta: 'material total', deltaDirection: 'flat' },
    { label: 'Kills',     value: totalKills,     numberFormat: NUM_FMT.INT, delta: `KD médio ${avgKD.toFixed(2)}`, deltaDirection: 'flat' },
    { label: 'Lucro',     value: totalProfit,    numberFormat: NUM_FMT.EURO, delta: 'gerado colectivamente', deltaDirection: totalProfit > 0 ? 'up' : 'flat' },
  ], COL_COUNT, { freezeAt: FREEZE_AT });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');

  // ── Secção 2: Distribuição por tier ──────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'MORADORES · DISTRIBUIÇÃO POR TIER', hint: 'topo → base', columnCount: COL_COUNT, freezeAt: FREEZE_AT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Patrão Di Zona',  value: tierCounts.patrao_di_zona,  numberFormat: NUM_FMT.INT, delta: 'topo da casa', deltaDirection: 'flat' },
    { label: 'Gangster Fodido', value: tierCounts.gangster_fodido, numberFormat: NUM_FMT.INT, delta: 'elite', deltaDirection: 'flat' },
    { label: 'O Gunão',         value: tierCounts.o_gunao,         numberFormat: NUM_FMT.INT, delta: 'estabilizados', deltaDirection: 'flat' },
    { label: 'Young Blood',     value: tierCounts.young_blood,     numberFormat: NUM_FMT.INT, delta: 'a subir', deltaDirection: 'flat' },
  ], COL_COUNT, { freezeAt: FREEZE_AT });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');

  // ── Secção 3: Núcleo oficiais ────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'OFICIAIS · NÚCLEO DA FIRMA', hint: 'performance agregada', columnCount: COL_COUNT, freezeAt: FREEZE_AT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Oficiais',     value: oficiais.length,  numberFormat: NUM_FMT.INT, delta: `${oficiais.filter(m => m.role === 'chefia').length} chefia`, deltaDirection: 'flat' },
    { label: 'Win Rate',     value: oCollectiveWR,    numberFormat: NUM_FMT.PCT, delta: `${oTotalWins}V em ${oTotalSaidas} saídas`, deltaDirection: oCollectiveWR >= 0.5 ? 'up' : 'down' },
    { label: 'K/D Médio',    value: oAvgKD,           numberFormat: NUM_FMT.KD,  delta: `${oTotalKills} kills totais`, deltaDirection: oAvgKD >= 1 ? 'up' : 'flat' },
    { label: 'MVPs',         value: oTotalMVPs,       numberFormat: NUM_FMT.INT, delta: 'entre oficiais', deltaDirection: 'flat' },
  ], COL_COUNT, { freezeAt: FREEZE_AT });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Secção 4: Roster completo ────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'ROSTER COMPLETO', hint: 'filtros activos — ordena por qualquer coluna', columnCount: COL_COUNT, freezeAt: FREEZE_AT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  // Ordenar: oficiais primeiro, depois moradores por tier, depois resto
  const roleRank = { chefia: 4, oficial: 3, chefe_moradores: 2, morador: 1, inativo: 0 };
  const tierRank = { patrao_di_zona: 4, gangster_fodido: 3, o_gunao: 2, young_blood: 1 };
  rows.sort((a, b) => {
    const rr = (roleRank[b.role] || 0) - (roleRank[a.role] || 0);
    if (rr !== 0) return rr;
    return (tierRank[b.tier] || 0) - (tierRank[a.tier] || 0)
         || Number(b.weighted_entregas || 0) - Number(a.weighted_entregas || 0);
  });

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

module.exports = { syncMembros };
