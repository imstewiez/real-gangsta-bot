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
 *   await b.flush();  // 1 chamada à API, com retry automático em erros transitórios
 */

const { warn } = require('../logger');

// Retry config para flush() — espelha googleAuth._withRetry.
// Transient: 429, 5xx, rede. Permanent: 4xx (auth/config bugs).
const FLUSH_RETRY_MAX = 3;
const FLUSH_RETRY_BASE_MS = 1_000;
const FLUSH_RETRY_MAX_MS = 30_000;

function _isTransientFlush(err) {
  if (!err) return false;
  const code = err.code || err.response?.status || err.response?.data?.error?.code;
  if (code) {
    const n = Number(code);
    if (Number.isFinite(n)) {
      if (n === 429) return true;
      if (n >= 500 && n < 600) return true;
      return false;
    }
    const s = String(code).toUpperCase();
    if (s === 'ECONNRESET' || s === 'ETIMEDOUT' || s === 'EAI_AGAIN' || s === 'ENOTFOUND') return true;
  }
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('socket hang up')) return true;
  if (msg.includes('rate limit') || msg.includes('quota exceeded')) return true;
  return false;
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class BatchWriter {
  constructor(sheets, spreadsheetId) {
    this.sheets = sheets;
    this.spreadsheetId = spreadsheetId;
    this.requests = [];
  }

  /** Limpa todas as células de um range. */
  clearRange(sheetId, startRow = 0, startCol = 0, endRow = null, endCol = null) {
    // Valores explícitos grandes em vez de null — garante que a API limpa
    // tudo mesmo que não interprete null como "até ao fim da grid".
    this.requests.push({
      updateCells: {
        range: {
          sheetId,
          startRowIndex: startRow,
          endRowIndex: endRow ?? 5000,
          startColumnIndex: startCol,
          endColumnIndex: endCol ?? 50,
        },
        fields: 'userEnteredValue,userEnteredFormat',
      },
    });
    return this;
  }

  /** Escreve `rows` (array de arrays de cell objects) a partir de (startRow, startCol).
   * Inclui textFormatRuns no fields para suportar texto multi-cor (ex: "Ballas Gang" a
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
        range: {
          sheetId,
          startRowIndex: startRow,
          endRowIndex: endRow,
          startColumnIndex: startCol,
          endColumnIndex: endCol,
        },
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
      range: {
        sheetId,
        startRowIndex: startRow,
        endRowIndex: endRow,
        startColumnIndex: startCol,
        endColumnIndex: endCol,
      },
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
        filter: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
        },
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

  /** Protege toda a sheet (warning-only — avisa o user antes de editar). */
  protectSheet(sheetId, description = 'Gerido pelo bot — não editar') {
    this.requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId },
          description,
          warningOnly: true,
        },
      },
    });
    return this;
  }

  /** Esconde uma tab (fica invisível na barra de tabs). */
  hideSheet(sheetId) {
    this.requests.push({
      updateSheetProperties: {
        properties: { sheetId, hidden: true },
        fields: 'hidden',
      },
    });
    return this;
  }

  /** Mostra uma tab escondida. */
  showSheet(sheetId) {
    this.requests.push({
      updateSheetProperties: {
        properties: { sheetId, hidden: false },
        fields: 'hidden',
      },
    });
    return this;
  }

  /** Proteção de range (só editores com permissão). */
  protectRange(sheetId, startRow, endRow, startCol, endCol, description, editorsEmails = []) {
    this.requests.push({
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol,
          },
          description,
          warningOnly: editorsEmails.length === 0,
          editors: editorsEmails.length ? { users: editorsEmails } : undefined,
        },
      },
    });
    return this;
  }

  /** Valida limites de segurança antes do flush. */
  validate() {
    const MAX_REQUESTS = 900; // Google Sheets API: limite prático ~1000
    const MAX_ESTIMATED_BYTES = 9 * 1024 * 1024; // ~9MB (limite é 10MB)

    if (this.requests.length > MAX_REQUESTS) {
      throw new Error(
        `[BatchWriter] Limite de requests excedido: ${this.requests.length}/${MAX_REQUESTS}. ` +
          'Dividir em múltiplos batches ou reduzir dados.'
      );
    }

    // Estimativa conservadora: 1KB por request em média
    const estimatedBytes = this.requests.length * 1024;
    if (estimatedBytes > MAX_ESTIMATED_BYTES) {
      throw new Error(
        `[BatchWriter] Payload estimado (${Math.round(estimatedBytes / 1024 / 1024)}MB) ` +
          `excede limite seguro (${Math.round(MAX_ESTIMATED_BYTES / 1024 / 1024)}MB). ` +
          'Dividir em múltiplos batches ou reduzir dados.'
      );
    }
  }

  /** Flush — manda tudo em 1 ou mais chamadas se necessário. */
  async flush() {
    if (!this.requests.length) return { replies: [] };
    const MAX_REQUESTS = 900; // Google Sheets API: limite prático ~1000
    const allReplies = [];
    const batches = [];
    while (this.requests.length) {
      batches.push(this.requests.splice(0, MAX_REQUESTS));
    }
    for (const chunk of batches) {
      const batch = new BatchWriter(this.sheets, this.spreadsheetId);
      batch.requests = chunk;
      batch.validate();
      let lastErr;
      for (let attempt = 0; attempt <= FLUSH_RETRY_MAX; attempt++) {
        try {
          const res = await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: { requests: chunk },
          });
          if (res.data.replies) allReplies.push(...res.data.replies);
          break;
        } catch (e) {
          lastErr = e;
          const canRetry = attempt < FLUSH_RETRY_MAX && _isTransientFlush(e);
          if (!canRetry) throw e;
          const delay = Math.min(FLUSH_RETRY_BASE_MS * Math.pow(2, attempt), FLUSH_RETRY_MAX_MS);
          warn(
            `[SHEETS:BATCH] flush transitório (tentativa ${attempt + 1}/${FLUSH_RETRY_MAX + 1}): ` +
              `${e.message} — retry em ${delay}ms`
          );
          await _sleep(delay);
        }
      }
      if (lastErr) throw lastErr;
    }
    this.requests = [];
    return { replies: allReplies };
  }

  /** Quantas requests pendentes. */
  size() {
    return this.requests.length;
  }
}

module.exports = { BatchWriter };
