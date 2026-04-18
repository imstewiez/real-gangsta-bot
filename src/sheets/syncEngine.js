'use strict';
/**
 * Sync engine — sync de uma tab de cada vez.
 *
 * A camada Sheets é uma projecção event-driven: domain events → debounce →
 * `syncOne(tab)` via src/sheets/projections.js. Não existe syncAll nem
 * rebuild — se uma tab ficar corrupta no Google Sheets, apaga-a na UI e
 * o próximo evento recria-a via ensureTabs.
 *
 * API:
 *   await syncOne(key) — sincroniza uma única tab
 */

const CONFIG = require('../config');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const { getSheetsClient } = require('./googleAuth');
const { BatchWriter } = require('./batchWriter');
const { ensureTabs } = require('./workbook');
const { trimSheet, growSheet } = require('./cleanup');

/**
 * Classificação de erros para decidir retry vs bail. Retry em:
 *   - 5xx (Google API down)
 *   - 429 (rate limit — backoff resolve)
 *   - ECONNRESET / ETIMEDOUT / EAI_AGAIN (rede)
 * Bail em 400/401/403/404 — são bugs do bot ou do auth, retry não resolve.
 */
function isTransientSheetsError(err) {
  if (!err) return false;
  const code = err.code || err.response?.status || err.response?.data?.error?.code;
  if (code) {
    const n = Number(code);
    if (Number.isFinite(n)) {
      if (n === 429) return true;
      if (n >= 500 && n < 600) return true;
      return false; // 4xx não-429: bug; não faz retry
    }
    const str = String(code).toUpperCase();
    if (str === 'ECONNRESET' || str === 'ETIMEDOUT' || str === 'EAI_AGAIN' || str === 'ENOTFOUND') {
      return true;
    }
  }
  // Fallback por mensagem (googleapis às vezes enterra o status).
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('socket hang up')) return true;
  if (msg.includes('rate limit') || msg.includes('quota exceeded') || msg.includes('user rate limit')) return true;
  return false;
}

// Dimensão mínima antes de cada sync — garante espaço para escrever mesmo
// depois de trims agressivos em syncs anteriores. Tabs com mais linhas
// podem chamar growSheet adicional dentro do seu syncer.
const PRE_SYNC_MIN_ROWS = 500;
const PRE_SYNC_MIN_COLS = 30;

const TAB_SYNCERS = {
  dashboard: () => require('./tabs/dashboard').syncDashboard,
  resumo: () => require('./tabs/resumo').syncResumo,
  membros: () => require('./tabs/membros').syncMembros,
  saidas: () => require('./tabs/saidas').syncSaidas,
  stock: () => require('./tabs/stock').syncStock,
  config: () => require('./tabs/config').syncConfig,
};

function getSpreadsheetId() {
  return CONFIG.SPREADSHEET_ID || CONFIG.GOOGLE_SHEET_ID || CONFIG.SHEET_ID || null;
}

/**
 * Percorre o batch e devolve o maior endRow/endCol que aparece em
 * QUALQUER request com range/start para este sheetId. Defensive safety
 * net para o trimSheet — se algum request (updateCells, setRowHeight,
 * mergeCells, etc.) toca em row N, a grid TEM de ter rowCount >= N+1.
 *
 * Formatos suportados:
 *   - updateCells com range        (clearRange)           → endRowIndex
 *   - updateCells com start+rows   (writes com dados)     → start.rowIndex + rows.length
 *   - updateDimensionProperties    (setRowHeight/Col)     → range.endIndex
 *   - mergeCells                   (merges)               → range.endRowIndex
 *   - updateBorders                (bordas)               → range.endRowIndex
 *   - addBanding                   (zebra)                → bandedRange.range.endRowIndex
 *   - addConditionalFormatRule     (conditional)          → ranges[].endRowIndex
 *   - repeatCell                   (repeat styling)       → range.endRowIndex
 *
 * Qualquer outro request que introduza range e não esteja aqui: não
 * fatal, só significa que o safeRow fica subestimado para esse request
 * (fallback: syncer's reported lastRow continua a ser o piso mínimo).
 */
function _maxWrittenCell(requests, sheetId) {
  let maxRow = 0;
  let maxCol = 0;

  const readRange = range => {
    if (!range || range.sheetId !== sheetId) return;
    if (Number.isFinite(range.endRowIndex)) maxRow = Math.max(maxRow, range.endRowIndex);
    if (Number.isFinite(range.endColumnIndex)) maxCol = Math.max(maxCol, range.endColumnIndex);
  };

  for (const req of requests) {
    // updateCells — dois formatos: com range OR com start+rows.
    if (req.updateCells) {
      const uc = req.updateCells;
      if (uc.range) readRange(uc.range);
      if (uc.start && uc.start.sheetId === sheetId) {
        const startRow = uc.start.rowIndex || 0;
        const startCol = uc.start.columnIndex || 0;
        const rowCount = Array.isArray(uc.rows) ? uc.rows.length : 0;
        const colCount = rowCount ? Math.max(...uc.rows.map(r => (Array.isArray(r.values) ? r.values.length : 0))) : 0;
        maxRow = Math.max(maxRow, startRow + rowCount);
        maxCol = Math.max(maxCol, startCol + colCount);
      }
    }

    // updateDimensionProperties — setRowHeight, setColumnWidth.
    // range usa startIndex/endIndex em vez de startRowIndex/endRowIndex.
    if (req.updateDimensionProperties) {
      const r = req.updateDimensionProperties.range;
      if (r && r.sheetId === sheetId && Number.isFinite(r.endIndex)) {
        if (r.dimension === 'ROWS') maxRow = Math.max(maxRow, r.endIndex);
        else if (r.dimension === 'COLUMNS') maxCol = Math.max(maxCol, r.endIndex);
      }
    }

    // mergeCells, updateBorders, repeatCell — range standard.
    if (req.mergeCells) readRange(req.mergeCells.range);
    if (req.updateBorders) readRange(req.updateBorders.range);
    if (req.repeatCell) readRange(req.repeatCell.range);

    // addBanding — bandedRange.range.
    if (req.addBanding && req.addBanding.bandedRange) readRange(req.addBanding.bandedRange.range);

    // addConditionalFormatRule — rule.ranges[].
    if (req.addConditionalFormatRule && req.addConditionalFormatRule.rule) {
      for (const range of req.addConditionalFormatRule.rule.ranges || []) readRange(range);
    }
  }
  return { row: maxRow, col: maxCol };
}

async function syncOne(key) {
  const syncer = TAB_SYNCERS[key];
  if (!syncer) throw new Error(`Tab desconhecida: ${key}`);

  const sheets = getSheetsClient();
  if (!sheets) {
    warn(`[SHEETS] sync '${key}' saltado — Google Service Account não configurado.`);
    return { skipped: 'no_sheets_client' };
  }
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) {
    warn(`[SHEETS] sync '${key}' saltado — SPREADSHEET_ID não configurado.`);
    return { skipped: 'no_spreadsheet_id' };
  }

  const t0 = Date.now();
  const tabs = await ensureTabs(sheets, spreadsheetId);
  const sheetId = tabs[key];
  if (sheetId === undefined) throw new Error(`SheetId não encontrado para ${key}`);

  const batch = new BatchWriter(sheets, spreadsheetId);
  // Grow preventivo — evita "Attempting to write row X, beyond last row Y"
  // quando o trim anterior encolheu a grid e os dados agora cresceram.
  growSheet(batch, sheetId, { rows: PRE_SYNC_MIN_ROWS, cols: PRE_SYNC_MIN_COLS });
  // Reset freezes/merges antigos — novos layouts podem sobrepor-se aos antigos.
  batch.freezeRows(sheetId, 0);
  batch.freezeCols(sheetId, 0);
  batch.unmergeAll(sheetId);
  // Limpar antes de reescrever (simples, idempotente).
  batch.clearRange(sheetId);

  let syncErr = null;
  let flushed = { replies: [] };
  try {
    const result = await syncer()(batch, sheetId);
    if (result && Number.isFinite(result.lastRow) && Number.isFinite(result.lastCol)) {
      // Defensive: calcula o maior endRow/endCol que aparece em qualquer
      // updateCells do batch. Se o syncer subestima (ex: cursor `row` não
      // acompanha todas as escritas — observado em stock.js), trimSheet
      // pode encolher abaixo de writes reais → Google rejeita com
      // "Attempting to write row X, beyond last requested row of Y".
      const observed = _maxWrittenCell(batch.requests, sheetId);
      const safeRow = Math.max(result.lastRow, observed.row);
      const safeCol = Math.max(result.lastCol, observed.col);
      trimSheet(batch, sheetId, safeRow, safeCol);
    }
    // Debug pre-flush — diagnostica "row X beyond row Y" reportado em prod.
    // Dumpa o estado do grow target para ver se o SET semantic está a funcionar
    // ou se o deploy do fix não chegou a Railway (ambos dão sintoma parecido).
    const growTarget = batch._growTargets?.get(sheetId);
    log(
      `[SHEETS:debug] ${key} pre-flush: ${batch.requests.length} requests, growTarget=${JSON.stringify(growTarget || null)}, result.lastRow=${result?.lastRow}, result.lastCol=${result?.lastCol}`
    );
    flushed = await batch.flush();
  } catch (e) {
    syncErr = e;
  }

  // Protecção + hide em batch separado (não falha o sync se já existe protecção)
  if (!syncErr) {
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties,sheets.protectedRanges' });
      const sheetMeta = (meta.data.sheets || []).find(s => s.properties.sheetId === sheetId);
      const existingProtections = sheetMeta?.protectedRanges || [];
      const postBatch = new BatchWriter(sheets, spreadsheetId);
      // Remover protecções existentes antes de adicionar nova
      for (const p of existingProtections) {
        postBatch.requests.push({ deleteProtectedRange: { protectedRangeId: p.protectedRangeId } });
      }
      postBatch.protectSheet(sheetId, 'Firma RedWood — gerido pelo bot');
      if (key === 'config') postBatch.hideSheet(sheetId);
      await postBatch.flush();
    } catch (e) {
      warn(`[SHEETS] protect/hide '${key}' falhou (non-fatal): ${e.message}`);
    }
  }

  const ms = Date.now() - t0;
  const ops = flushed.replies?.length || 0;

  // Regista estado (best-effort — sheet_sync_state pode não existir em DB legacy).
  try {
    const { recordSheetSync } = require('../repositories/_meta');
    await recordSheetSync(key, {
      result: syncErr ? 'error' : 'ok',
      ops,
      ms,
      error: syncErr ? syncErr.message.slice(0, 500) : null,
    });
  } catch (e) {
    warn(`[SHEETS] recordSheetSync falhou: ${e.message}`);
  }

  // Métricas — sempre incrementa, independente de DB (observabilidade in-memory).
  metrics.sheetsSyncTotal.inc();
  metrics.sheetsSyncByTab.inc({ tab: key, result: syncErr ? 'error' : 'ok' });
  if (syncErr) metrics.sheetsSyncErrorsTotal.inc();

  if (syncErr) throw syncErr;
  log(`[SHEETS] sync ${key}: ${ops} ops em ${ms}ms`);
  return { tab: key, ops, ms };
}

/**
 * Sync de todas as tabs, sequencial. Usado no boot para trazer o estado
 * actual da DB para o Sheet de uma vez (event-driven sync acaba por
 * eventualmente fazer o mesmo, mas só quando eventos disparam).
 */
async function syncAll() {
  const results = [];
  for (const key of Object.keys(TAB_SYNCERS)) {
    try {
      const r = await syncOne(key);
      results.push(r);
    } catch (e) {
      warn(`[SHEETS] syncAll: tab '${key}' falhou — ${e.message}`);
      results.push({ tab: key, error: e.message });
    }
  }
  return results;
}

module.exports = { syncOne, syncAll, TAB_SYNCERS, isTransientSheetsError };
