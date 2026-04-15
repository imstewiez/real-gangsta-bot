'use strict';
/**
 * Tab Movimentos — ledger com KPI bar + banding + pills de tipo.
 */

const { COLOR, NUM_FMT, bodyCell, numCell, pillCell } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getMovementsFull } = require('../queries');

const HEADERS = [
  'Data/Hora', 'Tipo', 'Item', 'Categoria', 'Qtd',
  'Valor Unit.', 'Valor Total', 'Actor',
  'Nome', 'Role', 'Tier',
  'Saída', 'Spot', 'Contexto', 'Notas',
];

const TYPE_PILL = {
  entrega_morador:  { label: 'ENTREGA',    bg: COLOR.GREEN_DEEP },
  entrega_oficial:  { label: 'ENTR. OFIC.',bg: COLOR.GREEN_DEEP },
  venda_morador:    { label: 'VENDA',      bg: COLOR.GOLD },
  ajuste_stock:     { label: 'AJUSTE',     bg: COLOR.GRAY_DARK },
  fornecimento_org: { label: 'FORNECIDO',  bg: COLOR.RED_BLOOD },
  devolucao_saida:  { label: 'DEVOL.',     bg: COLOR.GRAPHITE },
  perda_saida:      { label: 'PERDA',      bg: COLOR.RED_DEEP },
  consumo_saida:    { label: 'CONSUMO',    bg: COLOR.YELLOW_DEEP },
};

function typePill(type) {
  const m = TYPE_PILL[type];
  return m ? pillCell(m.label, m.bg) : bodyCell(type || '—');
}

function fmtDT(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 16); } catch { return String(d); }
}

async function syncMovements(batch, sheetId) {
  const rows = await getMovementsFull(2000);
  const COL_COUNT = HEADERS.length;

  const totalIn = rows.filter(r => ['entrega_morador', 'entrega_oficial'].includes(r.movement_type)).reduce((a, r) => a + Number(r.total_value || 0), 0);
  const totalOut = rows.filter(r => r.movement_type === 'venda_morador').reduce((a, r) => a + Number(r.total_value || 0), 0);

  const FREEZE_AT = 1;
  let row = writeHeader(batch, sheetId, 'Movimentos · Ledger da Rua', COL_COUNT, FREEZE_AT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Registos', value: rows.length, fmt: NUM_FMT.INT },
    { label: 'Entradas', value: totalIn,     fmt: NUM_FMT.EURO },
    { label: 'Vendas',   value: totalOut,    fmt: NUM_FMT.EURO },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(m => [
    bodyCell(fmtDT(m.created_at)),
    typePill(m.movement_type),
    bodyCell(m.item),
    bodyCell(m.categoria || '—'),
    numCell(m.quantity, NUM_FMT.INT),
    numCell(Number(m.unit_value), NUM_FMT.EURO_DEC),
    numCell(Number(m.total_value), NUM_FMT.EURO),
    bodyCell(m.actor_id || '—'),
    bodyCell(m.member_name || '—'),
    bodyCell(m.member_role || '—'),
    bodyCell(m.member_tier || '—'),
    m.saida_id ? bodyCell(`#${m.saida_id}`) : bodyCell('—'),
    bodyCell(m.saida_spot || '—'),
    bodyCell(m.context || '—'),
    bodyCell(m.notes || '', { wrap: true }),
  ]);

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);
  batch.freezeCols(sheetId, FREEZE_AT);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT, FREEZE_AT);

  setWidths(batch, sheetId, [140, 110, 160, 120, 55, 85, 95, 130, 140, 85, 95, 60, 110, 140, 220]);
}

module.exports = { syncMovements };
