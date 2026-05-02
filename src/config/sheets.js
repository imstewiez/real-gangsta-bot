'use strict';

// Google Sheets é opcional. Projecções são event-driven com debounce 5s.
// Desligado se GOOGLE_SERVICE_ACCOUNT_JSON ou SPREADSHEET_ID em falta.
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const SHEETS_SYNC_INTERVAL_MIN = parseInt(process.env.SHEETS_SYNC_INTERVAL_MIN || '15', 10);

module.exports = {
  GOOGLE_SERVICE_ACCOUNT_JSON,
  SPREADSHEET_ID,
  SHEETS_SYNC_INTERVAL_MIN,
  isSheetsEnabled: () => Boolean(GOOGLE_SERVICE_ACCOUNT_JSON && SPREADSHEET_ID),
};
