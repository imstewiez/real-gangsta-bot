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
// Consolidação: 15 → 9 tabs. Weekly+Daily→Resumo, Members+Moradores+Oficiais→
// Membros, Kills+Spots→Combate, Inventory+Movements→Stock, Audit removido.
// 6 tabs canónicas — compactação máxima. Secções internas bem organizadas
// substituem tabs separadas para reduzir ruído de navegação.
const TABS = [
  { key: 'dashboard',     title: '📊 Dashboard',          color: COLOR.RED_DEEP,  order: 0 },
  { key: 'resumo',        title: '📈 Resumo & Rankings',  color: COLOR.RED_DEEP,  order: 1 },
  { key: 'membros',       title: '👥 Membros',            color: COLOR.CHARCOAL,  order: 2 },
  { key: 'saidas',        title: '🎯 Saídas & Combate',   color: COLOR.RED_BLOOD, order: 3 },
  { key: 'stock',         title: '📦 Stock',              color: COLOR.GRAPHITE,  order: 4 },
  { key: 'config',        title: '⚙️ Config',             color: COLOR.GRAY_DARK, order: 5 },
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
 * Rebuild — apaga tabs canónicas (e opcionalmente todas as não-canónicas)
 * e cria de novo com as propriedades certas.
 *
 * O Google Sheets valida cada request do batchUpdate sequencialmente e
 * rejeita qualquer deleteSheet que levasse a 0 tabs no workbook. Para
 * garantir que nunca chegamos a 0 mesmo a meio do batch, criamos um
 * "anchor" temporário antes do rebuild e apagamo-lo no fim.
 */
async function rebuildTabs(sheets, spreadsheetId, keys = null, { purgeOthers = false } = {}) {
  const targets = keys ? keys.map(k => TABS_BY_KEY[k]).filter(Boolean) : TABS;
  const canonicalTitles = new Set(TABS.map(t => t.title));

  // Passo 1: criar anchor temporário — garante que nunca chegamos a 0 sheets.
  const anchorTitle = `_rebuild_anchor_${Date.now()}`;
  const anchorRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: anchorTitle } } }] },
  });
  const anchorId = anchorRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (anchorId === undefined) throw new Error('Falhou a criar anchor temporária para rebuild');

  try {
    // Passo 2: apurar estado actual e construir deletes + creates.
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = meta.data.sheets || [];
    const targetTitles = new Set(targets.map(t => t.title));

    const deletesCanonical = [];
    const deletesNonCanonical = [];
    for (const s of allSheets) {
      const t = s.properties.title;
      if (s.properties.sheetId === anchorId) continue;
      if (targetTitles.has(t)) {
        deletesCanonical.push({ deleteSheet: { sheetId: s.properties.sheetId } });
      } else if (purgeOthers && !canonicalTitles.has(t)) {
        deletesNonCanonical.push({ deleteSheet: { sheetId: s.properties.sheetId } });
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

    // Ordem: deletes → creates → remover anchor. Com anchor activa nunca
    // chegamos a 0 sheets.
    const requests = [
      ...deletesCanonical,
      ...deletesNonCanonical,
      ...creates,
      { deleteSheet: { sheetId: anchorId } },
    ];

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId, requestBody: { requests },
    });
  } catch (err) {
    // Se falhou antes de apagar a anchor, tenta limpá-la para não deixar lixo.
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ deleteSheet: { sheetId: anchorId } }] },
    }).catch(() => {});
    throw err;
  }

  return ensureTabs(sheets, spreadsheetId);
}

module.exports = { TABS, TABS_BY_KEY, ensureTabs, deleteTab, rebuildTabs };
