'use strict';
/**
 * Tab Stock v3 — 10 artigos fixos, controlo da chefia, relatórios contabilísticos.
 *   Secção 1: Panorama (miniKPIRow 5 cards × 2 rows)
 *   Secção 2: Tabela detalhada (Artigo | Qtd | Custo Unit. | Valor Total | Último Mov.)
 *   Secção 3: Relatório Contabilístico (Semanal / Mensal / Média Diária)
 *   Secção 4: Ledger v3 (últimos 50 movimentos)
 */

const {
  COLOR,
  NUM_FMT,
  cell,
  bodyCell,
  bodyBoldCell,
  captionCell,
  mutedCell,
  numCell,
  badgeCell,
} = require('../theme');
const {
  headerBlock,
  sectionHeader,
  spacer,
  miniKPIRow,
  tableHeader,
  tableBody,
  footerBlock,
  autoResizeAll,
  gangTitle,
} = require('./_common');
const {
  getStockV3Balances,
  getStockV3Movements,
  getStockV3WeeklyReport,
  getStockV3MonthlyReport,
  getStockV3DailyAverage,
} = require('../../inventory/v3/stockSheets');
const { getCatalog, getItemName } = require('../../inventory/v3/stockCatalog');
const { getAllPricing } = require('../../inventory/v3/stockPricing');

const CATALOG = getCatalog();
const COL_COUNT = 8;

function movementTypeBadge(type) {
  if (type === 'entrada') return badgeCell('ENTRADA', COLOR.GREEN_DEEP);
  if (type === 'venda') return badgeCell('VENDA', COLOR.GOLD);
  if (type === 'entrega') return badgeCell('ENTREGA', COLOR.RED_DEEP);
  return bodyCell(type);
}

async function syncStock(batch, sheetId) {
  const [balances, movements, weekly, monthly, daily] = await Promise.all([
    getStockV3Balances(),
    getStockV3Movements(50),
    getStockV3WeeklyReport(),
    getStockV3MonthlyReport(),
    getStockV3DailyAverage(30),
  ]);

  const pricingRows = await getAllPricing();
  const pricingMap = new Map(pricingRows.map(p => [p.item_key, Number(p.unit_cost) || 0]));
  const balanceMap = new Map(
    balances.map(b => [b.item_key, { balance: Number(b.balance) || 0, invested: Number(b.total_invested) || 0 }])
  );

  // ── Header ─────────────────────────────────────────────────────────────────
  let row = headerBlock(batch, sheetId, {
    title: gangTitle('Stock v3'),
    subtitle: `${CATALOG.length} artigos · controlo da chefia`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Secção 1: Panorama ─────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, { title: 'PANORAMA', hint: 'estado actual', columnCount: COL_COUNT });

  const totalInvested = CATALOG.reduce((s, it) => s + (balanceMap.get(it.key)?.invested || 0), 0);
  const totalVendasSemana = Number(weekly.total_vendas) || 0;
  const lucroSemana = Number(weekly.gross_profit) || 0;
  const prejuizoSemana = Number(weekly.total_loss) || 0;

  row = miniKPIRow(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Artigos',
        value: CATALOG.length,
        numberFormat: NUM_FMT.INT,
        delta: 'catálogo fixo',
        deltaDirection: 'flat',
      },
      {
        label: 'Investido',
        value: totalInvested,
        numberFormat: NUM_FMT.EURO,
        delta: 'em stock',
        deltaDirection: 'flat',
      },
      {
        label: 'Vendas (sem)',
        value: totalVendasSemana,
        numberFormat: NUM_FMT.EURO,
        delta: 'esta semana',
        deltaDirection: totalVendasSemana > 0 ? 'up' : 'flat',
      },
      {
        label: 'Lucro (sem)',
        value: lucroSemana,
        numberFormat: NUM_FMT.EURO,
        delta: 'bruto semanal',
        deltaDirection: lucroSemana >= 0 ? 'up' : 'down',
      },
    ],
    COL_COUNT
  );

  row = miniKPIRow(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Prejuízo (sem)',
        value: prejuizoSemana,
        numberFormat: NUM_FMT.EURO,
        delta: 'entregas/prémios',
        deltaDirection: 'down',
      },
      {
        label: 'Vendas/dia',
        value: daily.avg_daily_sales,
        numberFormat: NUM_FMT.EURO,
        delta: 'média 30d',
        deltaDirection: daily.avg_daily_sales > 0 ? 'up' : 'flat',
      },
      {
        label: 'Lucro/dia',
        value: daily.avg_daily_gross,
        numberFormat: NUM_FMT.EURO,
        delta: 'média 30d',
        deltaDirection: daily.avg_daily_gross > 0 ? 'up' : 'flat',
      },
      {
        label: 'Dias c/ vendas',
        value: daily.days_with_sales,
        numberFormat: NUM_FMT.INT,
        delta: 'nos últimos 30d',
        deltaDirection: 'flat',
      },
    ],
    COL_COUNT
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Secção 2: Tabela detalhada ─────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'INVENTÁRIO DETALHADO',
    hint: '10 artigos',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, [
    'Artigo',
    'Qtd',
    'Custo Unit.',
    'Valor Total',
    'Investido',
    'Último Mov.',
    '',
    '',
  ]);

  const detailRows = CATALOG.map(item => {
    const bal = balanceMap.get(item.key) || { balance: 0, invested: 0 };
    const unitCost = pricingMap.get(item.key) || 0;
    const totalValue = unitCost * bal.balance;
    const lastMov = movements.find(m => m.item_key === item.key);
    return [
      bodyBoldCell(item.name),
      numCell(bal.balance, NUM_FMT.INT),
      numCell(unitCost, NUM_FMT.EURO),
      numCell(totalValue, NUM_FMT.EURO),
      numCell(bal.invested, NUM_FMT.EURO),
      captionCell(lastMov ? new Date(lastMov.created_at).toISOString().split('T')[0] : '—'),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ];
  });
  row = tableBody(batch, sheetId, row, detailRows, { columnCount: COL_COUNT });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Secção 3: Relatório Contabilístico ─────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'RELATÓRIO CONTABILÍSTICO',
    hint: 'semanal · mensal · média diária',
    columnCount: COL_COUNT,
  });

  const reportHeaders = ['Métrica', 'Semanal', 'Mensal', 'Média Diária', '', '', '', ''];
  row = tableHeader(batch, sheetId, row, reportHeaders);

  const fmtEuro = v => numCell(v, NUM_FMT.EURO);

  const reportRows = [
    [
      bodyBoldCell('Entradas (€)'),
      fmtEuro(weekly.total_entradas),
      fmtEuro(monthly.total_entradas),
      mutedCell('—'),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ],
    [
      bodyBoldCell('Vendas (€)'),
      fmtEuro(weekly.total_vendas),
      fmtEuro(monthly.total_vendas),
      fmtEuro(daily.avg_daily_sales),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ],
    [
      bodyBoldCell('Lucro Bruto'),
      fmtEuro(weekly.gross_profit),
      fmtEuro(monthly.gross_profit),
      fmtEuro(daily.avg_daily_gross),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ],
    [
      bodyBoldCell('Lucro Líquido'),
      fmtEuro(weekly.net_profit),
      fmtEuro(monthly.net_profit),
      fmtEuro(daily.avg_daily_net),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ],
    [
      bodyBoldCell('Prejuízos'),
      fmtEuro(weekly.total_loss),
      fmtEuro(monthly.total_loss),
      mutedCell('—'),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
      cell('', { bg: COLOR.BG_APP }),
    ],
  ];
  row = tableBody(batch, sheetId, row, reportRows, { columnCount: COL_COUNT });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Secção 4: Ledger v3 ────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'LEDGER V3',
    hint: 'últimos 50 movimentos',
    columnCount: COL_COUNT,
  });
  const LEDGER_HEADERS = [
    'Data',
    'Artigo',
    'Tipo',
    'Qtd',
    'Custo Unit.',
    'Venda Unit.',
    'Lucro/Prejuízo',
    'Responsável',
  ];
  row = tableHeader(batch, sheetId, row, LEDGER_HEADERS);

  const ledgerRows = movements.map(m => {
    const profit = m.gross_profit !== null ? Number(m.gross_profit) : m.total_loss !== null ? -Number(m.total_loss) : 0;
    return [
      bodyCell(new Date(m.created_at).toISOString().split('T')[0]),
      bodyBoldCell(getItemName(m.item_key)),
      movementTypeBadge(m.movement_type),
      numCell(m.quantity, NUM_FMT.INT),
      numCell(m.unit_cost, NUM_FMT.EURO),
      numCell(m.sale_price || 0, NUM_FMT.EURO),
      numCell(profit, NUM_FMT.EURO),
      captionCell(m.created_by || '—'),
    ];
  });
  if (ledgerRows.length) row = tableBody(batch, sheetId, row, ledgerRows, { columnCount: COL_COUNT });
  else {
    const empty = [
      mutedCell('sem movimentos', { align: 'CENTER' }),
      ...Array(COL_COUNT - 1).fill(cell('', { bg: COLOR.BG_APP })),
    ];
    batch.updateCells(sheetId, row, 0, [empty]);
    row += 1;
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Stock v3');
  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncStock };
