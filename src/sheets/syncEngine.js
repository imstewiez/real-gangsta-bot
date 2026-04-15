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
  dashboard:     () => require('./tabs/dashboard').syncDashboard,
  resumo:        () => require('./tabs/resumo').syncResumo,
  membros:       () => require('./tabs/membros').syncMembros,
  saidas:        () => require('./tabs/saidas').syncSaidas,
  participantes: () => require('./tabs/participantes').syncParticipantes,
  combate:       () => require('./tabs/combate').syncCombate,
  stock:         () => require('./tabs/stock').syncStock,
  rankings:      () => require('./tabs/rankings').syncRankings,
  config:        () => require('./tabs/config').syncConfig,
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
  // Limpa a tab antes de reescrever (simples, idempotente)
  batch.clearRange(sheetId);
  // Syncer pode devolver { lastRow, lastCol } para permitir trim automático.
  const result = await syncer()(batch, sheetId);
  if (result && Number.isFinite(result.lastRow) && Number.isFinite(result.lastCol)) {
    trimSheet(batch, sheetId, result.lastRow, result.lastCol);
  }
  const flushed = await batch.flush();

  const ms = Date.now() - t0;
  log(`[SHEETS] sync ${key}: ${flushed.replies?.length || 0} ops em ${ms}ms`);
  return { tab: key, ops: flushed.replies?.length || 0, ms };
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
