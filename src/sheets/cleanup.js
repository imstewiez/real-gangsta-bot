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

const DEFAULT_PADDING_ROWS = 3;
const DEFAULT_PADDING_COLS = 0;
const MIN_ROWS = 10;
const MIN_COLS = 1;

/**
 * Garante que a tab tem pelo menos {rows, cols}. Se já tiver, não faz nada.
 * Útil para tabs que podem crescer muito (ex: saidas com 500 registos).
 */
function growSheet(batch, sheetId, { rows, cols }) {
  const req = {
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: {},
      },
      fields: '',
    },
  };
  const fields = [];
  if (rows && rows > 0) {
    req.updateSheetProperties.properties.gridProperties.rowCount = rows;
    fields.push('gridProperties.rowCount');
  }
  if (cols && cols > 0) {
    req.updateSheetProperties.properties.gridProperties.columnCount = cols;
    fields.push('gridProperties.columnCount');
  }
  if (!fields.length) return;
  req.updateSheetProperties.fields = fields.join(',');
  batch.addRule(req);
}

/**
 * Redimensiona a tab para rowsUsed + padding, colsUsed + padding (sem nunca ir
 * abaixo de MIN_ROWS/MIN_COLS). Aplicar no fim de cada sync para deixar a tab
 * "tight" — nada de 1000 rows inúteis.
 */
function trimSheet(batch, sheetId, rowsUsed, colsUsed, {
  paddingRows = DEFAULT_PADDING_ROWS,
  paddingCols = DEFAULT_PADDING_COLS,
} = {}) {
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
