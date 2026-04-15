'use strict';
/**
 * Workbook — gestão central das tabs do Google Sheet.
 *
 * Responsabilidades:
 *   - Garante que cada tab existe (cria se falta)
 *   - Devolve sheetId (necessário para batchUpdate em quase tudo)
 *   - Permite "rebuild" (apaga e recria uma tab quando schema muda)
 *   - Aplica tabColor (vermelho escuro RedWood em todas)
 *
 * Sem conhecimento do CONTEÚDO das tabs — isso é responsabilidade dos
 * módulos em src/sheets/tabs/*.js.
 */

const { COLOR } = require('./theme');
const { log, warn } = require('../logger');

// Nome canónico + ordem canónica das tabs. Render em ordem no workbook.
const TABS = [
  { key: 'dashboard',      title: 'Dashboard',         color: COLOR.RED_DEEP,  order:  0 },
  { key: 'weekly',         title: 'Resumo Semanal',    color: COLOR.RED_DEEP,  order:  1 },
  { key: 'daily',          title: 'Resumo Diário',     color: COLOR.RED_DEEP,  order:  2 },
  { key: 'members',        title: 'Membros',           color: COLOR.CHARCOAL,  order:  3 },
  { key: 'moradores',      title: 'Moradores',         color: COLOR.CHARCOAL,  order:  4 },
  { key: 'oficiais',       title: 'Oficiais',          color: COLOR.CHARCOAL,  order:  5 },
  { key: 'saidas',         title: 'Saídas',            color: COLOR.RED_BLOOD, order:  6 },
  { key: 'participantes',  title: 'Participantes',     color: COLOR.RED_BLOOD, order:  7 },
  { key: 'kills',          title: 'Kills',             color: COLOR.RED_BLOOD, order:  8 },
  { key: 'spots',          title: 'Spots',             color: COLOR.RED_BLOOD, order:  9 },
  { key: 'inventory',      title: 'Inventário',        color: COLOR.GRAPHITE,  order: 10 },
  { key: 'movements',      title: 'Movimentos',        color: COLOR.GRAPHITE,  order: 11 },
  { key: 'rankings',       title: 'Rankings',          color: COLOR.GOLD,      order: 12 },
  { key: 'audit',          title: 'Auditoria',         color: COLOR.GRAY_DARK, order: 13 },
  { key: 'config',         title: 'Config',            color: COLOR.GRAY_DARK, order: 14 },
];

const TABS_BY_KEY = Object.fromEntries(TABS.map(t => [t.key, t]));

/**
 * Faz fetch do workbook e devolve {sheetId, title} por tab.
 * Cria as tabs em falta na ordem canónica. Não apaga tabs extras (o user
 * pode ter coisas manuais).
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

  // Devolve map {tabKey → sheetId}
  const byKey = {};
  for (const tab of TABS) {
    byKey[tab.key] = existing.get(tab.title);
  }
  return byKey;
}

/**
 * Apaga uma tab pelo título. Usado em rebuild.
 */
async function deleteTab(sheets, spreadsheetId, sheetId) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ deleteSheet: { sheetId } }] },
  }).catch(e => warn(`[SHEETS] deleteTab falhou: ${e.message}`));
}

/**
 * Rebuild — apaga tabs conhecidas e cria de novo com as propriedades
 * canónicas. Útil quando o schema mudou ou o user quer reset.
 *
 * Se `purgeOthers` for true, também apaga QUALQUER tab que não faça parte do
 * layout canónico (lixo antigo, duplicados, tabs manuais). O Google Sheets
 * exige pelo menos 1 sheet no workbook, por isso garantimos que o batch
 * cria as canónicas ao mesmo tempo que apaga.
 */
async function rebuildTabs(sheets, spreadsheetId, keys = null, { purgeOthers = false } = {}) {
  const targets = keys ? keys.map(k => TABS_BY_KEY[k]).filter(Boolean) : TABS;
  const canonicalTitles = new Set(TABS.map(t => t.title));
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = meta.data.sheets || [];
  const byTitle = new Map(allSheets.map(s => [s.properties.title, s.properties.sheetId]));

  const deletes = [];
  for (const tab of targets) {
    if (byTitle.has(tab.title)) deletes.push({ deleteSheet: { sheetId: byTitle.get(tab.title) } });
  }
  if (purgeOthers) {
    for (const s of allSheets) {
      const t = s.properties.title;
      if (!canonicalTitles.has(t)) {
        deletes.push({ deleteSheet: { sheetId: s.properties.sheetId } });
      }
    }
  }

  const creates = targets.map(tab => ({
    addSheet: {
      properties: {
        title: tab.title,
        index: tab.order,
        tabColor: tab.color,
        gridProperties: { rowCount: 200, columnCount: 26 },
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId, requestBody: { requests: [...deletes, ...creates] },
  });

  return ensureTabs(sheets, spreadsheetId);
}

module.exports = { TABS, TABS_BY_KEY, ensureTabs, deleteTab, rebuildTabs };
