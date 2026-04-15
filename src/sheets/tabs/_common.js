'use strict';
/**
 * Biblioteca de componentes do design system RedWood.
 *
 * Todas as tabs devem ser montadas via estes blocos — não construir headers
 * e footers "à mão". Assim garantimos consistência visual global.
 *
 * Componentes:
 *   headerBlock     — título + subtítulo + assinatura (2 linhas)
 *   sectionHeader   — subcabeçalho de bloco com accent bar à esquerda
 *   spacer          — row vazia com altura configurável (respirável)
 *   divider         — linha fina colorida entre secções
 *   kpiStrip        — strip horizontal de KPIs (3 linhas: label + valor + delta)
 *   tableHeader     — cabeçalho de tabela com freeze de linhas
 *   tableBody       — escreve rows de data aplicando banding alternado
 *   rankingBlock    — top-N com 1º/2º/3º destacados em gold/silver/bronze
 *   alertBox        — banner curto (info/warn/danger)
 *   footerBlock     — assinatura + contexto + timestamp
 *   setWidths       — aplica larguras de colunas
 *   applyRowBanding — alterna backgrounds para zebra striping subtil
 */

const {
  COLOR, FONT, FONT_FAMILY, NUM_FMT, ROW_H, COL_W, BORDER, SIGNATURE,
  cell, titleCell, subtitleCell, sectionCell, sectionHintCell,
  headerCell, subHeaderCell, bodyCell, bodyBoldCell, mutedCell, captionCell, numCell, signatureCell,
  kpiLabelCell, kpiValueCell, kpiDeltaCell, badgeCell, rankCell, formatDelta,
} = require('../theme');

// ─────────────────────────────────────────────────────────────────────────────
// Header premium — 2 linhas no topo. Linha 0 = título + assinatura à direita.
// Linha 1 = subtítulo + timestamp à direita. Visual consistente em todas as tabs.
// Devolve o próximo row livre.
//
// `freezeAt`: quando > 0 divide os merges no boundary para permitir freezeCols.
// `subtitle`: opcional; se null, salta a linha de subtítulo.
// ─────────────────────────────────────────────────────────────────────────────
function headerBlock(batch, sheetId, { title, subtitle, columnCount, freezeAt = 0, lastUpdated = null }) {
  // Row 0: título + [espaço merged] + assinatura
  const titleRow = [titleCell(title)];
  for (let i = 1; i < columnCount - 1; i++) titleRow.push(cell('', { bg: COLOR.BG_HEADER }));
  titleRow.push(signatureCell());
  batch.updateCells(sheetId, 0, 0, [titleRow]);
  _mergeRowAroundFreeze(batch, sheetId, 0, columnCount, freezeAt);
  batch.setRowHeight(sheetId, 0, ROW_H.TITLE);

  // Row 1: subtítulo + [espaço merged] + timestamp
  if (subtitle !== null) {
    const sub = subtitle || '';
    const ts = lastUpdated || _fmtNowPT();
    const subRow = [subtitleCell(sub)];
    for (let i = 1; i < columnCount - 1; i++) subRow.push(cell('', { bg: COLOR.BG_HEADER }));
    subRow.push(cell(`actualizado ${ts}`, { bg: COLOR.BG_HEADER, font: FONT.CAPTION, align: 'RIGHT', vAlign: 'MIDDLE' }));
    batch.updateCells(sheetId, 1, 0, [subRow]);
    _mergeRowAroundFreeze(batch, sheetId, 1, columnCount, freezeAt);
    batch.setRowHeight(sheetId, 1, ROW_H.SUBTITLE);
    return 2;
  }
  return 1;
}

// Divide o merge de uma linha de full-width em 2 pedaços para não cruzar o
// freeze boundary. [0..freezeAt) e [freezeAt..columnCount-1) com signature em -1.
function _mergeRowAroundFreeze(batch, sheetId, row, columnCount, freezeAt) {
  const mergeEnd = Math.max(1, columnCount - 1);
  if (freezeAt > 0 && freezeAt < mergeEnd) {
    if (freezeAt >= 2) batch.mergeCells(sheetId, row, row + 1, 0, freezeAt);
    if (mergeEnd - freezeAt >= 2) batch.mergeCells(sheetId, row, row + 1, freezeAt, mergeEnd);
  } else {
    batch.mergeCells(sheetId, row, row + 1, 0, mergeEnd);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Spacer — row vazia com altura XS/SM/MD. Simula padding entre blocos.
// ─────────────────────────────────────────────────────────────────────────────
function spacer(batch, sheetId, row, columnCount, size = 'SM') {
  const h = ROW_H[`SPACER_${size}`] || ROW_H.SPACER_SM;
  const cells = Array(columnCount).fill(cell('', { bg: COLOR.BG_APP }));
  batch.updateCells(sheetId, row, 0, [cells]);
  batch.setRowHeight(sheetId, row, h);
  return row + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Divider — barra fina a separar secções. Variant: 'accent' (RED_DEEP) ou 'hair'.
// ─────────────────────────────────────────────────────────────────────────────
function divider(batch, sheetId, row, columnCount, variant = 'accent') {
  const bg = variant === 'hair' ? COLOR.GRAY_DARK : COLOR.RED_DEEP;
  const cells = Array(columnCount).fill(cell('', { bg }));
  batch.updateCells(sheetId, row, 0, [cells]);
  batch.setRowHeight(sheetId, row, ROW_H.DIVIDER);
  return row + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header — subcabeçalho de bloco. Título à esquerda com accent bar,
// hint opcional à direita. Respeita `freezeAt` dividindo o merge no boundary.
// ─────────────────────────────────────────────────────────────────────────────
function sectionHeader(batch, sheetId, row, { title, hint = null, columnCount, freezeAt = 0 }) {
  const cells = [sectionCell(title)];
  const fillCount = hint ? columnCount - 2 : columnCount - 1;
  for (let i = 0; i < fillCount; i++) cells.push(cell('', { bg: COLOR.BG_BLOCK }));
  if (hint) cells.push(sectionHintCell(hint));
  batch.updateCells(sheetId, row, 0, [cells]);

  const mergeEnd = hint ? columnCount - 1 : columnCount;
  if (freezeAt > 0 && freezeAt < mergeEnd) {
    if (freezeAt >= 2)           batch.mergeCells(sheetId, row, row + 1, 0, freezeAt);
    if (mergeEnd - freezeAt >= 2) batch.mergeCells(sheetId, row, row + 1, freezeAt, mergeEnd);
  } else {
    batch.mergeCells(sheetId, row, row + 1, 0, mergeEnd);
  }
  batch.setRowHeight(sheetId, row, ROW_H.SECTION);
  return row + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI strip — 3 linhas verticais (label / value / delta) para N cards lado a lado.
// Se `freezeAt` > 0, os cards vivem em [freezeAt, columnCount); a área frozen
// fica preenchida com empty bg_block cells (nunca merged através do boundary).
//
// cards: [{label, value, numberFormat, delta?, deltaDirection?, deltaFormat?, hint?}]
// Opções: { freezeAt?: number }
// Retorna próxima row disponível.
// ─────────────────────────────────────────────────────────────────────────────
function kpiStrip(batch, sheetId, row, cards, columnCount, opts = {}) {
  const freezeAt = typeof opts === 'number' ? opts : (opts.freezeAt || 0);
  const startCol = freezeAt;
  const availCols = columnCount - startCol;
  const n = cards.length;
  if (n === 0) return row;
  const span = Math.floor(availCols / n);
  const remainder = availCols - span * n;

  // Pré-aloca cada row com empty cells em bg_block
  const labelRow = Array(columnCount).fill(null).map(() => cell('', { bg: COLOR.BG_BLOCK }));
  const valueRow = Array(columnCount).fill(null).map(() => cell('', { bg: COLOR.BG_BLOCK }));
  const deltaRow = Array(columnCount).fill(null).map(() => cell('', { bg: COLOR.BG_BLOCK }));

  let col = startCol;
  cards.forEach((c, i) => {
    const w = span + (i < remainder ? 1 : 0);
    labelRow[col] = kpiLabelCell(c.label);
    valueRow[col] = kpiValueCell(c.value, c.numberFormat);
    const deltaText = c.delta !== undefined ? c.delta : (c.hint || '');
    deltaRow[col] = kpiDeltaCell(deltaText, c.deltaDirection, c.deltaFormat);
    col += w;
  });

  batch.updateCells(sheetId, row,     0, [labelRow]);
  batch.updateCells(sheetId, row + 1, 0, [valueRow]);
  batch.updateCells(sheetId, row + 2, 0, [deltaRow]);

  batch.setRowHeight(sheetId, row,     ROW_H.KPI_LABEL);
  batch.setRowHeight(sheetId, row + 1, ROW_H.KPI);
  batch.setRowHeight(sheetId, row + 2, ROW_H.KPI_LABEL);

  // Merge cells dentro de cada card (unifica visualmente) — só no unfrozen range
  col = startCol;
  cards.forEach((c, i) => {
    const w = span + (i < remainder ? 1 : 0);
    if (w >= 2) {
      batch.mergeCells(sheetId, row,     row + 1, col, col + w);
      batch.mergeCells(sheetId, row + 1, row + 2, col, col + w);
      batch.mergeCells(sheetId, row + 2, row + 3, col, col + w);
    }
    col += w;
  });

  return row + 3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table header — linha com headers em red_blood + freeze das rows acima+esta.
// ─────────────────────────────────────────────────────────────────────────────
function tableHeader(batch, sheetId, row, headers) {
  const cells = headers.map(h => headerCell(h));
  batch.updateCells(sheetId, row, 0, [cells]);
  batch.setRowHeight(sheetId, row, ROW_H.TABLE_HEAD);
  batch.freezeRows(sheetId, row + 1);
  return row + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table body — escreve rows com banding alternado. Se `basicFilter` for true,
// adiciona filtro automático sobre o range. Retorna próxima row.
// ─────────────────────────────────────────────────────────────────────────────
function tableBody(batch, sheetId, row, dataRows, { basicFilter = false, columnCount = null } = {}) {
  if (!dataRows.length) return row;
  const banded = applyRowBanding(dataRows);
  batch.updateCells(sheetId, row, 0, banded);
  for (let i = 0; i < banded.length; i++) batch.setRowHeight(sheetId, row + i, ROW_H.TABLE_ROW);
  if (basicFilter && columnCount) {
    batch.setBasicFilter(sheetId, row - 1, row + banded.length, 0, columnCount);
  }
  return row + banded.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking block — top-N numa secção dedicada. Cada item: {rank, label, value, valueFormat, sub?}.
// Visual: 1º/2º/3º com cores metálicas, resto em body normal.
// ─────────────────────────────────────────────────────────────────────────────
function rankingBlock(batch, sheetId, row, items, columnCount, { labelCol = 1, valueCol = 2 } = {}) {
  items.forEach((it, i) => {
    const line = Array(columnCount).fill(cell('', { bg: COLOR.BG_APP }));
    line[0] = rankCell(it.rank || (i + 1));
    line[labelCol] = (it.rank <= 3) ? bodyBoldCell(it.label || '—') : bodyCell(it.label || '—');
    if (it.sub) line[labelCol + 1] = captionCell(it.sub);
    line[valueCol] = numCell(it.value, it.valueFormat || NUM_FMT.INT, {
      font: (it.rank <= 3) ? FONT.BODY_BOLD : FONT.BODY,
    });
    batch.updateCells(sheetId, row + i, 0, [line]);
    batch.setRowHeight(sheetId, row + i, ROW_H.TABLE_ROW);
  });
  return row + items.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert box — banner curto em 1 linha. Kind: 'info' | 'warn' | 'danger' | 'success'.
// ─────────────────────────────────────────────────────────────────────────────
function alertBox(batch, sheetId, row, { message, kind = 'info', columnCount }) {
  const palette = {
    info:    { bg: COLOR.BLUE_SOFT,       fg: COLOR.BLUE_DEEP,   icon: 'ⓘ' },
    warn:    { bg: COLOR.YELLOW_SOFT,     fg: COLOR.YELLOW_DEEP, icon: '⚠' },
    danger:  { bg: COLOR.RED_SIGNAL_SOFT, fg: COLOR.RED_SIGNAL,  icon: '✖' },
    success: { bg: COLOR.GREEN_SOFT,      fg: COLOR.GREEN_DEEP,  icon: '✓' },
  };
  const p = palette[kind] || palette.info;
  const c = cell(`${p.icon}  ${message}`, {
    bg: p.bg,
    font: { fontFamily: FONT_FAMILY, fontSize: 10, bold: true, foregroundColor: p.fg },
    align: 'LEFT', vAlign: 'MIDDLE',
    borders: { left: { style: 'SOLID_THICK', width: 3, color: p.fg } },
  });
  const fill = Array(columnCount - 1).fill(cell('', { bg: p.bg }));
  batch.updateCells(sheetId, row, 0, [[c, ...fill]]);
  batch.mergeCells(sheetId, row, row + 1, 0, columnCount);
  batch.setRowHeight(sheetId, row, 24);
  return row + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer block — assinatura + contexto + timestamp. 1 linha discreta.
// ─────────────────────────────────────────────────────────────────────────────
function footerBlock(batch, sheetId, row, columnCount, freezeAt = 0, context = '') {
  const left = cell(context ? `${SIGNATURE} · ${context}` : SIGNATURE, {
    bg: COLOR.BG_HEADER, font: FONT.SIG, align: 'LEFT', vAlign: 'MIDDLE', brandRed: true,
  });
  const right = cell(`gerado ${_fmtNowPT()}`, {
    bg: COLOR.BG_HEADER, font: FONT.CAPTION, align: 'RIGHT', vAlign: 'MIDDLE',
  });
  const middle = Array(columnCount - 2).fill(cell('', { bg: COLOR.BG_HEADER }));
  const rowData = columnCount >= 2 ? [left, ...middle, right] : [left];
  batch.updateCells(sheetId, row, 0, [rowData]);
  _mergeRowAroundFreeze(batch, sheetId, row, columnCount, freezeAt);
  batch.setRowHeight(sheetId, row, ROW_H.FOOTER);
  return row + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Banding — altera o bg de rows pares para BG_BLOCK (zebra subtil).
// Preserva cores não-neutras (pills, highlights).
// ─────────────────────────────────────────────────────────────────────────────
function applyRowBanding(rows) {
  return rows.map((row, i) => {
    if (i % 2 === 0) return row;
    return row.map(c => {
      if (!c || !c.userEnteredFormat) return c;
      const cloned = JSON.parse(JSON.stringify(c));
      const bg = cloned.userEnteredFormat.backgroundColor;
      if (!bg) return cloned;
      const isBodyBg = Math.abs(bg.red - COLOR.BG_APP.red) < 0.02 && Math.abs(bg.green - COLOR.BG_APP.green) < 0.02;
      if (isBodyBg) cloned.userEnteredFormat.backgroundColor = COLOR.BG_BLOCK;
      return cloned;
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────
function setWidths(batch, sheetId, widths) {
  widths.forEach((w, i) => batch.setColumnWidth(sheetId, i, w));
}

// Auto-resize de todas as colunas usadas até ao conteúdo. Chamar NO FIM da
// syncOne (depois de todo o conteúdo escrito) para ajustar larguras ao dado.
// Não toca nas rows — as alturas são design decisions do design system.
function autoResizeColumns(batch, sheetId, columnCount) {
  batch.autoResize(sheetId, 'COLUMNS', 0, columnCount);
}

function _fmtNowPT() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy shims — manter os nomes antigos a apontar para os novos enquanto
// as tabs ainda não foram migradas.
// ─────────────────────────────────────────────────────────────────────────────
const writeHeader = (batch, sheetId, title, columnCount, freezeAt = 0) =>
  headerBlock(batch, sheetId, { title, subtitle: null, columnCount, freezeAt });

const writeKpiBar = (batch, sheetId, row, kpis, columnCount) =>
  kpiStrip(batch, sheetId, row, kpis.map(k => ({
    label: k.label, value: k.value, numberFormat: k.fmt, hint: '',
  })), columnCount);

const writeTableHeader = tableHeader;

const writeDivider = (batch, sheetId, row, columnCount, color) => {
  const variant = (color && color.red !== undefined && Math.abs(color.red - COLOR.RED_DEEP.red) > 0.1) ? 'hair' : 'accent';
  return divider(batch, sheetId, row, columnCount, variant);
};

const writeSection = (batch, sheetId, row, title, columnCount) =>
  sectionHeader(batch, sheetId, row, { title, columnCount });

const writeFooter = (batch, sheetId, row, columnCount, freezeAt = 0) =>
  footerBlock(batch, sheetId, row, columnCount, freezeAt);

module.exports = {
  // API nova
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  rankingBlock, alertBox, footerBlock, setWidths, autoResizeColumns, applyRowBanding,
  // API antiga (shims)
  writeHeader, writeKpiBar, writeTableHeader, writeDivider, writeSection, writeFooter,
};
