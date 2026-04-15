'use strict';
require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const creds = raw.trim().startsWith('{') ? JSON.parse(raw) : JSON.parse(fs.readFileSync(raw, 'utf8'));
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });
const SHEET_ID = process.env.SPREADSHEET_ID;

// ── Color palette (gangsta theme) ──────────────────────────────────────────
const C = {
  BLACK:     { red: 0.07, green: 0.07, blue: 0.10 },
  DARK:      { red: 0.10, green: 0.10, blue: 0.15 },
  DARK_BLUE: { red: 0.08, green: 0.13, blue: 0.25 },
  DARK_RED:  { red: 0.30, green: 0.02, blue: 0.02 },
  RED:       { red: 0.91, green: 0.27, blue: 0.37 },
  GOLD:      { red: 0.94, green: 0.76, blue: 0.20 },
  GREEN:     { red: 0.18, green: 0.55, blue: 0.34 },
  BLUE:      { red: 0.20, green: 0.40, blue: 0.70 },
  ORANGE:    { red: 0.85, green: 0.55, blue: 0.15 },
  WHITE:     { red: 1, green: 1, blue: 1 },
  LIGHT:     { red: 0.85, green: 0.85, blue: 0.90 },
  GREY:      { red: 0.35, green: 0.35, blue: 0.40 },
  ROW_EVEN:  { red: 0.12, green: 0.12, blue: 0.17 },
  ROW_ODD:   { red: 0.09, green: 0.09, blue: 0.13 },
};

const TABS = [
  { title: '📊 Resumo Geral',   color: C.GOLD,      cols: 4,  rows: 50 },
  { title: '👥 Membros',         color: C.GREEN,     cols: 12, rows: 100 },
  { title: '📦 Stock Atual',     color: C.BLUE,      cols: 7,  rows: 60 },
  { title: '📋 Movimentos',      color: C.ORANGE,    cols: 11, rows: 500 },
  { title: '⚔️ Operações',       color: C.RED,       cols: 13, rows: 100 },
  { title: '🏆 Top Semanal',     color: C.GOLD,      cols: 9,  rows: 30 },
  { title: '🏷️ Catálogo',        color: C.DARK_BLUE, cols: 6,  rows: 50 },
];

function cellFormat(bg, fg, bold = false, fontSize = 10, hAlign = 'LEFT') {
  return {
    backgroundColor: bg,
    textFormat: { foregroundColor: fg, bold, fontSize, fontFamily: 'Inter' },
    horizontalAlignment: hAlign,
    verticalAlignment: 'MIDDLE',
  };
}

function headerFormat() { return cellFormat(C.DARK_RED, C.WHITE, true, 11, 'CENTER'); }
function subHeaderFormat() { return cellFormat(C.DARK_BLUE, C.LIGHT, true, 10, 'CENTER'); }
function titleFormat() { return cellFormat(C.BLACK, C.GOLD, true, 14, 'CENTER'); }
function valueFormat() { return cellFormat(C.BLACK, C.GOLD, true, 22, 'CENTER'); }
function labelFormat() { return cellFormat(C.DARK, C.LIGHT, false, 10, 'LEFT'); }

async function run() {
  console.log('Setting up Bot di Zona Google Sheet...\n');

  // ── Step 1: Get current sheet state ──────────────────────────────────────
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingTabs = meta.data.sheets.map(s => ({ title: s.properties.title, id: s.properties.sheetId }));
  console.log('Existing tabs:', existingTabs.map(t => t.title).join(', '));

  const requests = [];

  // ── Step 2: Create/rename tabs ───────────────────────────────────────────
  const tabMap = {}; // title → sheetId

  for (let i = 0; i < TABS.length; i++) {
    const tab = TABS[i];
    const existing = existingTabs.find(t => t.title === tab.title);

    if (existing) {
      tabMap[tab.title] = existing.id;
      console.log(`  Tab "${tab.title}" already exists (id: ${existing.id})`);
    } else {
      // Check if we can reuse an old tab
      const oldNames = ['Stock_Atual', 'Movimentos', 'Membros', 'Operações', 'Sheet1'];
      const reusable = existingTabs.find(t => oldNames.includes(t.title) && !Object.values(tabMap).includes(t.id));
      if (reusable) {
        tabMap[tab.title] = reusable.id;
        requests.push({ updateSheetProperties: { properties: { sheetId: reusable.id, title: tab.title, index: i }, fields: 'title,index' } });
        console.log(`  Renaming "${reusable.title}" → "${tab.title}"`);
      } else {
        requests.push({ addSheet: { properties: { title: tab.title, index: i } } });
        console.log(`  Creating tab "${tab.title}"`);
      }
    }
  }

  // Apply tab creation first
  if (requests.length > 0) {
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
    // Update tabMap with new sheet IDs
    for (const reply of (res.data.replies || [])) {
      if (reply.addSheet) {
        tabMap[reply.addSheet.properties.title] = reply.addSheet.properties.sheetId;
      }
    }
    requests.length = 0;
  }

  // Re-fetch to get all IDs
  const meta2 = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  for (const s of meta2.data.sheets) {
    tabMap[s.properties.title] = s.properties.sheetId;
  }

  console.log('\nTab IDs:', tabMap);

  // ── Step 3: Formatting requests ──────────────────────────────────────────
  const fmt = [];

  for (const tab of TABS) {
    const sid = tabMap[tab.title];
    if (sid === undefined) continue;

    // Tab color
    fmt.push({ updateSheetProperties: { properties: { sheetId: sid, tabColorStyle: { rgbColor: tab.color } }, fields: 'tabColorStyle' } });

    // Default background for entire sheet
    fmt.push({ repeatCell: {
      range: { sheetId: sid, startRowIndex: 0, endRowIndex: tab.rows, startColumnIndex: 0, endColumnIndex: tab.cols },
      cell: { userEnteredFormat: cellFormat(C.BLACK, C.LIGHT) },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    }});

    // Header row (row 0) formatting
    fmt.push({ repeatCell: {
      range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: tab.cols },
      cell: { userEnteredFormat: headerFormat() },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    }});

    // Row height for header
    fmt.push({ updateDimensionProperties: {
      range: { sheetId: sid, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 36 }, fields: 'pixelSize',
    }});

    // Freeze header row
    fmt.push({ updateSheetProperties: {
      properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } },
      fields: 'gridProperties.frozenRowCount',
    }});

    // Alternating row colors (rows 1+)
    fmt.push({ addBanding: {
      bandedRange: {
        range: { sheetId: sid, startRowIndex: 1, endRowIndex: tab.rows, startColumnIndex: 0, endColumnIndex: tab.cols },
        rowProperties: {
          firstBandColorStyle: { rgbColor: C.ROW_ODD },
          secondBandColorStyle: { rgbColor: C.ROW_EVEN },
        },
      },
    }});
  }

  // ── Step 4: Specific tab formatting ──────────────────────────────────────

  // Resumo Geral — special dashboard layout
  const resumoId = tabMap['📊 Resumo Geral'];
  if (resumoId !== undefined) {
    // Title row (merge A1:D1)
    fmt.push({ mergeCells: { range: { sheetId: resumoId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 }, mergeType: 'MERGE_ALL' }});
    fmt.push({ repeatCell: {
      range: { sheetId: resumoId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
      cell: { userEnteredFormat: titleFormat() },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    }});
    fmt.push({ updateDimensionProperties: { range: { sheetId: resumoId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 50 }, fields: 'pixelSize' }});

    // Column widths
    fmt.push({ updateDimensionProperties: { range: { sheetId: resumoId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 50 }, fields: 'pixelSize' }});
    fmt.push({ updateDimensionProperties: { range: { sheetId: resumoId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 250 }, fields: 'pixelSize' }});
    fmt.push({ updateDimensionProperties: { range: { sheetId: resumoId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 150 }, fields: 'pixelSize' }});
    fmt.push({ updateDimensionProperties: { range: { sheetId: resumoId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 250 }, fields: 'pixelSize' }});
  }

  // Membros — wider name column
  const membrosId = tabMap['👥 Membros'];
  if (membrosId !== undefined) {
    const widths = [60, 160, 150, 120, 120, 100, 100, 100, 100, 120, 120, 130];
    for (let i = 0; i < widths.length; i++) {
      fmt.push({ updateDimensionProperties: { range: { sheetId: membrosId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: widths[i] }, fields: 'pixelSize' }});
    }
  }

  // Stock — column widths
  const stockId = tabMap['📦 Stock Atual'];
  if (stockId !== undefined) {
    const widths = [60, 180, 120, 80, 100, 100, 120];
    for (let i = 0; i < widths.length; i++) {
      fmt.push({ updateDimensionProperties: { range: { sheetId: stockId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: widths[i] }, fields: 'pixelSize' }});
    }
  }

  // Apply all formatting
  console.log(`\nApplying ${fmt.length} formatting operations...`);
  // Batch in chunks of 50 to avoid limits
  for (let i = 0; i < fmt.length; i += 50) {
    const chunk = fmt.slice(i, i + 50);
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: chunk } });
    console.log(`  Applied ${Math.min(i + 50, fmt.length)}/${fmt.length}`);
  }

  // ── Step 5: Write headers and data ───────────────────────────────────────
  console.log('\nWriting headers and initial data...');

  const values = {};

  // Resumo Geral
  values['📊 Resumo Geral!A1'] = [
    ['🩸 BOT DI ZONA — RESUMO GERAL 🩸'],
    [],
    ['', '📊  VISÃO GERAL', '', ''],
    ['', 'Total Membros Ativos', '—', '(dados atualizados pelo bot)'],
    ['', 'Moradores', '—', ''],
    ['', 'Oficiais', '—', ''],
    ['', 'Chefia', '—', ''],
    [],
    ['', '📦  INVENTÁRIO', '', ''],
    ['', 'Itens em Stock', '—', ''],
    ['', 'Valor Total do Stock', '—', ''],
    ['', 'Entregas esta Semana', '—', ''],
    ['', 'Vendas esta Semana', '—', ''],
    [],
    ['', '⚔️  OPERAÇÕES', '', ''],
    ['', 'Operações esta Semana', '—', ''],
    ['', 'Operações Concluídas (total)', '—', ''],
    ['', 'Taxa de Devolução Média', '—', ''],
    [],
    ['', '🏆  TOP CONTRIBUINTES', '', ''],
    ['', '🥇 1º Lugar', '—', ''],
    ['', '🥈 2º Lugar', '—', ''],
    ['', '🥉 3º Lugar', '—', ''],
    [],
    ['', '📈  PROMOÇÕES AUTOMÁTICAS', '', ''],
    ['', 'Young Blood → O Gunão', '25.000€', 'meta de material'],
    ['', 'O Gunão → Gangster Fodido', '50.000€', 'meta de material'],
  ];

  // Membros
  values['👥 Membros!A1'] = [
    ['#', '👤 Nome', '🆔 Discord ID', '🏷️ Cargo', '⭐ Tier', '📅 Entrada', '📦 Entregas', '💰 Vendas', '💎 Valor Total', '📈 Progresso', '🎯 Próx. Meta', '📝 Notas'],
  ];

  // Stock Atual
  values['📦 Stock Atual!A1'] = [
    ['#', '📦 Item', '🏷️ Categoria', '📏 Unidade', '💰 Preço (€)', '📊 Stock', '💎 Valor Total (€)'],
  ];

  // Movimentos
  values['📋 Movimentos!A1'] = [
    ['📅 Data', '🔄 Tipo', '👤 Membro', '📦 Item', '🏷️ Categoria', '📊 Qtd', '💰 Preço Unit', '💎 Valor Total', '⚔️ Operação', '⭐ Tier', '📝 Notas'],
  ];

  // Operações
  values['⚔️ Operações!A1'] = [
    ['🆔 ID', '📅 Data', '⏰ Hora', '🎯 Tipo', '📍 Estado', '🗺️ Spot', '👑 Líder', '👥 Participantes', '⚔️ Fight?', '🎭 Inimigo', '💀 Mortes', '✅ Sobreviventes', '📝 Notas'],
  ];

  // Top Semanal
  values['🏆 Top Semanal!A1'] = [
    ['🏅 Pos', '👤 Nome', '🆔 Discord', '⭐ Tier', '📦 Entregas', '💰 Vendas', '⚔️ Operações', '💎 Valor Total', '📈 Trend'],
  ];

  // Catálogo
  values['🏷️ Catálogo!A1'] = [
    ['#', '📦 Material', '🏷️ Categoria', '📏 Unidade', '💰 Preço (€)', '✅ Ativo'],
  ];

  // Write all values
  const data = Object.entries(values).map(([range, vals]) => ({
    range, values: vals, majorDimension: 'ROWS',
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });

  // ── Step 6: Write catalog data from items-catalog.json ───────────────────
  try {
    const catalog = JSON.parse(fs.readFileSync('config/items-catalog.json', 'utf8'));
    const catRows = catalog.defaultItems.map((item, i) => [
      i + 1, item.name, item.category, item.unit || 'unidade', item.estimatedValue || 0, 'Sim',
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: '🏷️ Catálogo!A2',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: catRows },
    });
    console.log(`  Catálogo: ${catRows.length} itens escritos`);
  } catch (e) {
    console.log('  Catálogo: skip (', e.message, ')');
  }

  // ── Step 7: Clean up old tabs ────────────────────────────────────────────
  const oldTabNames = ['Sheet1', 'Stock_Atual', 'Movimentos', 'Membros', 'Operações'];
  const meta3 = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const deleteReqs = [];
  for (const s of meta3.data.sheets) {
    if (oldTabNames.includes(s.properties.title)) {
      deleteReqs.push({ deleteSheet: { sheetId: s.properties.sheetId } });
      console.log(`  Removing old tab: ${s.properties.title}`);
    }
  }
  if (deleteReqs.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: deleteReqs } }).catch(() => {});
  }

  // Rename the spreadsheet
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ updateSpreadsheetProperties: { properties: { title: '🩸 Bot di Zona — Gestão' }, fields: 'title' } }] },
  });

  console.log('\n✅ Google Sheet configurada com sucesso!');
  console.log('   Abre: https://docs.google.com/spreadsheets/d/' + SHEET_ID);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
