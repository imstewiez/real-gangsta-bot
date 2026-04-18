'use strict';
/**
 * Tab Stock — inventário + ledger de movimentos numa folha.
 *   Secção 1: Panorama stock (itens, qtd, valor, críticos)
 *   Secção 2: Breakdown por categoria
 *   Secção 3: Inventário detalhado (agrupado por categoria, com subtotais)
 *   Secção 4: Ledger de movimentos (últimos 500)
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
  conditionalGreaterThan,
  conditionalLessThan,
} = require('../theme');
const {
  headerBlock,
  sectionHeader,
  spacer,
  divider,
  kpiStrip,
  tableHeader,
  tableBody,
  totalRow,
  footerBlock,
  autoResizeColumns,
  autoResizeAll,
  applyRowBanding,
} = require('./_common');
const { getInventoryFull, getStockByCategory, getMovementsFull } = require('../queries');

const MOVS_HEADERS = [
  'Data/Hora',
  'Tipo',
  'Casa',
  'Item',
  'Categoria',
  'Qtd',
  'Valor Unit.',
  'Valor Total',
  'Actor',
  'Nome',
  'Role',
  'Tier',
  'Saída',
  'Spot',
  'Contexto',
  'Notas',
];
const INV_HEADERS = [
  'Item',
  'Categoria',
  'Un.',
  'Qtd Armazém',
  'Qtd Grupo',
  'Qtd Total',
  'Valor Unit.',
  'Valor Total',
  'Entradas',
  'Saídas',
  'Última Mov.',
  'Estado',
];
const COL_COUNT = MOVS_HEADERS.length; // 16

function casaBadge(loc) {
  if (loc === 'armazem') return badgeCell('ARMAZÉM', COLOR.RED_DEEP);
  if (loc === 'grupo') return badgeCell('GRUPO', COLOR.GRAPHITE);
  return mutedCell('—', { align: 'CENTER' });
}

// Display names por categoria (chave DB → rótulo humano premium)
const CAT_DISPLAY = {
  armas: 'Armas',
  armas_fogo: 'Armas de Fogo',
  armas_brancas: 'Armas Brancas',
  municoes: 'Munições',
  acessorios: 'Acessórios',
  equipamento: 'Equipamento',
  metais: 'Metais',
  sucata_industria: 'Sucata & Indústria',
  reciclagem: 'Reciclagem',
  componentes: 'Componentes',
  madeiras: 'Madeiras',
  quimicos: 'Químicos',
  electronica: 'Electrónica',
  droga: 'Droga',
  dinheiro: 'Dinheiro',
  comida: 'Comida',
  comida_pesca: 'Comida & Pesca',
  pesca: 'Pesca',
  texteis: 'Têxteis',
  utilidade: 'Utilidade',
  outros: 'Outros',
};
function catLabel(cat) {
  return (CAT_DISPLAY[cat] || cat || '—').toUpperCase();
}

const MOV_PILL = {
  entrega_bairrista: { label: 'ENTREGA', bg: COLOR.GREEN_DEEP },
  entrega_oficial: { label: 'ENTR.OFIC', bg: COLOR.GREEN_DEEP },
  venda_bairrista: { label: 'VENDA', bg: COLOR.GOLD },
  ajuste_manual: { label: 'AJUSTE', bg: COLOR.GRAY_DARK },
  fornecimento_org: { label: 'FORNECIDO', bg: COLOR.RED_BLOOD },
  devolucao_saida: { label: 'DEVOL.', bg: COLOR.GRAPHITE },
  perda_saida: { label: 'PERDA', bg: COLOR.RED_DEEP },
  consumo_saida: { label: 'CONSUMO', bg: COLOR.YELLOW_DEEP },
  saldo_inicial: { label: 'SALDO INIC', bg: COLOR.IRON },
  apreendido: { label: 'APREEND.', bg: COLOR.BLUE_DEEP },
  craftado: { label: 'CRAFT', bg: COLOR.GOLD },
};

function typeBadge(type) {
  const m = MOV_PILL[type];
  return m ? badgeCell(m.label, m.bg) : bodyCell(type || '—');
}

function stateBadge(balance, item) {
  // Items com alert_enabled=false não mostram state badge (jóias, armas
  // estragadas, items de hobby — não fazem sentido monitorar esgotamento).
  if (item && item.alert_enabled === false) return mutedCell('—', { align: 'CENTER' });

  const b = Number(balance || 0);
  const threshold = item?.alert_threshold;

  // Se tem threshold explícito, compara contra ele (mais preciso).
  if (threshold && threshold > 0) {
    if (b <= 0) return badgeCell('ESGOTADO', COLOR.RED_DEEP);
    if (b < threshold * 0.2) return badgeCell('CRÍTICO', COLOR.RED_BLOOD);
    if (b < threshold) return badgeCell('BAIXO', COLOR.YELLOW_DEEP);
    if (b >= threshold * 3) return badgeCell('ALTO', COLOR.GREEN_DEEP);
    return badgeCell('NORMAL', COLOR.GRAPHITE);
  }

  // Fallback: thresholds genéricos legacy.
  if (b <= 0) return badgeCell('ESGOTADO', COLOR.RED_DEEP);
  if (b <= 3) return badgeCell('CRÍTICO', COLOR.RED_BLOOD);
  if (b <= 10) return badgeCell('BAIXO', COLOR.YELLOW_DEEP);
  if (b >= 100) return badgeCell('ALTO', COLOR.GREEN_DEEP);
  return badgeCell('NORMAL', COLOR.GRAPHITE);
}

function fmtDT(d) {
  if (!d) return '—';
  try {
    return new Date(d).toISOString().replace('T', ' ').slice(0, 16);
  } catch {
    return String(d);
  }
}

async function syncStock(batch, sheetId) {
  const [inv, byCat, movs] = await Promise.all([getInventoryFull(), getStockByCategory(), getMovementsFull(500)]);

  const totalValue = inv.reduce((a, r) => a + Number(r.value_total || 0), 0);
  const totalQty = inv.reduce((a, r) => a + Number(r.balance || 0), 0);
  const qtyArmazem = inv.reduce((a, r) => a + Number(r.balance_armazem || 0), 0);
  const qtyGrupo = inv.reduce((a, r) => a + Number(r.balance_grupo || 0), 0);
  const valueArmazem = inv.reduce((a, r) => a + Number(r.value_armazem || 0), 0);
  const valueGrupo = inv.reduce((a, r) => a + Number(r.value_grupo || 0), 0);
  const critical = inv.filter(r => (r.balance || 0) <= 3).length;
  const zeros = inv.filter(r => (r.balance || 0) <= 0).length;
  const totalIn = movs
    .filter(r => ['entrega_bairrista', 'entrega_oficial'].includes(r.movement_type))
    .reduce((a, r) => a + Number(r.total_value || 0), 0);
  const totalSales = movs
    .filter(r => r.movement_type === 'venda_bairrista')
    .reduce((a, r) => a + Number(r.total_value || 0), 0);
  const totalLost = movs
    .filter(r => r.movement_type === 'perda_saida')
    .reduce((a, r) => a + Number(r.total_value || 0), 0);

  // Grow é feito pelo syncEngine via pre-flight API separada (PRE_SYNC_MIN_ROWS).
  // Não chamar growSheet aqui — encolheria a grid pre-flight.

  let row = headerBlock(batch, sheetId, {
    title: 'Stock · Inventário & Movimentos',
    subtitle: `${inv.length} itens · ${critical} críticos · ${qtyArmazem} un. armazém + ${qtyGrupo} un. grupo`,
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Panorama global ──────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '📦 PANORAMA DO STOCK',
    hint: 'totais consolidados',
    columnCount: COL_COUNT,
  });
  row = kpiStrip(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Itens',
        value: inv.length,
        numberFormat: NUM_FMT.INT,
        delta: `${byCat.length} categorias`,
        deltaDirection: 'flat',
      },
      {
        label: 'Quantidade',
        value: totalQty,
        numberFormat: NUM_FMT.INT,
        delta: `${qtyArmazem} armazém · ${qtyGrupo} grupo`,
        deltaDirection: 'flat',
      },
      {
        label: 'Valor Stock',
        value: totalValue,
        numberFormat: NUM_FMT.EURO,
        delta: `média ${(totalValue / Math.max(inv.length, 1)).toFixed(0)} €/item`,
        deltaDirection: 'flat',
      },
      {
        label: 'Críticos',
        value: critical,
        numberFormat: NUM_FMT.INT,
        delta: zeros > 0 ? `${zeros} esgotados` : 'nada esgotado',
        deltaDirection: critical > 0 ? 'down' : 'up',
      },
    ],
    COL_COUNT
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Por casa ─────────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🏠 STOCK POR CASA',
    hint: 'armazém (chefes) vs grupo (oficiais)',
    columnCount: COL_COUNT,
  });
  row = kpiStrip(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Armazém Qtd',
        value: qtyArmazem,
        numberFormat: NUM_FMT.INT,
        delta: 'só chefes',
        deltaDirection: 'flat',
      },
      {
        label: 'Armazém Valor',
        value: valueArmazem,
        numberFormat: NUM_FMT.EURO,
        delta: `${((valueArmazem / Math.max(totalValue, 1)) * 100).toFixed(0)}% do total`,
        deltaDirection: 'flat',
      },
      { label: 'Grupo Qtd', value: qtyGrupo, numberFormat: NUM_FMT.INT, delta: 'oficiais', deltaDirection: 'flat' },
      {
        label: 'Grupo Valor',
        value: valueGrupo,
        numberFormat: NUM_FMT.EURO,
        delta: `${((valueGrupo / Math.max(totalValue, 1)) * 100).toFixed(0)}% do total`,
        deltaDirection: 'flat',
      },
    ],
    COL_COUNT
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');
  row = kpiStrip(
    batch,
    sheetId,
    row,
    [
      {
        label: 'Entradas €',
        value: totalIn,
        numberFormat: NUM_FMT.EURO,
        delta: 'entregas recentes',
        deltaDirection: 'up',
      },
      {
        label: 'Vendas €',
        value: totalSales,
        numberFormat: NUM_FMT.EURO,
        delta: 'vendas recentes',
        deltaDirection: 'up',
      },
      {
        label: 'Perdido €',
        value: totalLost,
        numberFormat: NUM_FMT.EURO,
        delta: 'em operações',
        deltaDirection: totalLost > 0 ? 'down' : 'flat',
      },
      {
        label: 'Movimentos',
        value: movs.length,
        numberFormat: NUM_FMT.INT,
        delta: 'últimos registos',
        deltaDirection: 'flat',
      },
    ],
    COL_COUNT
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Breakdown por categoria ──────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '📊 BREAKDOWN POR CATEGORIA',
    hint: 'qtd + valor por categoria',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, [
    'Categoria',
    'Nº Itens',
    'Qtd Armazém',
    'Qtd Grupo',
    'Qtd Total',
    'Valor (€)',
    '% do Valor',
    ...Array(COL_COUNT - 7).fill(''),
  ]);
  const catRows = byCat.map(c => {
    const pct = totalValue > 0 ? Number(c.total_value) / totalValue : 0;
    const cells = [
      bodyBoldCell(CAT_DISPLAY[c.category] || c.category || '—'),
      numCell(c.items_count, NUM_FMT.INT),
      numCell(c.qty_armazem || 0, NUM_FMT.INT),
      numCell(c.qty_grupo || 0, NUM_FMT.INT),
      numCell(c.total_qty, NUM_FMT.INT),
      numCell(Number(c.total_value), NUM_FMT.EURO),
      numCell(pct, NUM_FMT.PCT),
    ];
    while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
    return cells;
  });
  row = tableBody(batch, sheetId, row, catRows);

  row = totalRow(batch, sheetId, row, {
    label: 'TOTAL',
    columnCount: COL_COUNT,
    values: [
      { col: 1, value: inv.length, numberFormat: NUM_FMT.INT },
      { col: 2, value: qtyArmazem, numberFormat: NUM_FMT.INT },
      { col: 3, value: qtyGrupo, numberFormat: NUM_FMT.INT },
      { col: 4, value: totalQty, numberFormat: NUM_FMT.INT },
      { col: 5, value: totalValue, numberFormat: NUM_FMT.EURO },
      { col: 6, value: 1, numberFormat: NUM_FMT.PCT },
    ],
  });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Inventário detalhado agrupado por categoria ──────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '📋 INVENTÁRIO DETALHADO',
    hint: 'agrupado por categoria',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, INV_HEADERS.concat(Array(COL_COUNT - INV_HEADERS.length).fill('')));
  batch.freezeRows(sheetId, row);
  const invFirstRow = row;

  const groups = new Map();
  for (const it of inv) {
    const cat = it.category || '—';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(it);
  }
  const sortedCats = Array.from(groups.keys()).sort((a, b) => {
    const va = groups.get(a).reduce((s, i) => s + Number(i.value_total || 0), 0);
    const vb = groups.get(b).reduce((s, i) => s + Number(i.value_total || 0), 0);
    return vb - va;
  });

  let zebraIndex = 0;
  for (const cat of sortedCats) {
    const items = groups.get(cat);
    // Cabeçalho de categoria
    const catCells = [
      bodyBoldCell(catLabel(cat), { bg: COLOR.BG_BLOCK, align: 'LEFT' }),
      ...Array(COL_COUNT - 1).fill(cell('', { bg: COLOR.BG_BLOCK })),
    ];
    batch.updateCells(sheetId, row, 0, [catCells]);
    batch.setRowHeight(sheetId, row, 22);
    batch.mergeCells(sheetId, row, row + 1, 0, COL_COUNT);
    row += 1;

    for (const i of items) {
      const cells = [
        bodyCell(i.name),
        captionCell(i.category || '—'),
        captionCell(i.unit || 'un'),
        numCell(i.balance_armazem || 0, NUM_FMT.INT),
        numCell(i.balance_grupo || 0, NUM_FMT.INT),
        numCell(i.balance, NUM_FMT.INT),
        numCell(Number(i.estimated_value), NUM_FMT.EURO_DEC),
        numCell(Number(i.value_total), NUM_FMT.EURO),
        numCell(i.total_in || 0, NUM_FMT.INT),
        numCell(i.total_out || 0, NUM_FMT.INT),
        captionCell(fmtDT(i.last_movement)),
        stateBadge(i.balance, i),
      ];
      while (cells.length < COL_COUNT) cells.push(cell('', { bg: COLOR.BG_APP }));
      if (zebraIndex % 2 === 1) {
        for (const c of cells) {
          if (c.userEnteredFormat && c.userEnteredFormat.backgroundColor) {
            const bg = c.userEnteredFormat.backgroundColor;
            if (Math.abs(bg.red - COLOR.BG_APP.red) < 0.02) {
              c.userEnteredFormat.backgroundColor = COLOR.BG_BLOCK;
            }
          }
        }
      }
      batch.updateCells(sheetId, row, 0, [cells]);
      batch.setRowHeight(sheetId, row, 22);
      row += 1;
      zebraIndex += 1;
    }

    // Subtotal — colunas: Item / Cat / Un / QtdAr / QtdGr / QtdTotal / VUnit / VTotal / Entradas / Saídas / UltMov / Estado
    const subQtyAr = items.reduce((a, i) => a + Number(i.balance_armazem || 0), 0);
    const subQtyGr = items.reduce((a, i) => a + Number(i.balance_grupo || 0), 0);
    const subQty = items.reduce((a, i) => a + Number(i.balance || 0), 0);
    const subVal = items.reduce((a, i) => a + Number(i.value_total || 0), 0);
    const boldFont = { fontFamily: 'Inter', fontSize: 10, bold: true, foregroundColor: COLOR.WHITE };
    const subCells = [
      bodyBoldCell(`⎯ subtotal ${CAT_DISPLAY[cat] || cat}`, { bg: COLOR.BG_BLOCK_ALT, align: 'RIGHT' }),
      cell('', { bg: COLOR.BG_BLOCK_ALT }),
      cell('', { bg: COLOR.BG_BLOCK_ALT }),
      numCell(subQtyAr, NUM_FMT.INT, { bg: COLOR.BG_BLOCK_ALT, font: boldFont }),
      numCell(subQtyGr, NUM_FMT.INT, { bg: COLOR.BG_BLOCK_ALT, font: boldFont }),
      numCell(subQty, NUM_FMT.INT, { bg: COLOR.BG_BLOCK_ALT, font: boldFont }),
      cell('', { bg: COLOR.BG_BLOCK_ALT }),
      numCell(subVal, NUM_FMT.EURO, { bg: COLOR.BG_BLOCK_ALT, font: boldFont }),
      ...Array(COL_COUNT - 8).fill(cell('', { bg: COLOR.BG_BLOCK_ALT })),
    ];
    batch.updateCells(sheetId, row, 0, [subCells]);
    batch.setRowHeight(sheetId, row, 22);
    row += 1;
    zebraIndex = 0;
  }

  // Grand total do inventário
  row = totalRow(batch, sheetId, row, {
    label: 'GRAND TOTAL',
    columnCount: COL_COUNT,
    values: [
      { col: 3, value: qtyArmazem, numberFormat: NUM_FMT.INT },
      { col: 4, value: qtyGrupo, numberFormat: NUM_FMT.INT },
      { col: 5, value: totalQty, numberFormat: NUM_FMT.INT },
      { col: 7, value: totalValue, numberFormat: NUM_FMT.EURO },
    ],
  });

  if (inv.length) {
    // Heatmap em Qtd Total (col 5)
    batch.addRule(conditionalLessThan(sheetId, invFirstRow, 5, row, 6, 4, COLOR.RED_SIGNAL_SOFT));
    batch.addRule(conditionalGreaterThan(sheetId, invFirstRow, 5, row, 6, 50, COLOR.GREEN_SOFT));
  }

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── Ledger de movimentos ─────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🔄 LEDGER DE MOVIMENTOS',
    hint: `últimos ${movs.length} · filtros activos`,
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, MOVS_HEADERS);
  const movRows = movs.map(m => [
    bodyCell(fmtDT(m.created_at)),
    typeBadge(m.movement_type),
    casaBadge(m.location),
    bodyBoldCell(m.item),
    captionCell(m.categoria || '—'),
    numCell(m.quantity, NUM_FMT.INT),
    numCell(Number(m.unit_value), NUM_FMT.EURO_DEC),
    numCell(Number(m.total_value), NUM_FMT.EURO),
    captionCell(m.actor_id || '—'),
    bodyCell(m.member_name || '—'),
    captionCell(m.member_role || '—'),
    captionCell(m.member_tier || '—'),
    m.saida_id ? bodyCell(`#${m.saida_id}`) : mutedCell('—'),
    bodyCell(m.saida_spot || '—'),
    captionCell(m.context || '—'),
    bodyCell(m.notes || '', { wrap: true }),
  ]);
  row = tableBody(batch, sheetId, row, movRows, { basicFilter: true, columnCount: COL_COUNT });

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Stock');
  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncStock };
