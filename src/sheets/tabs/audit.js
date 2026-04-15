'use strict';
/**
 * Tab Auditoria — registo raw de acções com filtros e pills por tipo.
 */

const { COLOR, NUM_FMT, bodyCell, bodyBoldCell, captionCell, mutedCell, badgeCell } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths,
} = require('./_common');
const { getAuditFull } = require('../queries');
const { growSheet } = require('../cleanup');

const HEADERS = [
  'Timestamp', 'Actor', 'Acção', 'Entidade', 'Ref',
  'Contexto', 'Antes → Depois',
];
const COL_COUNT = HEADERS.length;

const ENTITY_PILL = {
  saida:        { label: 'SAÍDA',    bg: COLOR.RED_BLOOD },
  operation:    { label: 'SAÍDA',    bg: COLOR.RED_BLOOD },
  stock:        { label: 'STOCK',    bg: COLOR.GREEN_DEEP },
  inventory:    { label: 'STOCK',    bg: COLOR.GREEN_DEEP },
  member:       { label: 'MEMBRO',   bg: COLOR.GRAPHITE },
  role:         { label: 'ROLE',     bg: COLOR.GOLD },
  radio:        { label: 'RÁDIO',    bg: COLOR.YELLOW_DEEP },
  sticky:       { label: 'STICKY',   bg: COLOR.GRAY_DARK },
  kill:         { label: 'KILL',     bg: COLOR.RED_DEEP },
  availability: { label: 'PRESENÇA', bg: COLOR.BLUE_DEEP },
  recruitment:  { label: 'RECRUT.',  bg: COLOR.GOLD },
};

function entityBadge(e) {
  const m = ENTITY_PILL[e];
  return m ? badgeCell(m.label, m.bg) : bodyCell(e || '—');
}

function fmtDT(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 19); } catch { return String(d); }
}

function shorten(v, n = 80) {
  if (v === null || v === undefined) return '—';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function syncAudit(batch, sheetId) {
  const rows = await getAuditFull(1000);

  // Breakdown por tipo de entidade (top 4)
  const counts = {};
  for (const r of rows) counts[r.entity_type] = (counts[r.entity_type] || 0) + 1;
  const topEntities = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  growSheet(batch, sheetId, { rows: Math.max(rows.length + 40, 200) });

  let row = headerBlock(batch, sheetId, {
    title: 'Auditoria · Registo da Casa',
    subtitle: `${rows.length} acções registadas · log operacional`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: 'BREAKDOWN', hint: 'top 4 entidades com mais actividade', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [0, 1, 2, 3].map(i => {
    const [ent, n] = topEntities[i] || ['—', 0];
    const label = (ENTITY_PILL[ent] && ENTITY_PILL[ent].label) || ent.toUpperCase();
    return { label, value: n, numberFormat: NUM_FMT.INT, delta: 'registos', deltaDirection: 'flat' };
  }), COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  row = sectionHeader(batch, sheetId, row, {
    title: 'LEDGER DE AUDITORIA', hint: 'últimas 1000 acções', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);

  const dataRows = rows.map(a => {
    const before = shorten(a.before_state, 40);
    const after = shorten(a.after_state, 40);
    const diff = a.before_state ? `${before}  →  ${after}` : after;
    return [
      captionCell(fmtDT(a.created_at)),
      bodyCell(a.actor_name || a.actor_id || '—'),
      bodyBoldCell(a.action || '—'),
      entityBadge(a.entity_type),
      captionCell(a.entity_id || '—'),
      bodyCell(shorten(a.context, 100), { wrap: true }),
      bodyCell(diff, { wrap: true }),
    ];
  });
  row = tableBody(batch, sheetId, row, dataRows, { basicFilter: true, columnCount: COL_COUNT });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Auditoria');

  setWidths(batch, sheetId, [170, 160, 200, 110, 100, 240, 320]);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncAudit };
