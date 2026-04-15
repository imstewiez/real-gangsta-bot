'use strict';
const { google } = require('googleapis');
const CONFIG = require('../config');
const { log, warn } = require('../logger');

let _sheets = null;

function _parseCredentials(raw) {
  const trimmed = raw.trim();

  // 1. JSON inline
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON: JSON inválido (${e.message}). Dica: se colaste no Railway, usa base64 — 'cat key.json | base64 -w0' e cola o resultado. O código aceita base64 automaticamente.`);
    }
  }

  // 2. Base64 (string sem { e sem separador de path)
  if (!/[\/\\]/.test(trimmed) && /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 100) {
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
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON: não consegui ler como path (${e.message}). Usa JSON inline ou base64.`);
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
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

async function writeRange(spreadsheetId, range, values) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

async function clearRange(spreadsheetId, range) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
    requestBody: {},
  });
}

async function appendRows(spreadsheetId, range, values) {
  const sheets = getSheetsClient();
  if (!sheets) return;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

module.exports = { getSheetsClient, readRange, writeRange, clearRange, appendRows };
