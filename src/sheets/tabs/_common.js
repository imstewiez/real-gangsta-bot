'use strict';
/**
 * Helpers partilhados pelas tabs — título, cabeçalhos, KPI bars, banding.
 */

const {
  COLOR, NUM_FMT,
  cell, headerCell, titleCell, signatureCell, subHeaderCell,
  bodyCell, numCell, mutedCell, miniKpi,
} = require('../theme');

// Título de tab — 1 linha em fundo preto com assinatura à direita.
function writeHeader(batch, sheetId, title, columnCount) {
  const titleRow = [titleCell(title)];
  for (let i = 1; i < columnCount - 1; i++) titleRow.push(cell('', { bg: COLOR.BLACK }));
  titleRow.push(signatureCell());

  batch.updateCells(sheetId, 0, 0, [titleRow]);
  batch.mergeCells(sheetId, 0, 1, 0, Math.max(1, columnCount - 1));
  batch.setRowHeight(sheetId, 0, 36);
  return 2;
}

// KPI bar horizontal — 3-4 mini-KPIs ao lado em cima da tabela. Ocupa 1 row.
// `kpis` = [{label, value, fmt}]. Retorna próxima row disponível.
function writeKpiBar(batch, sheetId, row, kpis, columnCount) {
  const cells = [];
  for (const k of kpis) {
    const [labelCell, valueCell] = miniKpi(k.label, k.value, k.fmt);
    cells.push(labelCell, valueCell);
  }
  while (cells.length < columnCount) cells.push(cell('', { bg: COLOR.CHARCOAL }));

  batch.updateCells(sheetId, row, 0, [cells]);
  batch.setRowHeight(sheetId, row, 34);
  return row + 2;
}

// Cabeçalho de tabela — vermelho forte + borda inferior.
function writeTableHeader(batch, sheetId, row, headers) {
  const cells = headers.map(h => headerCell(h));
  batch.updateCells(sheetId, row, 0, [cells]);
  batch.setRowHeight(sheetId, row, 28);
  batch.freezeRows(sheetId, row + 1);
  return row + 1;
}

// Divisor — linha fininha vermelha (ou cinza) entre secções.
function writeDivider(batch, sheetId, row, columnCount, color = COLOR.RED_DEEP) {
  const cells = Array(columnCount).fill(cell('', { bg: color }));
  batch.updateCells(sheetId, row, 0, [cells]);
  batch.setRowHeight(sheetId, row, 3);
  return row + 1;
}

// Secção intermédia com subtítulo (dá respiração entre blocos).
function writeSection(batch, sheetId, row, title, columnCount) {
  const cells = [subHeaderCell(title), ...Array(columnCount - 1).fill(cell('', { bg: COLOR.CHARCOAL }))];
  batch.updateCells(sheetId, row, 0, [cells]);
  batch.mergeCells(sheetId, row, row + 1, 0, columnCount);
  batch.setRowHeight(sheetId, row, 26);
  return row + 1;
}

// Aplica banding intercalado pintando os backgrounds linha a linha.
// `rows` é array de arrays de células já construídas; esta função devolve
// uma NOVA cópia com os backgrounds das linhas pares trocados para CHARCOAL.
// Preserva font/numberFormat/align/borders.
function applyRowBanding(rows) {
  return rows.map((row, i) => {
    if (i % 2 === 0) return row;
    return row.map(c => {
      if (!c) return c;
      const cloned = JSON.parse(JSON.stringify(c));
      if (!cloned.userEnteredFormat) cloned.userEnteredFormat = {};
      // Mantém backgrounds não-neutros (ex: pills, conditional). Só troca
      // quando o bg era BLACK — significa linha "normal".
      const bg = cloned.userEnteredFormat.backgroundColor;
      if (bg && Math.abs(bg.red - COLOR.BLACK.red) < 0.02 && Math.abs(bg.green - COLOR.BLACK.green) < 0.02) {
        cloned.userEnteredFormat.backgroundColor = COLOR.CHARCOAL;
      }
      return cloned;
    });
  });
}

// Set widths concisa.
function setWidths(batch, sheetId, widths) {
  widths.forEach((w, i) => batch.setColumnWidth(sheetId, i, w));
}

// Footer — assinatura discreta no fim da tab.
function writeFooter(batch, sheetId, row, columnCount) {
  const cells = [signatureCell(), ...Array(columnCount - 1).fill(cell('', { bg: COLOR.BLACK }))];
  batch.updateCells(sheetId, row, 0, [cells]);
  batch.mergeCells(sheetId, row, row + 1, 0, columnCount);
  batch.setRowHeight(sheetId, row, 20);
  return row + 1;
}

module.exports = {
  writeHeader, writeKpiBar, writeTableHeader, writeDivider, writeSection,
  applyRowBanding, setWidths, writeFooter,
};
