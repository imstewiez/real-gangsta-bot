'use strict';
/**
 * Sync engine � sync de uma tab de cada vez.
 *
 * A camada Sheets � uma projec��o event-driven: domain events ? debounce ?
 * `syncOne(tab)` via src/sheets/projections.js. N�o existe syncAll nem
 * rebuild � se uma tab ficar corrupta no Google Sheets, apaga-a na UI e
 * o pr�ximo evento recria-a via ensureTabs.
 *
 * API:
 *   await syncOne(key) � sincroniza uma �nica tab
 */

const CONFIG = require('../config');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const googleRateLimiter = require('../lib/googleRateLimiter');
const { getSheetsClient } = require('./googleAuth');
const { BatchWriter } = require('./batchWriter');
const { ensureTabs } = require('./workbook');
const { trimSheet } = require('./cleanup');
const { query } = require('../db');
const { ConflictError } = require('../shared/errors');

const RETRY_DELAYS_MS = [1000, 3000, 9000];
const _syncLocks = new Map(); // tab ? Promise

/**
 * Classifica��o de erros para decidir retry vs bail. Retry em:
 *   - 5xx (Google API down)
 *   - 429 (rate limit � backoff resolve)
 *   - ECONNRESET / ETIMEDOUT / EAI_AGAIN (rede)
 * Bail em 400/401/403/404 � s�o bugs do bot ou do auth, retry n�o resolve.
 */
function isTransientSheetsError(err) {
  if (!err) return false;
  const code = err.code || err.response?.status || err.response?.data?.error?.code;
  if (code) {
    const n = Number(code);
    if (Number.isFinite(n)) {
      if (n === 429) return true;
      if (n >= 500 && n < 600) return true;
      return false; // 4xx n�o-429: bug; n�o faz retry
    }
    const str = String(code).toUpperCase();
    if (str === 'ECONNRESET' || str === 'ETIMEDOUT' || str === 'EAI_AGAIN' || str === 'ENOTFOUND') {
      return true;
    }
  }
  // Fallback por mensagem (googleapis �s vezes enterra o status).
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('socket hang up')) return true;
  if (msg.includes('rate limit') || msg.includes('quota exceeded') || msg.includes('user rate limit')) return true;
  return false;
}

// Dimens�o m�nima garantida por sync via pre-flight grow (chamada API separada
// antes do main batch). Grande o suficiente para cobrir o pior caso de qualquer
// tab (stock: ~1500 rows). trimSheet no fim encolhe para o tamanho real � zero
// overhead residual na sheet.
const PRE_SYNC_MIN_ROWS = 3000;
const PRE_SYNC_MIN_COLS = 30;

/**
 * Pre-flight grow � chamada API SEPARADA antes do main batch.
 *
 * Por que separada: o grow in-batch (updateSheetProperties como request 0 do
 * batch) tem falhado em prod sem erro vis�vel � sintoma "Attempting to write
 * row X, beyond last requested row of: 5" com 5 = grid size ANTES do grow.
 * Ou o grow n�o aplica, ou aplica tarde demais. Causa incerta. Um batchUpdate
 * separado com S� o grow ELIMINA a classe: se falha, syncOne throws antes de
 * escrever; se passa, o main batch arranca com grid = PRE_SYNC_MIN � 30.
 *
 * Usa MAX(current, min) para NUNCA encolher � se a sheet j� tem mais rows
 * (sync pesado anterior que trim n�o chegou a aplicar), preserva.
 */
async function _preFlightGrow(sheets, spreadsheetId, sheetId, key) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,gridProperties))',
  });
  const sheetMeta = (meta.data.sheets || []).find(s => s.properties.sheetId === sheetId);
  const current = sheetMeta?.properties?.gridProperties || {};
  const curRows = current.rowCount || 0;
  const curCols = current.columnCount || 0;
  const targetRows = Math.max(curRows, PRE_SYNC_MIN_ROWS);
  const targetCols = Math.max(curCols, PRE_SYNC_MIN_COLS);
  if (targetRows === curRows && targetCols === curCols) {
    log(`[SHEETS] pre-flight grow ${key}: j� ${curRows}�${curCols}, skip.`);
    return { curRows, curCols, targetRows, targetCols };
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { rowCount: targetRows, columnCount: targetCols } },
            fields: 'gridProperties.rowCount,gridProperties.columnCount',
          },
        },
      ],
    },
  });
  log(`[SHEETS] pre-flight grow ${key}: ${curRows}�${curCols} ? ${targetRows}�${targetCols}`);
  return { curRows, curCols, targetRows, targetCols };
}

const TAB_SYNCERS = {
  dashboard: () => require('./tabs/dashboard').syncDashboard,
  rankings: () => require('./tabs/rankings').syncRankings,
  resumo: () => require('./tabs/resumo').syncResumo,
  membros: () => require('./tabs/membros').syncMembros,
  saidas: () => require('./tabs/saidas').syncSaidas,
  stock: () => require('./tabs/stock').syncStock,
  config: () => require('./tabs/config').syncConfig,
};

// -- Circuit breaker para proteção contra quotas Google esgotadas -----------
// Se uma tab falhar 5x seguidas, o circuito abre e salta syncs dessa tab
// durante 60 segundos. Isto evita gastar quota em erros persistentes.
const _circuitState = new Map(); // key → { failures: number, openSince: timestamp|null }
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 60_000;

async function _persistCircuitState(key, state) {
  try {
    await query(
      `INSERT INTO circuit_state (tab, failures, open_since, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tab) DO UPDATE SET
         failures = EXCLUDED.failures,
         open_since = EXCLUDED.open_since,
         updated_at = NOW()`,
      [key, state.failures, state.openSince]
    );
  } catch (e) {
    warn(`[SHEETS:CIRCUIT] Failed to persist circuit state for ${key}: ${e.message}`);
  }
}

(async () => {
  try {
    const res = await query('SELECT tab, failures, open_since FROM circuit_state');
    for (const row of res.rows) {
      _circuitState.set(row.tab, { failures: row.failures, openSince: row.open_since });
    }
  } catch (e) {
    warn(`[SHEETS:CIRCUIT] Failed to load circuit state: ${e.message}`);
  }
})();

async function _circuitRecord(key, success) {
  const state = _circuitState.get(key) || { failures: 0, openSince: null };
  if (success) {
    state.failures = 0;
    state.openSince = null;
  } else {
    state.failures += 1;
    if (state.failures >= CIRCUIT_FAILURE_THRESHOLD && !state.openSince) {
      state.openSince = Date.now();
      warn(
        `[SHEETS:CIRCUIT] Tab '${key}' abriu circuito ap�s ${state.failures} falhas. Cooldown ${CIRCUIT_COOLDOWN_MS / 1000}s.`
      );
    }
  }
  _circuitState.set(key, state);
  // Persistência best-effort — não bloqueia o sync path principal.
  _persistCircuitState(key, state).catch(() => {});
  return state;
}

function _circuitIsOpen(key) {
  const state = _circuitState.get(key);
  if (!state || !state.openSince) return false;
  if (Date.now() - state.openSince >= CIRCUIT_COOLDOWN_MS) {
    // Auto-reset ap�s cooldown
    state.failures = 0;
    state.openSince = null;
    _circuitState.set(key, state);
    log(`[SHEETS:CIRCUIT] Tab '${key}' reset ap�s cooldown.`);
    return false;
  }
  return true;
}

function _hasPartialFailure(flushed, expectedCount) {
  const replies = flushed?.replies || [];
  if (replies.length < expectedCount) return true;
  return replies.some(r => r && (r.error || r.errorDetails));
}

function getSpreadsheetId() {
  return CONFIG.SPREADSHEET_ID || CONFIG.GOOGLE_SHEET_ID || CONFIG.SHEET_ID || null;
}

/**
 * Percorre o batch e devolve o maior endRow/endCol que aparece em
 * QUALQUER request com range/start para este sheetId. Defensive safety
 * net para o trimSheet � se algum request (updateCells, setRowHeight,
 * mergeCells, etc.) toca em row N, a grid TEM de ter rowCount >= N+1.
 *
 * Formatos suportados:
 *   - updateCells com range        (clearRange)           ? endRowIndex
 *   - updateCells com start+rows   (writes com dados)     ? start.rowIndex + rows.length
 *   - updateDimensionProperties    (setRowHeight/Col)     ? range.endIndex
 *   - mergeCells                   (merges)               ? range.endRowIndex
 *   - updateBorders                (bordas)               ? range.endRowIndex
 *   - addBanding                   (zebra)                ? bandedRange.range.endRowIndex
 *   - addConditionalFormatRule     (conditional)          ? ranges[].endRowIndex
 *   - repeatCell                   (repeat styling)       ? range.endRowIndex
 *
 * Qualquer outro request que introduza range e n�o esteja aqui: n�o
 * fatal, s� significa que o safeRow fica subestimado para esse request
 * (fallback: syncer's reported lastRow continua a ser o piso m�nimo).
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
    // updateCells � dois formatos: com range OR com start+rows.
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

    // updateDimensionProperties � setRowHeight, setColumnWidth.
    // range usa startIndex/endIndex em vez de startRowIndex/endRowIndex.
    if (req.updateDimensionProperties) {
      const r = req.updateDimensionProperties.range;
      if (r && r.sheetId === sheetId && Number.isFinite(r.endIndex)) {
        if (r.dimension === 'ROWS') maxRow = Math.max(maxRow, r.endIndex);
        else if (r.dimension === 'COLUMNS') maxCol = Math.max(maxCol, r.endIndex);
      }
    }

    // mergeCells, updateBorders, repeatCell � range standard.
    if (req.mergeCells) readRange(req.mergeCells.range);
    if (req.updateBorders) readRange(req.updateBorders.range);
    if (req.repeatCell) readRange(req.repeatCell.range);

    // addBanding � bandedRange.range.
    if (req.addBanding && req.addBanding.bandedRange) readRange(req.addBanding.bandedRange.range);

    // addConditionalFormatRule � rule.ranges[].
    if (req.addConditionalFormatRule && req.addConditionalFormatRule.rule) {
      for (const range of req.addConditionalFormatRule.rule.ranges || []) readRange(range);
    }
  }
  return { row: maxRow, col: maxCol };
}

async function _syncOneImpl(key) {
  const syncer = TAB_SYNCERS[key];
  if (!syncer) throw new Error(`Tab desconhecida: ${key}`);

  // Circuit breaker guard
  if (_circuitIsOpen(key)) {
    warn(`[SHEETS] sync '${key}' saltado � circuito aberto (quota protection).`);
    return { skipped: 'circuit_open' };
  }

  const sheets = getSheetsClient();
  if (!sheets) {
    warn(`[SHEETS] sync '${key}' saltado � Google Service Account n�o configurado.`);
    return { skipped: 'no_sheets_client' };
  }
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) {
    warn(`[SHEETS] sync '${key}' saltado � SPREADSHEET_ID n�o configurado.`);
    return { skipped: 'no_spreadsheet_id' };
  }

  const t0 = Date.now();
  const tabs = await ensureTabs(sheets, spreadsheetId);
  const sheetId = tabs[key];
  if (sheetId === undefined) throw new Error(`SheetId n�o encontrado para ${key}`);

  // Pre-flight grow � chamada API separada ANTES do main batch. Se falha,
  // syncOne throws sem escrever. Se passa, main batch arranca com grid garantido.
  await _preFlightGrow(sheets, spreadsheetId, sheetId, key);

  const batch = new BatchWriter(sheets, spreadsheetId);
  // Reset freezes/merges antigos � novos layouts podem sobrepor-se aos antigos.
  batch.freezeRows(sheetId, 0);
  batch.freezeCols(sheetId, 0);
  batch.unmergeAll(sheetId);
  // Limpar antes de reescrever (simples, idempotente).
  batch.clearRange(sheetId);

  let syncErr = null;
  let flushed = { replies: [] };
  let trimArgs = null;
  try {
    const result = await syncer()(batch, sheetId);
    if (result && Number.isFinite(result.lastRow) && Number.isFinite(result.lastCol)) {
      // Defensive: calcula o maior endRow/endCol que aparece em qualquer
      // updateCells do batch. Se o syncer subestima (ex: cursor `row` n�o
      // acompanha todas as escritas � observado em stock.js), trimSheet
      // pode encolher abaixo de writes reais ? Google rejeita com
      // "Attempting to write row X, beyond last requested row of Y".
      const observed = _maxWrittenCell(batch.requests, sheetId);
      const safeRow = Math.max(result.lastRow, observed.row);
      const safeCol = Math.max(result.lastCol, observed.col);
      trimArgs = { safeRow, safeCol };
    }
    // Debug pre-flush � diagnostica "row X beyond row Y" reportado em prod.
    // Dumpa o estado do grow target para ver se o SET semantic est� a funcionar
    // ou se o deploy do fix n�o chegou a Railway (ambos d�o sintoma parecido).
    const growTarget = batch._growTargets?.get(sheetId);
    log(
      `[SHEETS:debug] ${key} pre-flush: ${batch.requests.length} requests, growTarget=${JSON.stringify(growTarget || null)}, result.lastRow=${result?.lastRow}, result.lastCol=${result?.lastCol}`
    );
    const requestCount = batch.requests.length;
    flushed = await batch.flush();

    if (!_hasPartialFailure(flushed, requestCount)) {
      if (trimArgs) {
        const trimBatch = new BatchWriter(sheets, spreadsheetId);
        trimSheet(trimBatch, sheetId, trimArgs.safeRow, trimArgs.safeCol);
        try {
          await trimBatch.flush();
        } catch (trimErr) {
          warn(`[SHEETS] trim '${key}' falhou (non-fatal): ${trimErr.message}`);
        }
      }
    } else {
      warn(
        `[SHEETS] ${key} partial batch failure (${(flushed.replies || []).length}/${requestCount} replies) — trim skipped`
      );
      syncErr = new ConflictError('Partial sync failure — trim skipped');
    }
  } catch (e) {
    syncErr = e;
    // Se o erro menciona requests[N], dumpa esse request + vizinhos para
    // percebermos o que partiu em prod (ex: "row 509 beyond row 5" precisa
    // de ver a updateSheetProperties e a updateCells em causa).
    const m = /requests\[(\d+)\]/.exec(String(e.message || ''));
    if (m) {
      const idx = Number(m[1]);
      const reqsNear = [idx - 1, idx, idx + 1]
        .filter(i => i >= 0 && i < batch.requests.length)
        .map(i => ({ i, req: batch.requests[i] }));
      warn(`[SHEETS:flush-error] ${key} req[${idx}]: ${JSON.stringify(reqsNear).slice(0, 1500)}`);
      // Tamb�m dumpa o primeiro request � � normalmente o grow (updateSheetProperties).
      warn(`[SHEETS:flush-error] ${key} req[0] (grow): ${JSON.stringify(batch.requests[0] || null).slice(0, 500)}`);
    }
  }

  // Protec��o + hide em batch separado (n�o falha o sync se j� existe protec��o)
  if (!syncErr) {
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties,sheets.protectedRanges' });
      const sheetMeta = (meta.data.sheets || []).find(s => s.properties.sheetId === sheetId);
      const existingProtections = sheetMeta?.protectedRanges || [];
      const postBatch = new BatchWriter(sheets, spreadsheetId);
      // Remover protec��es existentes antes de adicionar nova
      for (const p of existingProtections) {
        postBatch.requests.push({ deleteProtectedRange: { protectedRangeId: p.protectedRangeId } });
      }
      postBatch.protectSheet(sheetId, 'Ballas Gang � gerido pelo bot');
      if (key === 'config') postBatch.hideSheet(sheetId);
      await postBatch.flush();
    } catch (e) {
      warn(`[SHEETS] protect/hide '${key}' falhou (non-fatal): ${e.message}`);
    }
  }

  const ms = Date.now() - t0;
  const ops = flushed.replies?.length || 0;

  // Regista estado (best-effort � sheet_sync_state pode n�o existir em DB legacy).
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

  // M�tricas � sempre incrementa, independente de DB (observabilidade in-memory).
  metrics.sheetsSyncTotal.inc();
  metrics.sheetsSyncByTab.inc({ tab: key, result: syncErr ? 'error' : 'ok' });
  if (syncErr) metrics.sheetsSyncErrorsTotal.inc();

  // Circuit breaker: registar resultado
  await _circuitRecord(key, !syncErr);

  if (syncErr) throw syncErr;
  log(`[SHEETS] sync ${key}: ${ops} ops em ${ms}ms`);
  return { tab: key, ops, ms };
}

async function syncOne(key) {
  const syncer = TAB_SYNCERS[key];
  if (!syncer) throw new Error(`Tab desconhecida: ${key}`);

  await googleRateLimiter.acquire(5);

  while (_syncLocks.has(key)) {
    try {
      await _syncLocks.get(key);
    } catch {}
  }
  let resolveLock, _rejectLock;
  const lockPromise = new Promise((res, rej) => {
    resolveLock = res;
    _rejectLock = rej;
  });
  _syncLocks.set(key, lockPromise);

  let lastErr = null;
  try {
    try {
      await query('UPDATE sync_retries SET resolved_at = NOW() WHERE tab = $1 AND resolved_at IS NULL', [key]);
    } catch (_) {}

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await _syncOneImpl(key);
      } catch (e) {
        lastErr = e;
        const isTransient = isTransientSheetsError(e);
        if (!isTransient) {
          const code = e.code || e.response?.status || e.response?.data?.error?.code;
          if (code === 401 || code === 403) {
            require('./googleAuth').invalidateSheetsClient();
          }
        }
        const canRetry = attempt < RETRY_DELAYS_MS.length && isTransient;
        if (!canRetry) throw e;
        const delay = RETRY_DELAYS_MS[attempt];
        warn(
          `[SHEETS] ${key} transit�rio (tentativa ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}): ${e.message} � retry em ${delay}ms`
        );
        await new Promise(r => setTimeout(r, delay));
      }
    }
    try {
      await query(
        `
        INSERT INTO sync_retries (tab, event_type, last_error, next_retry_at)
        VALUES ($1, $2, $3, NOW() + interval '5 seconds')
      `,
        [key, 'sync.failed', lastErr.message?.slice(0, 500) || 'unknown']
      );
    } catch (dbErr) {
      warn(`[SHEETS:DLQ] Falha a gravar retry na DB: ${dbErr.message}`);
    }
    throw lastErr;
  } finally {
    _syncLocks.delete(key);
    resolveLock();
  }
}

/**
 * Sync de todas as tabs, sequencial. Usado no boot para trazer o estado
 * actual da DB para o Sheet de uma vez (event-driven sync acaba por
 * eventualmente fazer o mesmo, mas s� quando eventos disparam).
 */
async function syncAll() {
  const results = [];
  for (const key of Object.keys(TAB_SYNCERS)) {
    try {
      const r = await syncOne(key);
      results.push(r);
    } catch (e) {
      warn(`[SHEETS] syncAll: tab '${key}' falhou � ${e.message}`);
      results.push({ tab: key, error: e.message });
    }
  }
  return results;
}

module.exports = {
  syncOne,
  syncAll,
  TAB_SYNCERS,
  isTransientSheetsError,
  // Circuit breaker internals (para testes)
  _circuitRecord,
  _circuitIsOpen,
  _circuitReset: () => _circuitState.clear(),
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_MS,
};
