'use strict';
/**
 * Cleanup engine — dimensionamento automático das tabs.
 *
 * Responsabilidades:
 *   - growSheet: garante rowCount/columnCount mínimos antes de escrever além
 *     das bounds default (200×26). Chamar antes de sync se a tab é grande.
 *   - trimSheet: reduz rowCount/columnCount ao estritamente necessário +
 *     padding técnico. Evita "200 linhas vazias para mostrar 40 registos".
 *
 * Ambas usam updateSheetProperties com gridProperties. Operam no BatchWriter
 * para que o trim faça parte do mesmo flush da sync (economiza calls).
 */

// Zero padding — o grow/trim corre atomicamente no batch, não há risco de
// "write beyond bounds" entre syncs. Tabs ficam tight sem rows vazias.
const DEFAULT_PADDING_ROWS = 0;
const DEFAULT_PADDING_COLS = 0;
const MIN_ROWS = 10;
const MIN_COLS = 1;

/**
 * Garante que a tab tem pelo menos {rows, cols}. Idempotente e max-aware
 * por sheetId no mesmo batch — chamadas múltiplas (ex.: pre-grow em
 * syncEngine + grow em cada tab) consolidam-se no MÁXIMO pedido.
 *
 * Antes, updateSheetProperties SOBRESCREVE o rowCount/columnCount. Duas
 * chamadas em sequência com valores diferentes deixavam o menor (último
 * a ser aplicado) → writes após esse ponto falhavam com
 * "beyond the last requested row".
 */
function growSheet(batch, sheetId, { rows, cols }) {
  if (!batch._growTargets) batch._growTargets = new Map();

  const current = batch._growTargets.get(sheetId) || { rows: 0, cols: 0, reqIndex: -1 };
  const target = {
    rows: Math.max(current.rows, rows > 0 ? rows : 0),
    cols: Math.max(current.cols, cols > 0 ? cols : 0),
    reqIndex: current.reqIndex,
  };

  // Se nada aumenta, salta.
  if (target.rows === current.rows && target.cols === current.cols && target.reqIndex >= 0) return;

  const gridProperties = {};
  const fields = [];
  if (target.rows > 0) {
    gridProperties.rowCount = target.rows;
    fields.push('gridProperties.rowCount');
  }
  if (target.cols > 0) {
    gridProperties.columnCount = target.cols;
    fields.push('gridProperties.columnCount');
  }
  if (!fields.length) return;

  const req = {
    updateSheetProperties: {
      properties: { sheetId, gridProperties },
      fields: fields.join(','),
    },
  };

  if (target.reqIndex >= 0) {
    // Actualiza o request existente no batch (max semantics).
    batch.requests[target.reqIndex] = req;
  } else {
    batch.addRule(req);
    target.reqIndex = batch.requests.length - 1;
  }
  batch._growTargets.set(sheetId, target);
}

/**
 * Redimensiona a tab para rowsUsed + padding, colsUsed + padding (sem nunca ir
 * abaixo de MIN_ROWS/MIN_COLS). Aplicar no fim de cada sync para deixar a tab
 * "tight" — nada de 1000 rows inúteis.
 */
function trimSheet(
  batch,
  sheetId,
  rowsUsed,
  colsUsed,
  { paddingRows = DEFAULT_PADDING_ROWS, paddingCols = DEFAULT_PADDING_COLS } = {}
) {
  const rowCount = Math.max(MIN_ROWS, rowsUsed + paddingRows);
  const colCount = Math.max(MIN_COLS, colsUsed + paddingCols);
  batch.addRule({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { rowCount, columnCount: colCount },
      },
      fields: 'gridProperties.rowCount,gridProperties.columnCount',
    },
  });
}

/**
 * Calcula rowsUsed (o último row escrito + 1) dado um cursor retornado pelos
 * builders. Os builders devolvem o próximo row livre, por isso rowsUsed = row.
 */
function rowsFromCursor(nextRow) {
  return nextRow;
}

module.exports = {
  growSheet,
  trimSheet,
  rowsFromCursor,
  MIN_ROWS,
  MIN_COLS,
};
