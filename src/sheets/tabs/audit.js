'use strict';
/**
 * Tab Auditoria — últimas 1000 acções com banding + pills de tipo.
 */

const { COLOR, NUM_FMT, bodyCell, pillCell } = require('../theme');
const { writeHeader, writeKpiBar, writeTableHeader, writeDivider, setWidths, applyRowBanding, writeFooter } = require('./_common');
const { getAuditFull } = require('../queries');

const HEADERS = [
  'Timestamp', 'Actor', 'Ação', 'Tipo', 'Entidade', 'Contexto', 'Diff',
];

const ENTITY_PILL = {
  saida:         { label: 'SAÍDA',     bg: COLOR.RED_BLOOD },
  stock:         { label: 'STOCK',     bg: COLOR.GREEN_DEEP },
  member:        { label: 'MEMBRO',    bg: COLOR.GRAPHITE },
  role:          { label: 'ROLE',      bg: COLOR.GOLD },
  radio:         { label: 'RÁDIO',     bg: COLOR.YELLOW_DEEP },
  sticky:        { label: 'STICKY',    bg: COLOR.GRAY_DARK },
  kill:          { label: 'KILL',      bg: COLOR.RED_DEEP },
  availability:  { label: 'PRESENÇA',  bg: COLOR.GRAPHITE },
};

function entityPill(e) {
  const m = ENTITY_PILL[e];
  return m ? pillCell(m.label, m.bg) : bodyCell(e || '—');
}

function fmtDT(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 19); } catch { return String(d); }
}

function shorten(v, n = 60) {
  if (!v) return '—';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function syncAudit(batch, sheetId) {
  const rows = await getAuditFull(1000);
  const COL_COUNT = HEADERS.length;

  let row = writeHeader(batch, sheetId, 'Auditoria · Registo da Casa', COL_COUNT);
  row = writeKpiBar(batch, sheetId, row, [
    { label: 'Registos', value: rows.length, fmt: NUM_FMT.INT },
  ], COL_COUNT);
  row = writeDivider(batch, sheetId, row, COL_COUNT);
  row = writeTableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  const dataRows = rows.map(a => {
    const before = shorten(a.before_state, 60);
    const after = shorten(a.after_state, 60);
    const diff = a.before_state ? `${before} → ${after}` : after;
    return [
      bodyCell(fmtDT(a.created_at)),
      bodyCell(a.actor_name || a.actor_id || '—'),
      bodyCell(a.action || '—'),
      entityPill(a.entity_type),
      bodyCell(a.entity_id || '—'),
      bodyCell(shorten(a.context, 120), { wrap: true }),
      bodyCell(diff, { wrap: true }),
    ];
  });

  if (dataRows.length) batch.updateCells(sheetId, row, 0, applyRowBanding(dataRows));

  batch.setBasicFilter(sheetId, firstDataRow - 1, firstDataRow + dataRows.length, 0, COL_COUNT);

  writeFooter(batch, sheetId, firstDataRow + dataRows.length + 2, COL_COUNT);

  setWidths(batch, sheetId, [160, 160, 180, 100, 100, 240, 280]);
}

module.exports = { syncAudit };
