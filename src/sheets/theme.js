'use strict';
/**
 * Design System RedWood para Google Sheets.
 *
 * Princípios:
 *   - Uma só paleta, uma só fonte, tokens centralizados.
 *   - Preto profundo + vermelho RedWood + carvão + marfim.
 *   - Verde só para positivo, vermelho signal só para negativo,
 *     amarelo só para atenção. Gold reservado para destaques pontuais.
 *   - Tudo aqui devolve objectos compatíveis com batchUpdate; os
 *     "builders" vivem em tabs/_common.js.
 *   - Identidade visual única: Firma RedWood.
 */

// ─── Primitivos ──────────────────────────────────────────────────────────────
function rgb(r, g, b) {
  return { red: r / 255, green: g / 255, blue: b / 255 };
}

// ─── Paleta ──────────────────────────────────────────────────────────────────
const COLOR = {
  // Superfícies (escuras → claras)
  VOID: rgb(8, 8, 8), // #080808 — bg absoluto (headers)
  BLACK: rgb(15, 15, 15), // #0F0F0F — bg corpo
  CHARCOAL: rgb(28, 28, 28), // #1C1C1C — bg zebra / blocos
  GRAPHITE: rgb(45, 45, 45), // #2D2D2D — blocos secundários
  IRON: rgb(68, 68, 68), // #444 — elemento sobre charcoal
  GRAY_DARK: rgb(90, 90, 90), // #5A5A5A — separadores
  GRAY: rgb(140, 140, 140), // #8C8C8C — labels muted
  GRAY_LIGHT: rgb(200, 200, 200), // #C8C8C8 — dividers claros
  OFF_WHITE: rgb(240, 236, 232), // #F0ECE8 — texto principal (tom marfim)
  WHITE: rgb(255, 255, 255),

  // Marca RedWood
  RED_DEEP: rgb(139, 0, 0), // #8B0000 — accent primário
  RED_BLOOD: rgb(178, 34, 34), // #B22222 — headers de tabela
  RED_SIGNAL: rgb(220, 53, 69), // #DC3545 — negativo/erro
  RED_SIGNAL_SOFT: rgb(55, 24, 28), // bg suave para negativo em fundo escuro
  RED_SOFT: rgb(204, 85, 85), // #CC5555 — warn suave

  // Signals (semantic — sempre sobre fundo escuro)
  GREEN_DEEP: rgb(39, 174, 96), // #27AE60 — positivo forte
  GREEN_SOFT: rgb(22, 55, 35), // bg suave positivo em dark
  YELLOW_DEEP: rgb(230, 167, 17), // #E6A711 — atenção
  YELLOW_SOFT: rgb(58, 44, 14), // bg suave atenção em dark
  BLUE_DEEP: rgb(66, 133, 244), // #4285F4 — info/link (discreto)
  BLUE_SOFT: rgb(24, 42, 70),

  // Destaques pontuais
  GOLD: rgb(184, 134, 11), // #B8860B — 1º lugar, MVP
  GOLD_SOFT: rgb(40, 32, 12), // bg suave gold em dark
  GOLD_DEEP: rgb(218, 165, 32), // #DAA520 — gold brilhante
  SILVER: rgb(170, 170, 170), // 2º
  SILVER_SOFT: rgb(35, 35, 35), // bg suave silver em dark
  SILVER_DEEP: rgb(200, 200, 200), // silver brilhante
  BRONZE: rgb(139, 90, 43), // 3º
  BRONZE_SOFT: rgb(35, 28, 20), // bg suave bronze em dark
  BRONZE_DEEP: rgb(180, 120, 60), // bronze brilhante
};

// Aliases semânticos — usar estes em código novo
COLOR.BG_APP = COLOR.BLACK;
COLOR.BG_HEADER = COLOR.VOID;
COLOR.BG_BLOCK = COLOR.CHARCOAL;
COLOR.BG_BLOCK_ALT = COLOR.GRAPHITE;
COLOR.BG_TABLE_HEAD = COLOR.RED_BLOOD;
COLOR.BG_TABLE_ACCENT = COLOR.RED_DEEP;
COLOR.TEXT_PRIMARY = COLOR.OFF_WHITE;
COLOR.TEXT_MUTED = COLOR.GRAY;
COLOR.TEXT_INVERTED = COLOR.WHITE;

// ─── Tipografia ──────────────────────────────────────────────────────────────
// Uma só fonte em todo o workbook: Inter (disponível no Google Fonts do Sheets).
const FONT_FAMILY = 'Inter';

function _font(opts) {
  return { fontFamily: FONT_FAMILY, ...opts };
}

const FONT = {
  TITLE: _font({ fontSize: 18, bold: true, foregroundColor: COLOR.WHITE }),
  SUBTITLE: _font({ fontSize: 10, italic: true, foregroundColor: COLOR.GRAY_LIGHT }),
  SECTION: _font({ fontSize: 12, bold: true, foregroundColor: COLOR.OFF_WHITE }),
  SECTION_HINT: _font({ fontSize: 9, italic: true, foregroundColor: COLOR.GRAY }),
  HEADER: _font({ fontSize: 10, bold: true, foregroundColor: COLOR.WHITE }),
  SUBHEAD: _font({ fontSize: 9, bold: true, foregroundColor: COLOR.OFF_WHITE }),
  BODY: _font({ fontSize: 10, foregroundColor: COLOR.OFF_WHITE }),
  BODY_BOLD: _font({ fontSize: 10, bold: true, foregroundColor: COLOR.OFF_WHITE }),
  MUTED: _font({ fontSize: 9, foregroundColor: COLOR.GRAY }),
  CAPTION: _font({ fontSize: 8, foregroundColor: COLOR.GRAY }),
  KPI_LABEL: _font({ fontSize: 8, bold: true, foregroundColor: COLOR.GRAY_LIGHT }),
  KPI_VALUE: _font({ fontSize: 22, bold: true, foregroundColor: COLOR.WHITE }),
  KPI_UNIT: _font({ fontSize: 10, bold: true, foregroundColor: COLOR.GRAY_LIGHT }),
  KPI_DELTA_UP: _font({ fontSize: 9, bold: true, foregroundColor: COLOR.GREEN_DEEP }),
  KPI_DELTA_DN: _font({ fontSize: 9, bold: true, foregroundColor: COLOR.RED_SIGNAL }),
  KPI_DELTA_FL: _font({ fontSize: 9, bold: true, foregroundColor: COLOR.GRAY }),
  SIG: _font({ fontSize: 9, italic: true, foregroundColor: COLOR.GRAY }),
  BADGE: _font({ fontSize: 8, bold: true, foregroundColor: COLOR.WHITE }),
  RANK_1: _font({ fontSize: 10, bold: true, foregroundColor: COLOR.GOLD }),
  RANK_2: _font({ fontSize: 10, bold: true, foregroundColor: COLOR.SILVER }),
  RANK_3: _font({ fontSize: 10, bold: true, foregroundColor: COLOR.BRONZE }),
};

// ─── Spacing / Row heights ───────────────────────────────────────────────────
const ROW_H = {
  TITLE: 42,
  SUBTITLE: 20,
  SPACER_XS: 6,
  SPACER_SM: 10,
  SPACER_MD: 14,
  SECTION: 26,
  DIVIDER: 3,
  KPI: 52,
  KPI_LABEL: 18,
  TABLE_HEAD: 28,
  TABLE_ROW: 22,
  FOOTER: 22,
};

const COL_W = {
  XXS: 45,
  XS: 60,
  SM: 85,
  MD: 120,
  LG: 160,
  XL: 200,
  XXL: 260,
};

// ─── Number formats ──────────────────────────────────────────────────────────
const NUM_FMT = {
  INT: { type: 'NUMBER', pattern: '#,##0' },
  INT_DELTA: { type: 'NUMBER', pattern: '"+"#,##0;"−"#,##0;"—"' },
  DEC: { type: 'NUMBER', pattern: '#,##0.00' },
  DEC1: { type: 'NUMBER', pattern: '#,##0.0' },
  EURO: { type: 'CURRENCY', pattern: '#,##0 €' },
  EURO_DEC: { type: 'CURRENCY', pattern: '#,##0.00 €' },
  EURO_DELTA: { type: 'CURRENCY', pattern: '"+"#,##0" €";"−"#,##0" €";"—"' },
  PCT: { type: 'PERCENT', pattern: '0.0%' },
  PCT_INT: { type: 'PERCENT', pattern: '0%' },
  PCT_DELTA: { type: 'PERCENT', pattern: '"+"0.0%;"−"0.0%;"—"' },
  DATE: { type: 'DATE', pattern: 'yyyy-mm-dd' },
  DATETIME: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm' },
  KD: { type: 'NUMBER', pattern: '0.00' },
};

// ─── Borders ─────────────────────────────────────────────────────────────────
function _border(color, style = 'SOLID') {
  return { style, width: 1, color };
}

const BORDER = {
  NONE: {},
  BOTTOM_HAIR: { bottom: _border(COLOR.GRAY_DARK) },
  BOTTOM_ACCENT: { bottom: _border(COLOR.RED_DEEP) },
  TOP_HAIR: { top: _border(COLOR.GRAY_DARK) },
  TOP_ACCENT: { top: _border(COLOR.RED_DEEP) },
  LEFT_ACCENT: { left: { style: 'SOLID_THICK', width: 3, color: COLOR.RED_DEEP } },
  LEFT_SEPARATOR: { left: _border(COLOR.IRON) },
  BOX_SUBTLE: {
    top: _border(COLOR.GRAPHITE),
    bottom: _border(COLOR.GRAPHITE),
    left: _border(COLOR.GRAPHITE),
    right: _border(COLOR.GRAPHITE),
  },
};

// ─── Helpers de célula ───────────────────────────────────────────────────────
function cell(value, opts = {}) {
  const v = { userEnteredValue: {} };
  if (value === null || value === undefined) v.userEnteredValue.stringValue = '';
  else if (typeof value === 'number') {
    if (Number.isFinite(value)) v.userEnteredValue.numberValue = value;
    else v.userEnteredValue.stringValue = '—';
  } else if (typeof value === 'boolean') v.userEnteredValue.boolValue = value;
  else if (typeof value === 'string' && value.startsWith('=')) v.userEnteredValue.formulaValue = value;
  else v.userEnteredValue.stringValue = String(value);

  const fmt = {};
  if (opts.bg) fmt.backgroundColor = opts.bg;
  if (opts.font) fmt.textFormat = opts.font;
  if (opts.align) fmt.horizontalAlignment = opts.align;
  if (opts.vAlign) fmt.verticalAlignment = opts.vAlign;
  if (opts.numberFormat) fmt.numberFormat = opts.numberFormat;
  if (opts.wrap) fmt.wrapStrategy = 'WRAP';
  if (opts.clip) fmt.wrapStrategy = 'CLIP';
  if (opts.borders) fmt.borders = opts.borders;
  if (opts.padding) fmt.padding = opts.padding;
  if (Object.keys(fmt).length) v.userEnteredFormat = fmt;

  // Brand run: detecta "RedWood" e destaca a vermelho no meio do texto.
  // Aplica apenas se o valor for string e contiver "RedWood".
  if (opts.brandRed && typeof value === 'string') {
    const idx = value.indexOf('RedWood');
    const brandEnd = idx + 'RedWood'.length;
    if (idx >= 0) {
      const baseFont = opts.font || {};
      const runs = [];
      if (idx > 0) runs.push({ startIndex: 0, format: { ...baseFont } });
      runs.push({ startIndex: idx, format: { ...baseFont, foregroundColor: COLOR.RED_DEEP, bold: true } });
      // Só adiciona o reset se houver texto depois de "RedWood"
      if (brandEnd < value.length) runs.push({ startIndex: brandEnd, format: { ...baseFont } });
      v.textFormatRuns = runs;
    }
  }
  return v;
}

// ─── Células semânticas (camada 1: blocos base) ──────────────────────────────
function titleCell(value) {
  return cell(value, { bg: COLOR.BG_HEADER, font: FONT.TITLE, align: 'LEFT', vAlign: 'MIDDLE', brandRed: true });
}
function subtitleCell(value) {
  return cell(value, { bg: COLOR.BG_HEADER, font: FONT.SUBTITLE, align: 'LEFT', vAlign: 'MIDDLE' });
}
function sectionCell(value) {
  return cell(value, {
    bg: COLOR.BG_BLOCK,
    font: FONT.SECTION,
    align: 'LEFT',
    vAlign: 'MIDDLE',
    borders: BORDER.LEFT_ACCENT,
  });
}
function sectionHintCell(value) {
  return cell(value, { bg: COLOR.BG_BLOCK, font: FONT.SECTION_HINT, align: 'RIGHT', vAlign: 'MIDDLE' });
}
function headerCell(value) {
  return cell(value, { bg: COLOR.BG_TABLE_HEAD, font: FONT.HEADER, align: 'CENTER', vAlign: 'MIDDLE' });
}
function subHeaderCell(value) {
  return cell(value, { bg: COLOR.BG_BLOCK, font: FONT.SUBHEAD, align: 'LEFT', vAlign: 'MIDDLE' });
}
function bodyCell(value, opts = {}) {
  return cell(value, { bg: COLOR.BG_APP, font: FONT.BODY, vAlign: 'MIDDLE', ...opts });
}
function bodyBoldCell(value, opts = {}) {
  return cell(value, { bg: COLOR.BG_APP, font: FONT.BODY_BOLD, vAlign: 'MIDDLE', ...opts });
}
function mutedCell(value, opts = {}) {
  return cell(value, { bg: COLOR.BG_APP, font: FONT.MUTED, vAlign: 'MIDDLE', ...opts });
}
function captionCell(value, opts = {}) {
  return cell(value, { bg: COLOR.BG_APP, font: FONT.CAPTION, vAlign: 'MIDDLE', ...opts });
}
function numCell(value, numberFormat, opts = {}) {
  return cell(value, { bg: COLOR.BG_APP, font: FONT.BODY, align: 'RIGHT', vAlign: 'MIDDLE', numberFormat, ...opts });
}
function signatureCell(text) {
  return cell(text || `— ${SIGNATURE}`, {
    bg: COLOR.BG_HEADER,
    font: FONT.SIG,
    align: 'RIGHT',
    vAlign: 'MIDDLE',
    brandRed: true,
  });
}
// Kills — bold verde forte, sempre destacado
function killCell(value) {
  return cell(value, {
    bg: COLOR.BG_APP,
    font: _font({ fontSize: 11, bold: true, foregroundColor: COLOR.GREEN_DEEP }),
    align: 'RIGHT',
    vAlign: 'MIDDLE',
    numberFormat: NUM_FMT.INT,
  });
}
// Deaths — bold vermelho signal, sempre destacado
function deathCell(value) {
  return cell(value, {
    bg: COLOR.BG_APP,
    font: _font({ fontSize: 11, bold: true, foregroundColor: COLOR.RED_SIGNAL }),
    align: 'RIGHT',
    vAlign: 'MIDDLE',
    numberFormat: NUM_FMT.INT,
  });
}

// ─── Células semânticas (camada 2: KPIs / badges / rankings) ─────────────────
function kpiLabelCell(value) {
  return cell(value.toUpperCase(), { bg: COLOR.BG_BLOCK, font: FONT.KPI_LABEL, align: 'LEFT', vAlign: 'TOP' });
}
function kpiValueCell(value, numberFormat) {
  return cell(value, { bg: COLOR.BG_BLOCK, font: FONT.KPI_VALUE, align: 'LEFT', vAlign: 'MIDDLE', numberFormat });
}
// `direction` aceita 'up'/'down'/'flat' (API nova) OU boolean (API antiga
// — true=up, false=down, undefined=flat).
function kpiDeltaCell(value, direction, numberFormat) {
  let font = FONT.KPI_DELTA_FL;
  if (direction === 'up' || direction === true) font = FONT.KPI_DELTA_UP;
  else if (direction === 'down' || direction === false) font = FONT.KPI_DELTA_DN;
  return cell(value, { bg: COLOR.BG_BLOCK, font, align: 'LEFT', vAlign: 'BOTTOM', numberFormat });
}

function badgeCell(label, bgColor, textColor) {
  return cell(label, {
    bg: bgColor,
    font: _font({ fontSize: 8, bold: true, foregroundColor: textColor || COLOR.WHITE }),
    align: 'CENTER',
    vAlign: 'MIDDLE',
  });
}
function pillCell(value, pillColor, textColor) {
  return badgeCell(value, pillColor, textColor);
}

function rankCell(position) {
  const pos = Number(position);
  if (pos === 1) {
    return cell('🥇 1º', {
      bg: COLOR.GOLD_SOFT,
      font: FONT.RANK_1,
      align: 'CENTER',
      vAlign: 'MIDDLE',
      borders: { top: _border(COLOR.GOLD), bottom: _border(COLOR.GOLD), left: _border(COLOR.GOLD), right: _border(COLOR.GOLD) },
    });
  }
  if (pos === 2) {
    return cell('🥈 2º', {
      bg: COLOR.SILVER_SOFT,
      font: FONT.RANK_2,
      align: 'CENTER',
      vAlign: 'MIDDLE',
      borders: { top: _border(COLOR.SILVER), bottom: _border(COLOR.SILVER), left: _border(COLOR.SILVER), right: _border(COLOR.SILVER) },
    });
  }
  if (pos === 3) {
    return cell('🥉 3º', {
      bg: COLOR.BRONZE_SOFT,
      font: FONT.RANK_3,
      align: 'CENTER',
      vAlign: 'MIDDLE',
      borders: { top: _border(COLOR.BRONZE), bottom: _border(COLOR.BRONZE), left: _border(COLOR.BRONZE), right: _border(COLOR.BRONZE) },
    });
  }
  return cell(`${pos}`, { bg: COLOR.BG_APP, font: FONT.MUTED, align: 'CENTER', vAlign: 'MIDDLE' });
}

// Delta formatado como texto "▲ +12.3%" / "▼ −4.1%" / "— 0%"
function formatDelta(prev, curr, kind = 'pct') {
  const hasPrev = Number.isFinite(prev) && prev !== 0;
  const currN = Number(curr) || 0;
  const diff = currN - (Number(prev) || 0);
  let value, direction;
  if (kind === 'pct') {
    value = hasPrev ? diff / Math.abs(prev) : 0;
    direction = value > 0.001 ? 'up' : value < -0.001 ? 'down' : 'flat';
  } else {
    value = diff;
    direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  }
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—';
  return { value, direction, arrow };
}

// ─── Conditional formatting builders ─────────────────────────────────────────
function rangeOf(sheetId, startRow, startCol, endRow, endCol) {
  return { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol };
}

function conditionalGradient(sheetId, startRow, startCol, endRow, endCol, minColor, midColor, maxColor) {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [rangeOf(sheetId, startRow, startCol, endRow, endCol)],
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
        ranges: [rangeOf(sheetId, startRow, startCol, endRow, endCol)],
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
        ranges: [rangeOf(sheetId, startRow, startCol, endRow, endCol)],
        booleanRule: {
          condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: String(threshold) }] },
          format: { backgroundColor: bg },
        },
      },
      index: 0,
    },
  };
}
function conditionalTextEquals(sheetId, startRow, startCol, endRow, endCol, text, bg, fg) {
  return {
    addConditionalFormatRule: {
      rule: {
        ranges: [rangeOf(sheetId, startRow, startCol, endRow, endCol)],
        booleanRule: {
          condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: text }] },
          format: { backgroundColor: bg, textFormat: fg ? { foregroundColor: fg, bold: true } : undefined },
        },
      },
      index: 0,
    },
  };
}

// Signature global
const SIGNATURE = 'Firma RedWood';

module.exports = {
  // Primitivos
  rgb,
  cell,
  // Tokens
  COLOR,
  FONT,
  FONT_FAMILY,
  ROW_H,
  COL_W,
  NUM_FMT,
  BORDER,
  SIGNATURE,
  // Células camada 1
  titleCell,
  subtitleCell,
  sectionCell,
  sectionHintCell,
  headerCell,
  subHeaderCell,
  bodyCell,
  bodyBoldCell,
  mutedCell,
  captionCell,
  numCell,
  signatureCell,
  killCell,
  deathCell,
  // Células camada 2
  kpiLabelCell,
  kpiValueCell,
  kpiDeltaCell,
  badgeCell,
  pillCell,
  rankCell,
  formatDelta,
  // Conditional formatting
  conditionalGradient,
  conditionalGreaterThan,
  conditionalLessThan,
  conditionalTextEquals,
  rangeOf,
};
