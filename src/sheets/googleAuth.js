'use strict';
const { google } = require('googleapis');
const CONFIG = require('../config');
const { log, warn } = require('../logger');

let _sheets = null;

function getAuth() {
  const raw = CONFIG.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  let credentials;
  if (raw.trim().startsWith('{')) {
    credentials = JSON.parse(raw);
  } else {
    const fs = require('fs');
    const path = require('path');
    credentials = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), raw), 'utf8'));
  }

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
