'use strict';
/**
 * Tab Inventário — stock actual agrupado por categoria com subtotais,
 * valor ponderado, top itens e estado visual.
 */

const { COLOR, NUM_FMT, cell, bodyCell, bodyBoldCell, captionCell, mutedCell, numCell, badgeCell,
  conditionalGreaterThan, conditionalLessThan } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, kpiStrip, tableHeader, tableBody,
  footerBlock, setWidths, autoResizeColumns,
} = require('./_common');
const { getInventoryFull, getStockByCategory } = require('../queries');

const HEADERS = [
  'Item', 'Categoria', 'Qtd', 'Un.', 'Valor Unit.', 'Valor Total',
  'Entradas', 'Saídas', 'Última Mov.', 'Estado',
];
const COL_COUNT = HEADERS.length;

function stateBadge(balance) {
  const b = Number(balance || 0);
  if (b <= 0)  return badgeCell('ESGOTADO', COLOR.RED_DEEP);
  if (b <= 3)  return badgeCell('CRÍTICO',  COLOR.RED_BLOOD);
  if (b <= 10) return badgeCell('BAIXO',    COLOR.YELLOW_DEEP);
  if (b >= 100) return badgeCell('ALTO',    COLOR.GREEN_DEEP);
  return badgeCell('NORMAL', COLOR.GRAPHITE);
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 16); } catch { return String(d); }
}

async function syncInventory(batch, sheetId) {
  const [rows, byCat] = await Promise.all([getInventoryFull(), getStockByCategory()]);

  const totalValue = rows.reduce((a, r) => a + Number(r.value_total || 0), 0);
  const totalQty   = rows.reduce((a, r) => a + Number(r.balance || 0), 0);
  const critical   = rows.filter(r => (r.balance || 0) <= 3).length;
  const zeros      = rows.filter(r => (r.balance || 0) <= 0).length;

  let row = headerBlock(batch, sheetId, {
    title: 'Inventário · Stock da Casa',
    subtitle: `${rows.length} itens activos · ${critical} críticos · ${zeros} esgotados`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  row = sectionHeader(batch, sheetId, row, {
    title: 'PANORAMA DO STOCK', hint: 'valores consolidados', columnCount: COL_COUNT,
  });
  row = kpiStrip(batch, sheetId, row, [
    { label: 'Itens',       value: rows.length, numberFormat: NUM_FMT.INT,  delta: `${byCat.length} categorias`, deltaDirection: 'flat' },
    { label: 'Quantidade',  value: totalQty,    numberFormat: NUM_FMT.INT,  delta: 'unidades em stock', deltaDirection: 'flat' },
    { label: 'Valor Stock', value: totalValue,  numberFormat: NUM_FMT.EURO, delta: `média ${(totalValue / Math.max(rows.length, 1)).toFixed(0)} €/item`, deltaDirection: 'flat' },
    { label: 'Críticos',    value: critical,    numberFormat: NUM_FMT.INT,  delta: zeros > 0 ? `${zeros} esgotados` : 'nada esgotado', deltaDirection: critical > 0 ? 'down' : 'up' },
  ], COL_COUNT);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Breakdown por categoria (tabela compacta) ────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'BREAKDOWN POR CATEGORIA', hint: 'qtd + valor por categoria', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Categoria', 'Nº Itens', 'Quantidade', 'Valor (€)', '% do Valor', '', '', '', '', '']);
  const catRows = byCat.map(c => {
    const pct = totalValue > 0 ? Number(c.total_value) / totalValue : 0;
    const cells = [
      bodyBoldCell(c.category || '—'),
      numCell(c.items_count, NUM_FMT.INT),
      numCell(c.total_qty, NUM_FMT.INT),
      numCell(Number(c.total_value), NUM_FMT.EURO),
      numCell(pct, NUM_FMT.PCT),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, catRows);

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Tabela principal agrupada por categoria ──────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'INVENTÁRIO DETALHADO', hint: 'agrupado por categoria', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, HEADERS);
  const firstDataRow = row;

  // Agrupar por categoria (preserva ordem que veio da DB)
  const groups = new Map();
  for (const it of rows) {
    const cat = it.category || '—';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(it);
  }

  // Ordenar categorias pelas que têm mais valor total
  const sortedCats = Array.from(groups.keys()).sort((a, b) => {
    const va = groups.get(a).reduce((s, i) => s + Number(i.value_total || 0), 0);
    const vb = groups.get(b).reduce((s, i) => s + Number(i.value_total || 0), 0);
    return vb - va;
  });

  let zebraIndex = 0;
  for (const cat of sortedCats) {
    const items = groups.get(cat);

    // Linha-cabeçalho de categoria (full-width, subHeader)
    const catCells = [
      bodyBoldCell(cat.toUpperCase(), { bg: COLOR.BG_BLOCK, align: 'LEFT' }),
      ...Array(COL_COUNT - 1).fill(cell('', { bg: COLOR.BG_BLOCK })),
    ];
    batch.updateCells(sheetId, row, 0, [catCells]);
    batch.setRowHeight(sheetId, row, 22);
    batch.mergeCells(sheetId, row, row + 1, 0, COL_COUNT);
    row += 1;

    // Itens
    for (const i of items) {
      const rowCells = [
        bodyCell(i.name),
        captionCell(i.category || '—'),
        numCell(i.balance, NUM_FMT.INT),
        captionCell(i.unit || 'un'),
        numCell(Number(i.estimated_value), NUM_FMT.EURO_DEC),
        numCell(Number(i.value_total), NUM_FMT.EURO),
        numCell(i.total_in || 0, NUM_FMT.INT),
        numCell(i.total_out || 0, NUM_FMT.INT),
        captionCell(fmtDate(i.last_movement)),
        stateBadge(i.balance),
      ];
      // Zebra manual (preservar estados dos badges)
      if (zebraIndex % 2 === 1) {
        for (const c of rowCells) {
          if (c.userEnteredFormat && c.userEnteredFormat.backgroundColor) {
            const bg = c.userEnteredFormat.backgroundColor;
            if (Math.abs(bg.red - COLOR.BG_APP.red) < 0.02) {
              c.userEnteredFormat.backgroundColor = COLOR.BG_BLOCK;
            }
          }
        }
      }
      batch.updateCells(sheetId, row, 0, [rowCells]);
      batch.setRowHeight(sheetId, row, 22);
      row += 1;
      zebraIndex += 1;
    }

    // Subtotal da categoria
    const subQty = items.reduce((a, i) => a + Number(i.balance || 0), 0);
    const subVal = items.reduce((a, i) => a + Number(i.value_total || 0), 0);
    const subCells = [
      bodyBoldCell(`⎯ subtotal ${cat}`, { bg: COLOR.BG_BLOCK_ALT, align: 'RIGHT' }),
      cell('', { bg: COLOR.BG_BLOCK_ALT }),
      numCell(subQty, NUM_FMT.INT, { bg: COLOR.BG_BLOCK_ALT, font: { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.WHITE } }),
      cell('', { bg: COLOR.BG_BLOCK_ALT }),
      cell('', { bg: COLOR.BG_BLOCK_ALT }),
      numCell(subVal, NUM_FMT.EURO, { bg: COLOR.BG_BLOCK_ALT, font: { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.WHITE } }),
      ...Array(COL_COUNT - 6).fill(cell('', { bg: COLOR.BG_BLOCK_ALT })),
    ];
    batch.updateCells(sheetId, row, 0, [subCells]);
    batch.setRowHeight(sheetId, row, 22);
    row += 1;
    zebraIndex = 0; // reset por grupo
  }

  // Conditional formatting na coluna Qtd (2)
  if (rows.length) {
    batch.addRule(conditionalLessThan(sheetId, firstDataRow, 2, row, 3, 4, COLOR.RED_SIGNAL_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, firstDataRow, 2, row, 3, 50, COLOR.GREEN_SOFT));
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Inventário');

  autoResizeColumns(batch, sheetId, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncInventory };
