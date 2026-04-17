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
      trimSheet(batch, sheetId, result.lastRow, result.lastCol);
    }
    // Proteger tab (warning-only) e esconder config
    batch.protectSheet(sheetId, 'Firma RedWood — gerido pelo bot');
    if (key === 'config') batch.hideSheet(sheetId);
    flushed = await batch.flush();
  } catch (e) {
    syncErr = e;
  }

  const ms = Date.now() - t0;
  const ops = flushed.replies?.length || 0;

  // Regista estado (best-effort — sheet_sync_state pode não existir em DB legacy).
  try {
    const { recordSheetSync } = require('../repositories/_meta');
    await recordSheetSync(key, {
      result: syncErr ? 'error' : 'ok',
      ops, ms,
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
