'use strict';
/**
 * Workbook — lista canónica de tabs e garantia de existência.
 *
 * Responsabilidades mínimas:
 *   - Declarar TABS canónicas (ordem, título, cor)
 *   - `ensureTabs`: criar as que faltam, devolver {key → sheetId}
 *
 * Sem rebuild — o Sheets é uma projecção event-driven (src/sheets/projections).
 * Se uma tab ficar corrupta, apagar manualmente no Google Sheets UI e o
 * próximo evento recria-a via `ensureTabs`.
 */

const { COLOR } = require('./theme');
const { log } = require('../logger');

// 6 tabs canónicas — compactação máxima. Secções internas substituem
// tabs separadas para reduzir ruído de navegação.
const TABS = [
  { key: 'dashboard', title: '📊 Dashboard',         color: COLOR.RED_DEEP,    order: 0 },
  { key: 'resumo',    title: '📈 Resumo & Rankings', color: COLOR.RED_BLOOD,   order: 1 },
  { key: 'membros',   title: '👥 Membros',           color: COLOR.GREEN_DEEP,  order: 2 },
  { key: 'saidas',    title: '🎯 Saídas & Combate',  color: COLOR.YELLOW_DEEP, order: 3 },
  { key: 'stock',     title: '📦 Stock',             color: COLOR.BLUE_DEEP,   order: 4 },
  { key: 'config',    title: '⚙️ Config',            color: COLOR.GRAY_DARK,   order: 5 },
];

const TABS_BY_KEY = Object.fromEntries(TABS.map(t => [t.key, t]));

/**
 * Faz fetch do workbook e devolve {key → sheetId}. Cria as tabs em falta
 * na ordem canónica. Nunca apaga nada — o user pode ter coisas manuais.
 */
async function ensureTabs(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = new Map();
  for (const s of meta.data.sheets || []) {
    existing.set(s.properties.title, s.properties.sheetId);
  }

  const requests = [];
  for (const tab of TABS) {
    if (!existing.has(tab.title)) {
      requests.push({
        addSheet: {
          properties: {
            title: tab.title,
            index: tab.order,
            tabColor: tab.color,
            gridProperties: { rowCount: 200, columnCount: 26 },
          },
        },
      });
    }
  }

  if (requests.length) {
    log(`[SHEETS] A criar ${requests.length} tabs em falta…`);
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId, requestBody: { requests },
    });
    for (const reply of res.data.replies || []) {
      if (reply.addSheet) {
        existing.set(reply.addSheet.properties.title, reply.addSheet.properties.sheetId);
      }
    }
  }

  const byKey = {};
  for (const tab of TABS) {
    byKey[tab.key] = existing.get(tab.title);
  }
  return byKey;
}

module.exports = { TABS, TABS_BY_KEY, ensureTabs };
