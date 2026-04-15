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

const TAB_SYNCERS = {
  dashboard:     () => require('./tabs/dashboard').syncDashboard,
  weekly:        () => require('./tabs/weekly').syncWeekly,
  daily:         () => require('./tabs/daily').syncDaily,
  members:       () => require('./tabs/members').syncMembers,
  moradores:     () => require('./tabs/moradores').syncMoradores,
  oficiais:      () => require('./tabs/oficiais').syncOficiais,
  saidas:        () => require('./tabs/saidas').syncSaidas,
  participantes: () => require('./tabs/participantes').syncParticipantes,
  kills:         () => require('./tabs/kills').syncKills,
  spots:         () => require('./tabs/spots').syncSpots,
  inventory:     () => require('./tabs/inventory').syncInventory,
  movements:     () => require('./tabs/movements').syncMovements,
  rankings:      () => require('./tabs/rankings').syncRankings,
  audit:         () => require('./tabs/audit').syncAudit,
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
  // Limpa a tab antes de reescrever (simples, idempotente)
  batch.clearRange(sheetId);
  await syncer()(batch, sheetId);
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

async function rebuildWorkbook(keys = null) {
  const sheets = getSheetsClient();
  if (!sheets) return { skipped: 'no_sheets_client' };
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return { skipped: 'no_spreadsheet_id' };

  const t0 = Date.now();
  warn(`[SHEETS] rebuildWorkbook — keys=${keys || 'ALL'}`);
  await rebuildTabs(sheets, spreadsheetId, keys);
  const result = await syncAll();
  const ms = Date.now() - t0;
  log(`[SHEETS] rebuildWorkbook concluído em ${ms}ms`);
  return { ...result, rebuilt: true, ms };
}

module.exports = { syncAll, syncOne, rebuildWorkbook, TAB_SYNCERS };
