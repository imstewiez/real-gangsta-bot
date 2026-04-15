'use strict';
/**
 * Sync engine — orquestra tabs e envia writes em batch.
 *
 * API:
 *   await syncAll()            — sincroniza todas as tabs
 *   await syncOne(key)         — sincroniza só uma tab (por chave)
 *   await rebuildWorkbook()    — apaga e recria todas as tabs (schema reset)
 */

const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { getSheetsClient } = require('./googleAuth');
const { BatchWriter } = require('./batchWriter');
const { ensureTabs, rebuildTabs, TABS_BY_KEY } = require('./workbook');
const { trimSheet, growSheet } = require('./cleanup');

// Dimensão máxima por defeito antes de cada sync — garante que há sempre
// espaço para escrever, mesmo depois de trims agressivos em syncs anteriores.
// Tabs que precisam de mais (ex: movimentos até 2000) podem chamar growSheet
// adicional dentro do seu próprio syncer.
const PRE_SYNC_MIN_ROWS = 500;
const PRE_SYNC_MIN_COLS = 30;

const TAB_SYNCERS = {
  dashboard: () => require('./tabs/dashboard').syncDashboard,
  resumo:    () => require('./tabs/resumo').syncResumo,
  membros:   () => require('./tabs/membros').syncMembros,
  saidas:    () => require('./tabs/saidas').syncSaidas,
  stock:     () => require('./tabs/stock').syncStock,
  config:    () => require('./tabs/config').syncConfig,
};

function getSpreadsheetId() {
  return CONFIG.SPREADSHEET_ID || CONFIG.GOOGLE_SHEET_ID || CONFIG.SHEET_ID || null;
}

async function syncOne(key) {
  const syncer = TAB_SYNCERS[key];
  if (!syncer) throw new Error(`Tab desconhecida: ${key}`);
  const sheets = getSheetsClient();
  if (!sheets) return { skipped: 'no_sheets_client' };
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return { skipped: 'no_spreadsheet_id' };

  const t0 = Date.now();
  const tabs = await ensureTabs(sheets, spreadsheetId);
  const sheetId = tabs[key];
  if (sheetId === undefined) throw new Error(`SheetId não encontrado para ${key}`);

  const batch = new BatchWriter(sheets, spreadsheetId);
  // Grow preventivo — evita "Attempting to write row X, beyond last row Y"
  // quando o trim anterior encolheu a grid e os dados agora cresceram.
  growSheet(batch, sheetId, { rows: PRE_SYNC_MIN_ROWS, cols: PRE_SYNC_MIN_COLS });
  // Reset freezes antigos (se o sync anterior deixou freezes por apagar, os
  // merges desta sync podem conflituar com a boundary). Zeros = sem freeze.
  batch.freezeRows(sheetId, 0);
  batch.freezeCols(sheetId, 0);
  // Unmerge todos os merges antigos — novos merges podem sobrepor os antigos.
  batch.unmergeAll(sheetId);
  // Limpa a tab antes de reescrever (simples, idempotente)
  batch.clearRange(sheetId);
  // Syncer pode devolver { lastRow, lastCol } para permitir trim automático.
  let syncErr = null;
  let flushed = { replies: [] };
  try {
    const result = await syncer()(batch, sheetId);
    if (result && Number.isFinite(result.lastRow) && Number.isFinite(result.lastCol)) {
      trimSheet(batch, sheetId, result.lastRow, result.lastCol);
    }
    flushed = await batch.flush();
  } catch (e) {
    syncErr = e;
  }

  const ms = Date.now() - t0;
  const ops = flushed.replies?.length || 0;
  // Regista estado do sync em sheet_sync_state (best-effort).
  try {
    const { recordSheetSync } = require('../repositories/_meta');
    await recordSheetSync(key, {
      result: syncErr ? 'error' : 'ok',
      ops, ms,
      error: syncErr ? syncErr.message.slice(0, 500) : null,
    });
  } catch (_) { /* sheet_sync_state pode não existir ainda em DB legacy */ }

  if (syncErr) throw syncErr;
  log(`[SHEETS] sync ${key}: ${ops} ops em ${ms}ms`);
  return { tab: key, ops, ms };
}

async function syncAll() {
  const sheets = getSheetsClient();
  if (!sheets) return { skipped: 'no_sheets_client' };
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return { skipped: 'no_spreadsheet_id' };

  const t0 = Date.now();
  await ensureTabs(sheets, spreadsheetId);

  const results = [];
  const errors = [];
  // Sequencial por design — evita quota da Sheets API e conflicts de batch.
  for (const key of Object.keys(TAB_SYNCERS)) {
    try {
      const r = await syncOne(key);
      results.push(r);
    } catch (e) {
      warn(`[SHEETS] tab ${key} falhou: ${e.message}`);
      errors.push({ tab: key, message: e.message });
    }
  }

  const ms = Date.now() - t0;
  log(`[SHEETS] syncAll: ${results.length} tabs OK, ${errors.length} erros em ${ms}ms`);
  return { ok: errors.length === 0, results, errors, ms };
}

async function rebuildWorkbook(keys = null, { purgeOthers = false } = {}) {
  const sheets = getSheetsClient();
  if (!sheets) return { skipped: 'no_sheets_client' };
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return { skipped: 'no_spreadsheet_id' };

  const t0 = Date.now();
  warn(`[SHEETS] rebuildWorkbook — keys=${keys || 'ALL'}, purgeOthers=${purgeOthers}`);
  await rebuildTabs(sheets, spreadsheetId, keys, { purgeOthers });
  const result = await syncAll();
  const ms = Date.now() - t0;
  log(`[SHEETS] rebuildWorkbook concluído em ${ms}ms`);
  return { ...result, rebuilt: true, purged: purgeOthers, ms };
}

module.exports = { syncAll, syncOne, rebuildWorkbook, TAB_SYNCERS };
