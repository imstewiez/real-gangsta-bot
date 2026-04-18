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
const { getSheetsClient } = require('./googleAuth');
const { BatchWriter } = require('./batchWriter');
const { ensureTabs } = require('./workbook');
const { trimSheet, growSheet } = require('./cleanup');

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
 * qualquer `updateCells` para este sheetId. Defensive safety net para o
 * trimSheet — se o syncer reportar lastRow subestimado, usamos o
 * observado para não encolher a grid abaixo das células realmente escritas.
 *
 * Suporta dois formatos de updateCells:
 *   - { range: { sheetId, startRowIndex, endRowIndex, ... } } (clearRange)
 *   - { start: { sheetId, rowIndex, columnIndex }, rows: [...] } (updateCells com dados)
 */
function _maxWrittenCell(requests, sheetId) {
  let maxRow = 0;
  let maxCol = 0;
  for (const req of requests) {
    const uc = req.updateCells;
    if (!uc) continue;

    // Formato 1: clearRange — range explícito.
    if (uc.range && uc.range.sheetId === sheetId) {
      if (Number.isFinite(uc.range.endRowIndex)) maxRow = Math.max(maxRow, uc.range.endRowIndex);
      if (Number.isFinite(uc.range.endColumnIndex)) maxCol = Math.max(maxCol, uc.range.endColumnIndex);
      continue;
    }

    // Formato 2: updateCells com start + rows.
    if (uc.start && uc.start.sheetId === sheetId) {
      const startRow = uc.start.rowIndex || 0;
      const startCol = uc.start.columnIndex || 0;
      const rowCount = Array.isArray(uc.rows) ? uc.rows.length : 0;
      const colCount = rowCount
        ? Math.max(...uc.rows.map(r => (Array.isArray(r.values) ? r.values.length : 0)))
        : 0;
      maxRow = Math.max(maxRow, startRow + rowCount);
      maxCol = Math.max(maxCol, startCol + colCount);
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

module.exports = { syncOne, syncAll, TAB_SYNCERS };
