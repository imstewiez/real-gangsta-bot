'use strict';
/**
 * Tema RedWood — paleta central e helpers de formatação para Google Sheets.
 *
 * Regras duras:
 *   - Vermelho escuro + carvão + cinza + branco. Dourado muito leve só para
 *     destaques pontuais. Nunca arco-íris.
 *   - Formatação é declarativa (funções devolvem objectos compatíveis com
 *     batchUpdate requests). Quem escreve só chama o helper.
 */

// ─── Paleta RedWood (float 0..1 — formato Google Sheets RGB) ──────────────────
function rgb(r, g, b) { return { red: r / 255, green: g / 255, blue: b / 255 }; }

const COLOR = {
  // Primárias
  RED_DEEP:        rgb(139,  0,  0),   // #8B0000 — accent forte
  RED_BLOOD:       rgb(178, 34, 34),   // #B22222 — header
  RED_SOFT:        rgb(204, 85,  85),   // #CC5555 — warn suave
  BLACK:           rgb( 15, 15, 15),   // background escuro
  CHARCOAL:        rgb( 28, 28, 28),   // #1C1C1C — secções
  GRAPHITE:        rgb( 58, 58, 58),   // #3A3A3A — linhas pares
  GRAY_DARK:       rgb( 90, 90, 90),   // separadores
  GRAY:            rgb(140,140,140),   // labels secundários
  GRAY_LIGHT:      rgb(220,220,220),   // linhas ímpares
  WHITE:           rgb(255,255,255),
  OFF_WHITE:       rgb(245,245,245),
  // Contextuais
  GREEN_DEEP:      rgb( 34,139, 34),
  GREEN_SOFT:      rgb(200,230,201),
  YELLOW_DEEP:     rgb(230,167, 17),
  YELLOW_SOFT:     rgb(255,243,205),
  RED_SIGNAL:      rgb(220, 53, 69),
  RED_SIGNAL_SOFT: rgb(248,215,218),
  GOLD:            rgb(184,134, 11),   // destaque elegante (topos)
};

const FONT = {
  HEADER:   { fontFamily: 'Inter', fontSize: 11, bold: true, foregroundColor: COLOR.WHITE },
  SUBHEAD:  { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.OFF_WHITE },
  BODY:     { fontFamily: 'Inter', fontSize: 10, foregroundColor: COLOR.OFF_WHITE },
  MUTED:    { fontFamily: 'Inter', fontSize:  9, foregroundColor: COLOR.GRAY },
  KPI_LBL:  { fontFamily: 'Inter', fontSize:  9, bold: true, foregroundColor: COLOR.GRAY_LIGHT },
  KPI_VAL:  { fontFamily: 'Inter', fontSize: 20, bold: true, foregroundColor: COLOR.WHITE },
  KPI_DELTA:{ fontFamily: 'Inter', fontSize:  9, foregroundColor: COLOR.GRAY_LIGHT },
  TITLE:    { fontFamily: 'Inter', fontSize: 16, bold: true, foregroundColor: COLOR.WHITE },
  SIG:      { fontFamily: 'Inter', fontSize:  9, italic: true, foregroundColor: COLOR.GRAY },
};

// Signature assinado em todas as tabs.
const SIGNATURE = 'Firma RedWood';

// ─── Helpers de célula/formatação ─────────────────────────────────────────────
function cell(value, opts = {}) {
  const v = { userEnteredValue: {} };
  if (value === null || value === undefined) v.userEnteredValue.stringValue = '';
  else if (typeof value === 'number') v.userEnteredValue.numberValue = value;
  else if (typeof value === 'boolean') v.userEnteredValue.boolValue = value;
  else if (typeof value === 'string' && value.startsWith('=')) v.userEnteredValue.formulaValue = value;
  else v.userEnteredValue.stringValue = String(value);

  const fmt = {};
  if (opts.bg) fmt.backgroundColor = opts.bg;
  if (opts.font) fmt.textFormat = opts.font;
  if (opts.align) fmt.horizontalAlignment = opts.align;
  if (opts.vAlign) fmt.verticalAlignment = opts.vAlign;
  if (opts.numberFormat) fmt.numberFormat = opts.numberFormat;
  if (opts.wrap) fmt.wrapStrategy = 'WRAP';
  if (opts.borders) fmt.borders = opts.borders;
  if (Object.keys(fmt).length) v.userEnteredFormat = fmt;

  return v;
}

// Formatos numéricos prontos
const NUM_FMT = {
  INT:       { type: 'NUMBER',  pattern: '#,##0' },
  DEC:       { type: 'NUMBER',  pattern: '#,##0.00' },
  EURO:      { type: 'CURRENCY', pattern: '#,##0 €' },
  EURO_DEC:  { type: 'CURRENCY', pattern: '#,##0.00 €' },
  PCT:       { type: 'PERCENT', pattern: '0.0%' },
  PCT_RAW:   { type: 'NUMBER',  pattern: '0.0"%"' },
  DATE:      { type: 'DATE',    pattern: 'yyyy-MM-dd' },
  DATETIME:  { type: 'DATE_TIME', pattern: 'yyyy-MM-dd HH:mm' },
};

// Estilos de célula reusáveis
function headerCell(value) {
  return cell(value, { bg: COLOR.RED_BLOOD, font: FONT.HEADER, align: 'CENTER', vAlign: 'MIDDLE' });
}

function subHeaderCell(value) {
  return cell(value, { bg: COLOR.CHARCOAL, font: FONT.SUBHEAD, align: 'LEFT', vAlign: 'MIDDLE' });
}

function titleCell(value) {
  return cell(value, { bg: COLOR.BLACK, font: FONT.TITLE, align: 'LEFT', vAlign: 'MIDDLE' });
}

function signatureCell() {
  return cell(`— ${SIGNATURE}`, { bg: COLOR.BLACK, font: FONT.SIG, align: 'RIGHT', vAlign: 'MIDDLE' });
}

function kpiLabelCell(value) {
  return cell(value, { bg: COLOR.CHARCOAL, font: FONT.KPI_LBL, align: 'LEFT', vAlign: 'BOTTOM' });
}

function kpiValueCell(value, numberFormat) {
  return cell(value, {
    bg: COLOR.CHARCOAL, font: FONT.KPI_VAL,
    align: 'LEFT', vAlign: 'MIDDLE',
    numberFormat: numberFormat || undefined,
  });
}

function kpiDeltaCell(value, positive) {
  const font = { ...FONT.KPI_DELTA, foregroundColor: positive === true ? COLOR.GREEN_SOFT : positive === false ? COLOR.RED_SIGNAL_SOFT : COLOR.GRAY_LIGHT };
  return cell(value, { bg: COLOR.CHARCOAL, font, align: 'LEFT', vAlign: 'TOP' });
}

function bodyCell(value, opts = {}) {
  return cell(value, { bg: COLOR.BLACK, font: FONT.BODY, vAlign: 'MIDDLE', ...opts });
}

function mutedCell(value, opts = {}) {
  return cell(value, { bg: COLOR.BLACK, font: FONT.MUTED, vAlign: 'MIDDLE', ...opts });
}

function numCell(value, numberFormat, opts = {}) {
  return cell(value, { bg: COLOR.BLACK, font: FONT.BODY, align: 'RIGHT', vAlign: 'MIDDLE', numberFormat, ...opts });
}

// Fundo alternativo (linha par) para banding aplicado na data.
function bodyCellAlt(value, opts = {}) {
  return cell(value, { bg: COLOR.CHARCOAL, font: FONT.BODY, vAlign: 'MIDDLE', ...opts });
}
function numCellAlt(value, numberFormat, opts = {}) {
  return cell(value, { bg: COLOR.CHARCOAL, font: FONT.BODY, align: 'RIGHT', vAlign: 'MIDDLE', numberFormat, ...opts });
}

// Indicador visual coloridinho — usado em colunas de status.
function pillCell(value, pillColor, textColor) {
  return cell(value, {
    bg: pillColor,
    font: { fontFamily: 'Inter', fontSize: 9, bold: true, foregroundColor: textColor || COLOR.WHITE },
    align: 'CENTER',
    vAlign: 'MIDDLE',
  });
}

// Mini-KPI compacto (uma linha só) — para bars em cabeçalho de cada tab.
function miniKpi(label, value, valueFormat) {
  return [
    cell(label.toUpperCase(), {
      bg: COLOR.CHARCOAL,
      font: { fontFamily: 'Inter', fontSize: 8, bold: true, foregroundColor: COLOR.GRAY },
      align: 'LEFT',
      vAlign: 'MIDDLE',
    }),
    cell(value, {
      bg: COLOR.CHARCOAL,
      font: { fontFamily: 'Inter', fontSize: 13, bold: true, foregroundColor: COLOR.WHITE },
      align: 'LEFT',
      vAlign: 'MIDDLE',
      numberFormat: valueFormat,
    }),
  ];
}

// Borda fina neutra para delimitar blocos.
function border(position) {
  return {
    [position]: { style: 'SOLID', width: 1, color: COLOR.GRAPHITE },
  };
}

// ─── Conditional formatting builders ─────────────────────────────────────────
function conditionalGradient(sheetId, startRow, startCol, endRow, endCol, minColor, midColor, maxColor) {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol }],
        gradientRule: {
          minpoint: { color: minColor, type: 'MIN' },
          midpoint: { color: midColor, type: 'PERCENTILE', value: '50' },
          maxpoint: { color: maxColor, type: 'MAX' },
        },
      },
      index: 0,
    },
  };
}

function conditionalGreaterThan(sheetId, startRow, startCol, endRow, endCol, threshold, bg) {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol }],
        booleanRule: {
          condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: String(threshold) }] },
          format: { backgroundColor: bg },
        },
      },
      index: 0,
    },
  };
}

function conditionalLessThan(sheetId, startRow, startCol, endRow, endCol, threshold, bg) {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [{ sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol }],
        booleanRule: {
          condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: String(threshold) }] },
          format: { backgroundColor: bg },
        },
      },
      index: 0,
    },
  };
}

module.exports = {
  COLOR, FONT, NUM_FMT, SIGNATURE,
  cell, headerCell, subHeaderCell, titleCell, signatureCell,
  kpiLabelCell, kpiValueCell, kpiDeltaCell,
  bodyCell, mutedCell, numCell, bodyCellAlt, numCellAlt,
  pillCell, miniKpi, border,
  conditionalGradient, conditionalGreaterThan, conditionalLessThan,
  rgb,
};
