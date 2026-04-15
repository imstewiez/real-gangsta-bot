'use strict';
/**
 * Tab Movimentos — ledger raw denso com filtros e pills por tipo.
 */

const { COLOR, NUM_FMT, bodyCell, bodyBoldCell, captionCell, mutedCell, numCell, badgeCell } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths,
} = require('./_common');
const { getMovementsFull } = require('../queries');
const { growSheet } = require('../cleanup');

const HEADERS = [
  'Data/Hora', 'Tipo', 'Item', 'Categoria', 'Qtd',
  'Valor Unit.', 'Valor Total', 'Actor',
  'Nome', 'Role', 'Tier',
  'Saída', 'Spot', 'Contexto', 'Notas',
];
const COL_COUNT = HEADERS.length;

const TYPE_PILL = {
  entrega_morador:    { label: 'ENTREGA',   bg: COLOR.GREEN_DEEP },
  entrega_oficial:    { label: 'ENTR.OFIC', bg: COLOR.GREEN_DEEP },
  venda_morador:      { label: 'VENDA',     bg: COLOR.GOLD },
  ajuste_manual:      { label: 'AJUSTE',    bg: COLOR.GRAY_DARK },
  fornecimento_org:   { label: 'FORNECIDO', bg: COLOR.RED_BLOOD },
  devolucao_operacao: { label: 'DEVOL.',    bg: COLOR.GRAPHITE },
  perda_operacao:     { label: 'PERDA',     bg: COLOR.RED_DEEP },
  consumo_operacao:   { label: 'CONSUMO',   bg: COLOR.YELLOW_DEEP },
  saldo_inicial:      { label: 'SALDO INIC',bg: COLOR.IRON },
  apreendido:         { label: 'APREEND.',  bg: COLOR.BLUE_DEEP },
  craftado:           { label: 'CRAFT',     bg: COLOR.GOLD },
};

function typeBadge(type) {
  const m = TYPE_PILL[type];
  return m ? badgeCell(m.label, m.bg) : bodyCell(type || '—');
}

function fmtDT(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 16); } catch { return String(d); }
}

async function syncMovements(batch, sheetId) {
  const rows = await getMovementsFull(2000);

  const totalIn   = rows.filter(r => ['entrega_morador', 'entrega_oficial'].includes(r.movement_type)).reduce((a, r) => a + Number(r.total_value || 0), 0);
  const totalOut  = rows.filter(r => r.movement_type === 'venda_morador').reduce((a, r) => a + Number(r.total_value || 0), 0);
  const totalLost = rows.filter(r => r.movement_type === 'perda_operacao').reduce((a, r) => a + Number(r.total_value || 0), 0);

  growSheet(batch, sheetId, { rows: Math.max(rows.length + 50, 200) });

  const FREEZE_AT = 1;
  let row = headerBlock(batch, sheetId, {
    title: 'Movimentos · Ledger da Rua',
    subtitle: `${rows.length} registos · raw ledger operacional`,
    columnCount: COL_COUNT,
    freezeAt: FREEZE_AT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: 'RESUMO MONETÁRIO', hint: 'últimos 2000 registos', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Registos',  value: rows.length, numberFormat: NUM_FMT.INT,  delta: 'até 2k linhas', deltaDirection: 'flat' },
    { label: 'Entradas',  value: totalIn,     numberFormat: NUM_FMT.EURO, delta: 'entregas (material)', deltaDirection: 'up' },
    { label: 'Vendas',    value: totalOut,    numberFormat: NUM_FMT.EURO, delta: 'vendas morador', deltaDirection: 'up' },
    { label: 'Perdido',   value: totalLost,   numberFormat: NUM_FMT.EURO, delta: 'em operações', deltaDirection: totalLost > 0 ? 'down' : 'flat' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  row = sectionHeader(batch, sheetId, row, {
    title: 'LEDGER COMPLETO', hint: 'filtros activos · mais recente no topo', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);

  const dataRows = rows.map(m => [
    bodyCell(fmtDT(m.created_at)),
    typeBadge(m.movement_type),
    bodyBoldCell(m.item),
    captionCell(m.categoria || '—'),
    numCell(m.quantity, NUM_FMT.INT),
    numCell(Number(m.unit_value), NUM_FMT.EURO_DEC),
    numCell(Number(m.total_value), NUM_FMT.EURO),
    captionCell(m.actor_id || '—'),
    bodyCell(m.member_name || '—'),
    captionCell(m.member_role || '—'),
    captionCell(m.member_tier || '—'),
    m.saida_id ? bodyCell(`#${m.saida_id}`) : mutedCell('—'),
    bodyCell(m.saida_spot || '—'),
    captionCell(m.context || '—'),
    bodyCell(m.notes || '', { wrap: true }),
  ]);
  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  batch.freezeCols(sheetId, FREEZE_AT);
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, FREEZE_AT, 'Movimentos');

  setWidths(batch, sheetId, [140, 110, 160, 110, 55, 85, 95, 130, 140, 80, 80, 55, 110, 130, 200]);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncMovements };
