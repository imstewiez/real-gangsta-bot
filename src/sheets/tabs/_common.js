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
  COLOR,
  FONT,
  FONT_FAMILY,
  NUM_FMT,
  ROW_H,
  BORDER,
  SIGNATURE,
  cell,
  titleCell,
  subtitleCell,
  sectionCell,
  sectionHintCell,
  headerCell,
  bodyCell,
  bodyBoldCell,
  captionCell,
  numCell,
  signatureCell,
  kpiLabelCell,
  kpiValueCell,
  kpiDeltaCell,
  miniKPILabelCell,
  miniKPIValueCell,
  miniKPIDeltaCell,
  rankCell,
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
    subRow.push(
      cell(`actualizado ${ts}`, { bg: COLOR.BG_HEADER, font: FONT.CAPTION, align: 'RIGHT', vAlign: 'MIDDLE' })
    );
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
    if (freezeAt >= 2) batch.mergeCells(sheetId, row, row + 1, 0, freezeAt);
    if (mergeEnd - freezeAt >= 2) batch.mergeCells(sheetId, row, row + 1, freezeAt, mergeEnd);
  } else {
    batch.mergeCells(sheetId, row, row + 1, 0, mergeEnd);
  }
  batch.setRowHeight(sheetId, row, ROW_H.SECTION);
  return row + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini KPI row — 2 linhas de altura para N cards lado a lado (metade do kpiStrip).
// Row 1: label (7px) + value (14px bold) empilhados com wrap numa célula.
// Row 2: delta (7px colorido).
// Usa bg CARD para destacar do fundo da app.
//
// cards: [{label, value, numberFormat, delta?, deltaDirection?, hint?}]
// Retorna próxima row disponível.
// ─────────────────────────────────────────────────────────────────────────────
function miniKPIRow(batch, sheetId, row, cards, columnCount) {
  const n = cards.length;
  if (n === 0) return row;
  const span = Math.floor(columnCount / n);
  const remainder = columnCount - span * n;

  const labelRow = Array(columnCount).fill(cell('', { bg: COLOR.BG_CARD }));
  const deltaRow = Array(columnCount).fill(cell('', { bg: COLOR.BG_CARD }));

  let col = 0;
  cards.forEach((c, i) => {
    const w = span + (i < remainder ? 1 : 0);
    const sep = i > 0 ? BORDER.LEFT_SEPARATOR : undefined;
    const label = (c.label || '').toUpperCase();
    const deltaText = c.delta !== undefined ? c.delta : c.hint || '';
    const deltaDir = c.deltaDirection || 'flat';

    // Valor formatado como string
    const valStr =
      c.numberFormat && Number.isFinite(c.value)
        ? c.value.toLocaleString('pt-PT', { maximumFractionDigits: 2 })
        : String(c.value ?? '—');

    // Row 1: label + valor (wrap)
    const text1 = `${label}\n${valStr}`;
    labelRow[col] = cell(text1, {
      bg: COLOR.BG_CARD,
      font: { fontFamily: FONT_FAMILY, fontSize: 13, bold: true, foregroundColor: COLOR.WHITE },
      align: 'LEFT',
      vAlign: 'MIDDLE',
      wrap: true,
      borders: sep,
    });

    // Row 2: delta colorido
    let deltaColor = COLOR.GRAY;
    if (deltaDir === 'up' || deltaDir === true) deltaColor = COLOR.GREEN_DEEP;
    else if (deltaDir === 'down' || deltaDir === false) deltaColor = COLOR.RED_SIGNAL;

    deltaRow[col] = cell(deltaText, {
      bg: COLOR.BG_CARD,
      font: { fontFamily: FONT_FAMILY, fontSize: 7, bold: true, foregroundColor: deltaColor },
      align: 'LEFT',
      vAlign: 'TOP',
      borders: sep,
    });

    col += w;
  });

  batch.updateCells(sheetId, row, 0, [labelRow]);
  batch.updateCells(sheetId, row + 1, 0, [deltaRow]);
  batch.setRowHeight(sheetId, row, 36);
  batch.setRowHeight(sheetId, row + 1, 14);
  return row + 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact ranking row — escreve N itens de ranking numa só row, side-by-side.
// Cada item: {rank, label, value, valueFormat?, sub?}
// Usado para destaques/top-N compactos.
// ─────────────────────────────────────────────────────────────────────────────
function compactRankingRow(batch, sheetId, row, items, columnCount) {
  const n = items.length;
  if (n === 0) return row;
  const span = Math.floor(columnCount / n);
  const remainder = columnCount - span * n;

  const rowCells = Array(columnCount).fill(cell('', { bg: COLOR.BG_APP }));
  let col = 0;
  items.forEach((it, i) => {
    const w = span + (i < remainder ? 1 : 0);
    const sep = i > 0 ? BORDER.LEFT_SEPARATOR : undefined;
    const label = it.label || '';
    const valStr =
      it.value !== undefined && it.value !== null
        ? it.valueFormat
          ? it.value.toLocaleString('pt-PT')
          : String(it.value)
        : '—';
    const sub = it.sub || '';
    const fullText = sub ? `${label}\n${valStr}\n${sub}` : `${label}\n${valStr}`;

    const rankC = rankCell(it.rank || i + 1);
    // Merge rank + texto numa célula só com wrap
    rowCells[col] = {
      userEnteredValue: { stringValue: fullText },
      userEnteredFormat: {
        backgroundColor: COLOR.BG_BLOCK,
        textFormat: { fontFamily: FONT_FAMILY, fontSize: 10, bold: true, foregroundColor: COLOR.OFF_WHITE },
        horizontalAlignment: 'LEFT',
        verticalAlignment: 'MIDDLE',
        wrapStrategy: 'WRAP',
        borders: sep ? { ...sep, left: sep.left } : undefined,
      },
    };

    col += w;
  });

  batch.updateCells(sheetId, row, 0, [rowCells]);
  batch.setRowHeight(sheetId, row, 36);
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
  const freezeAt = typeof opts === 'number' ? opts : opts.freezeAt || 0;
  const startCol = freezeAt;
  const availCols = columnCount - startCol;
  const n = cards.length;
  if (n === 0) return row;
  const span = Math.floor(availCols / n);
  const remainder = availCols - span * n;

  // Pré-aloca cada row com empty cells em bg_block
  const labelRow = Array(columnCount)
    .fill(null)
    .map(() => cell('', { bg: COLOR.BG_BLOCK }));
  const valueRow = Array(columnCount)
    .fill(null)
    .map(() => cell('', { bg: COLOR.BG_BLOCK }));
  const deltaRow = Array(columnCount)
    .fill(null)
    .map(() => cell('', { bg: COLOR.BG_BLOCK }));

  let col = startCol;
  cards.forEach((c, i) => {
    const w = span + (i < remainder ? 1 : 0);
    // Separador vertical sutil entre cards (excepto o primeiro)
    const sep = i > 0 ? BORDER.LEFT_SEPARATOR : undefined;
    labelRow[col] = kpiLabelCell(c.label);
    valueRow[col] = kpiValueCell(c.value, c.numberFormat);
    const deltaText = c.delta !== undefined ? c.delta : c.hint || '';
    deltaRow[col] = kpiDeltaCell(deltaText, c.deltaDirection, c.deltaFormat);
    if (sep) {
      if (!labelRow[col].userEnteredFormat) labelRow[col].userEnteredFormat = {};
      labelRow[col].userEnteredFormat.borders = sep;
      if (!valueRow[col].userEnteredFormat) valueRow[col].userEnteredFormat = {};
      valueRow[col].userEnteredFormat.borders = sep;
      if (!deltaRow[col].userEnteredFormat) deltaRow[col].userEnteredFormat = {};
      deltaRow[col].userEnteredFormat.borders = sep;
    }
    col += w;
  });

  batch.updateCells(sheetId, row, 0, [labelRow]);
  batch.updateCells(sheetId, row + 1, 0, [valueRow]);
  batch.updateCells(sheetId, row + 2, 0, [deltaRow]);

  batch.setRowHeight(sheetId, row, ROW_H.KPI_LABEL);
  batch.setRowHeight(sheetId, row + 1, ROW_H.KPI);
  batch.setRowHeight(sheetId, row + 2, ROW_H.KPI_LABEL);

  // Merge cells dentro de cada card (unifica visualmente) — só no unfrozen range
  col = startCol;
  cards.forEach((c, i) => {
    const w = span + (i < remainder ? 1 : 0);
    if (w >= 2) {
      batch.mergeCells(sheetId, row, row + 1, col, col + w);
      batch.mergeCells(sheetId, row + 1, row + 2, col, col + w);
      batch.mergeCells(sheetId, row + 2, row + 3, col, col + w);
    }
    col += w;
  });

  return row + 3;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table header — linha com headers em red_blood. Sem freeze (decisão UX).
// ─────────────────────────────────────────────────────────────────────────────
function tableHeader(batch, sheetId, row, headers) {
  const cells = headers.map(h => {
    const c = headerCell(h);
    if (!c.userEnteredFormat) c.userEnteredFormat = {};
    c.userEnteredFormat.borders = {
      ...(c.userEnteredFormat.borders || {}),
      bottom: { style: 'SOLID', width: 1, color: COLOR.RED_DEEP },
    };
    return c;
  });
  batch.updateCells(sheetId, row, 0, [cells]);
  batch.setRowHeight(sheetId, row, ROW_H.TABLE_HEAD);
  return row + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Table body — escreve rows com banding alternado. Se `basicFilter` for true,
// adiciona filtro automático sobre o range. Retorna próxima row.
// ─────────────────────────────────────────────────────────────────────────────
function tableBody(batch, sheetId, row, dataRows, { basicFilter = false, columnCount = null } = {}) {
  if (!dataRows.length) return row;
  const maxCols = columnCount || Math.max(...dataRows.map(r => r.length));
  const padded = dataRows.map(r => {
    if (r.length >= maxCols) return r;
    return [...r, ...Array(maxCols - r.length).fill(cell('', { bg: COLOR.BG_APP }))];
  });
  const banded = applyRowBanding(padded);
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
    line[0] = rankCell(it.rank || i + 1);
    line[labelCol] = it.rank <= 3 ? bodyBoldCell(it.label || '—') : bodyCell(it.label || '—');
    if (it.sub) line[labelCol + 1] = captionCell(it.sub);
    line[valueCol] = numCell(it.value, it.valueFormat || NUM_FMT.INT, {
      font: it.rank <= 3 ? FONT.BODY_BOLD : FONT.BODY,
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
    info: { bg: COLOR.BLUE_SOFT, fg: COLOR.BLUE_DEEP, icon: 'i' },
    warn: { bg: COLOR.YELLOW_SOFT, fg: COLOR.YELLOW_DEEP, icon: '!' },
    danger: { bg: COLOR.RED_SIGNAL_SOFT, fg: COLOR.RED_SIGNAL, icon: 'x' },
    success: { bg: COLOR.GREEN_SOFT, fg: COLOR.GREEN_DEEP, icon: '+' },
  };
  const p = palette[kind] || palette.info;
  const c = cell(`[${p.icon}] ${message}`, {
    bg: p.bg,
    font: { fontFamily: FONT_FAMILY, fontSize: 9, bold: true, foregroundColor: p.fg },
    align: 'LEFT',
    vAlign: 'MIDDLE',
    borders: { left: { style: 'SOLID_THICK', width: 3, color: p.fg } },
  });
  const fill = Array(columnCount - 1).fill(cell('', { bg: p.bg }));
  batch.updateCells(sheetId, row, 0, [[c, ...fill]]);
  batch.mergeCells(sheetId, row, row + 1, 0, columnCount);
  batch.setRowHeight(sheetId, row, 20);
  return row + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer block — assinatura + contexto + timestamp. 1 linha discreta.
// ─────────────────────────────────────────────────────────────────────────────
function footerBlock(batch, sheetId, row, columnCount, freezeAt = 0, context = '') {
  const left = cell(context ? `${SIGNATURE} · ${context}` : SIGNATURE, {
    bg: COLOR.BG_HEADER,
    font: FONT.SIG,
    align: 'LEFT',
    vAlign: 'MIDDLE',
    brandRed: true,
  });
  const right = cell(`gerado ${_fmtNowPT()}`, {
    bg: COLOR.BG_HEADER,
    font: FONT.CAPTION,
    align: 'RIGHT',
    vAlign: 'MIDDLE',
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
      const cloned = { ...c, userEnteredFormat: { ...c.userEnteredFormat } };
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

// Auto-resize de colunas usadas até ao conteúdo. Chamar NO FIM da syncOne
// para ajustar larguras ao dado.
function autoResizeColumns(batch, sheetId, columnCount) {
  batch.autoResize(sheetId, 'COLUMNS', 0, columnCount);
}

// Auto-resize de todas as rows usadas. Usa wrap strategy para crescer rows
// com texto multi-linha. Override de qualquer setRowHeight anterior.
function autoResizeRows(batch, sheetId, rowCount) {
  batch.autoResize(sheetId, 'ROWS', 0, rowCount);
}

// Auto-resize completo (colunas + rows). Chamar NO FIM da sync.
function autoResizeAll(batch, sheetId, rowCount, columnCount) {
  autoResizeColumns(batch, sheetId, columnCount);
  autoResizeRows(batch, sheetId, rowCount);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gang title helper — garante consistência de título em todas as tabs.
// Todas as tabs devem usar este helper para o título principal.
// ─────────────────────────────────────────────────────────────────────────────
function gangTitle(baseTitle) {
  return `${baseTitle} · Firma RedWood`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard section layout — sectionHeader + kpiStrip + spacer + divider
// num cards (4 ideal). Retorna a row seguinte.
// ─────────────────────────────────────────────────────────────────────────────
function sectionWithKPIs(batch, sheetId, row, { title, hint, cards, columnCount }) {
  row = sectionHeader(batch, sheetId, row, { title, hint, columnCount });
  row = kpiStrip(batch, sheetId, row, cards, columnCount);
  row = spacer(batch, sheetId, row, columnCount, 'SM');
  row = divider(batch, sheetId, row, columnCount, 'accent');
  return row;
}

// ─────────────────────────────────────────────────────────────────────────────
// Total row — linha de totais/resumo no fundo de uma tabela. Visual distinto
// com fundo BG_BLOCK_ALT, texto bold branco, borda topo RED_DEEP.
//
// values: array de {col, value, numberFormat} ou array directo de cells.
// ─────────────────────────────────────────────────────────────────────────────
function totalRow(batch, sheetId, row, { label = 'TOTAL', values = [], columnCount, bg }) {
  const boldWhite = { fontFamily: FONT_FAMILY, fontSize: 10, bold: true, foregroundColor: COLOR.WHITE };
  const topBorder = { top: { style: 'SOLID', width: 1, color: COLOR.RED_DEEP } };
  const rowBg = bg || COLOR.BG_BLOCK_ALT;
  const cells = Array(columnCount)
    .fill(null)
    .map(() => cell('', { bg: rowBg, borders: topBorder }));
  cells[0] = cell(label, {
    bg: rowBg,
    font: boldWhite,
    align: 'RIGHT',
    vAlign: 'MIDDLE',
    borders: topBorder,
  });
  for (const v of values) {
    if (v.col >= 0 && v.col < columnCount) {
      cells[v.col] = cell(v.value, {
        bg: rowBg,
        font: boldWhite,
        align: 'RIGHT',
        vAlign: 'MIDDLE',
        numberFormat: v.numberFormat,
        borders: topBorder,
      });
    }
  }
  batch.updateCells(sheetId, row, 0, [cells]);
  batch.setRowHeight(sheetId, row, ROW_H.TABLE_ROW);
  return row + 1;
}

function _fmtNowPT() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

module.exports = {
  headerBlock,
  sectionHeader,
  spacer,
  divider,
  kpiStrip,
  miniKPIRow,
  compactRankingRow,
  tableHeader,
  tableBody,
  rankingBlock,
  alertBox,
  footerBlock,
  totalRow,
  setWidths,
  autoResizeColumns,
  autoResizeRows,
  autoResizeAll,
  applyRowBanding,
  gangTitle,
  sectionWithKPIs,
  ROW_H,
};
