'use strict';
/**
 * BatchWriter — acumula requests e envia tudo numa única chamada
 * spreadsheets.batchUpdate. Evita rate-limit e N chamadas por tab.
 *
 * Uso:
 *   const b = new BatchWriter(sheetsClient, spreadsheetId);
 *   b.updateCells(sheetId, startRow, startCol, rows);
 *   b.format(sheetId, range, format);
 *   b.addChart(...);
 *   await b.flush();  // 1 chamada à API
 */

class BatchWriter {
  constructor(sheets, spreadsheetId) {
    this.sheets = sheets;
    this.spreadsheetId = spreadsheetId;
    this.requests = [];
  }

  /** Limpa todas as células de um range. */
  clearRange(sheetId, startRow = 0, startCol = 0, endRow = null, endCol = null) {
    this.requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: startRow,
          endRowIndex: endRow,
          startColumnIndex: startCol,
          endColumnIndex: endCol,
        },
        fields: 'userEnteredValue,userEnteredFormat',
      },
    });
    return this;
  }

  /** Escreve `rows` (array de arrays de cell objects) a partir de (startRow, startCol).
   * Inclui textFormatRuns no fields para suportar texto multi-cor (ex: "RedWood" a
   * vermelho dentro do título). Células sem runs têm-nas limpas — idempotente. */
  updateCells(sheetId, startRow, startCol, rows) {
    if (!rows.length) return this;
    this.requests.push({
      updateCells: {
        start: { sheetId, rowIndex: startRow, columnIndex: startCol },
        rows: rows.map(row => ({ values: row })),
        fields: 'userEnteredValue,userEnteredFormat,textFormatRuns',
      },
    });
    return this;
  }

  /** Merge de um bloco de células (título largo, etc.). */
  mergeCells(sheetId, startRow, endRow, startCol, endCol) {
    this.requests.push({
      mergeCells: {
        range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
        mergeType: 'MERGE_ALL',
      },
    });
    return this;
  }

  /** Desfaz TODOS os merges da tab. Usado no pre-sync para não conflituar
   * com novos merges desta sync que sobreponham merges antigas. */
  unmergeAll(sheetId) {
    this.requests.push({
      unmergeCells: {
        range: { sheetId },
      },
    });
    return this;
  }

  /** Congela N linhas no topo. */
  freezeRows(sheetId, rowCount) {
    this.requests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: rowCount } },
        fields: 'gridProperties.frozenRowCount',
      },
    });
    return this;
  }

  /** Congela N colunas à esquerda. */
  freezeCols(sheetId, colCount) {
    this.requests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenColumnCount: colCount } },
        fields: 'gridProperties.frozenColumnCount',
      },
    });
    return this;
  }

  /** Largura em píxeis (auto-fit-ish). */
  setColumnWidth(sheetId, colIndex, widthPx) {
    this.requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: colIndex, endIndex: colIndex + 1 },
        properties: { pixelSize: widthPx },
        fields: 'pixelSize',
      },
    });
    return this;
  }

  /** Altura de linha. */
  setRowHeight(sheetId, rowIndex, heightPx) {
    this.requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
        properties: { pixelSize: heightPx },
        fields: 'pixelSize',
      },
    });
    return this;
  }

  /** Auto-resize — ajusta a dimensão ao conteúdo. Dimension: 'COLUMNS' | 'ROWS'. */
  autoResize(sheetId, dimension, startIndex, endIndex) {
    this.requests.push({
      autoResizeDimensions: {
        dimensions: { sheetId, dimension, startIndex, endIndex },
      },
    });
    return this;
  }

  /** Bandas alternadas (ímpar/par). */
  banding(sheetId, startRow, endRow, startCol, endCol, firstBand, secondBand, header) {
    const bandedRange = {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      rowProperties: {
        firstBandColor: firstBand,
        secondBandColor: secondBand,
      },
    };
    if (header) bandedRange.rowProperties.headerColor = header;
    this.requests.push({ addBanding: { bandedRange } });
    return this;
  }

  /** Filtro automático. */
  setBasicFilter(sheetId, startRow, endRow, startCol, endCol) {
    this.requests.push({
      setBasicFilter: {
        filter: { range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol } },
      },
    });
    return this;
  }

  /** Conditional formatting rule (usa builders do theme). */
  addRule(request) {
    this.requests.push(request);
    return this;
  }

  /** Adiciona um chart básico. */
  addChart(chartSpec) {
    this.requests.push({ addChart: { chart: chartSpec } });
    return this;
  }

  /** Proteção de range (só editores com permissão). */
  protectRange(sheetId, startRow, endRow, startCol, endCol, description, editorsEmails = []) {
    this.requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
          description,
          warningOnly: editorsEmails.length === 0,
          editors: editorsEmails.length ? { users: editorsEmails } : undefined,
        },
      },
    });
    return this;
  }

  /** Flush — manda tudo em 1 chamada. */
  async flush() {
    if (!this.requests.length) return { replies: [] };
    const res = await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests: this.requests },
    });
    this.requests = [];
    return res.data;
  }

  /** Quantas requests pendentes. */
  size() { return this.requests.length; }
}

module.exports = { BatchWriter };
