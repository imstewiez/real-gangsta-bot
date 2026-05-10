'use strict';
const { google } = require('googleapis');
const CONFIG = require('../config');
const { warn, log } = require('../logger');

// ── Retry + circuit breaker for raw Sheets API calls ─────────────────────────
// These helpers protect readRange / writeRange / clearRange / appendRows —
// the low-level calls that bypass syncEngine's own retry loop.
//
// Transient: 429, 5xx, network errors (ECONNRESET, ETIMEDOUT, EAI_AGAIN).
// Permanent: 401, 403, 400, 404 — auth/config bugs; retry won't help.
//
// Backoff: 1s → 2s → 4s → 8s → 16s → 30s (capped), max 3 retries.
// Circuit breaker: 5 consecutive failures → open for 60s, then half-open.

const RETRY_MAX = 3;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

const CB_FAILURE_THRESHOLD = 5;
const CB_RESET_MS = 60_000;

const _cbState = { failures: 0, openSince: null };

function _cbIsOpen() {
  if (!_cbState.openSince) return false;
  if (Date.now() - _cbState.openSince >= CB_RESET_MS) {
    _cbState.failures = 0;
    _cbState.openSince = null;
    log('[SHEETS:CB] Circuit reset após 60s de cooldown.');
    return false;
  }
  return true;
}

function _cbRecord(success) {
  if (success) {
    _cbState.failures = 0;
    _cbState.openSince = null;
  } else {
    _cbState.failures += 1;
    if (_cbState.failures >= CB_FAILURE_THRESHOLD && !_cbState.openSince) {
      _cbState.openSince = Date.now();
      warn(
        `[SHEETS:CB] Circuito aberto após ${_cbState.failures} falhas consecutivas. ` +
          `Fail-fast por ${CB_RESET_MS / 1000}s.`
      );
    }
  }
}

function _isTransient(err) {
  if (!err) return false;
  const code = err.code || err.response?.status || err.response?.data?.error?.code;
  if (code) {
    const n = Number(code);
    if (Number.isFinite(n)) {
      if (n === 429) return true;
      if (n >= 500 && n < 600) return true;
      return false; // 4xx (incl. 401/403): auth/config bug — bail immediately
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

async function _withRetry(label, fn) {
  if (_cbIsOpen()) {
    throw new Error(`[SHEETS:CB] Circuito aberto — ${label} rejeitado (fail-fast).`);
  }
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    try {
      const result = await fn();
      _cbRecord(true);
      return result;
    } catch (e) {
      lastErr = e;
      const canRetry = attempt < RETRY_MAX && _isTransient(e);
      if (!canRetry) {
        _cbRecord(false);
        throw e;
      }
      const delay = Math.min(RETRY_BASE_MS * Math.pow(2, attempt), RETRY_MAX_MS);
      warn(
        `[SHEETS] ${label} transitório (tentativa ${attempt + 1}/${RETRY_MAX + 1}): ` +
          `${e.message} — retry em ${delay}ms`
      );
      await _sleep(delay);
    }
  }
  _cbRecord(false);
  throw lastErr;
}

let _sheets = null;

function invalidateSheetsClient() {
  _sheets = null;
}

function _parseCredentials(raw) {
  const trimmed = raw.trim();

  // 1. JSON inline
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_JSON: JSON inválido (${e.message}). Dica: se colaste no Railway, usa base64 — 'cat key.json | base64 -w0' e cola o resultado. O código aceita base64 automaticamente.`
      );
    }
  }

  // 2. Base64 (string sem { e sem separador de path)
  if (!/[/\\]/.test(trimmed) && /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 100) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (e) {
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON: parece base64 mas não decodifica para JSON válido (${e.message}).`);
    }
  }

  // 3. Path para ficheiro
  const fs = require('fs');
  const path = require('path');
  try {
    return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), raw), 'utf8'));
  } catch (e) {
    throw new Error(
      `GOOGLE_SERVICE_ACCOUNT_JSON: não consegui ler como path (${e.message}). Usa JSON inline ou base64.`
    );
  }
}

function getAuth() {
  const raw = CONFIG.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  const credentials = _parseCredentials(raw);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient() {
  if (_sheets) return _sheets;
  const auth = getAuth();
  if (!auth) {
    warn('[SHEETS] Google Service Account não configurado. Export desativado.');
    return null;
  }
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

async function readRange(spreadsheetId, range) {
  const sheets = getSheetsClient();
  if (!sheets) return [];
  const res = await _withRetry(`readRange(${range})`, () => sheets.spreadsheets.values.get({ spreadsheetId, range }));
  return res.data.values || [];
}

async function writeRange(spreadsheetId, range, values) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  await _withRetry(`writeRange(${range})`, () =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    })
  );
}

async function clearRange(spreadsheetId, range) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  await _withRetry(`clearRange(${range})`, () =>
    sheets.spreadsheets.values.clear({
      spreadsheetId,
      range,
      requestBody: {},
    })
  );
}

async function appendRows(spreadsheetId, range, values) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  await _withRetry(`appendRows(${range})`, () =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    })
  );
}

module.exports = {
  getSheetsClient,
  invalidateSheetsClient,
  readRange,
  writeRange,
  clearRange,
  appendRows,
  // Exposed for testing
  _cbState,
  _cbIsOpen,
  _cbRecord,
  _isTransient,
  CB_FAILURE_THRESHOLD,
  CB_RESET_MS,
  RETRY_MAX,
};
