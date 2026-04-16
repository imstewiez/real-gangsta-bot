'use strict';
/**
 * Tab Config · Legendas & Referências — documentação visual do workbook.
 * Conteúdo estático organizado em secções premium.
 */

const { COLOR, cell, bodyCell, bodyBoldCell, captionCell, badgeCell } = require('../theme');
const {
  headerBlock, sectionHeader, spacer, divider, tableHeader, tableBody,
  footerBlock, setWidths, autoResizeColumns, autoResizeAll,
} = require('./_common');

const COL_COUNT = 5;

function pairRow(k, v, badge) {
  const cells = [
    bodyBoldCell(k),
    bodyCell(v, { wrap: true }),
    badge || cell('', { bg: COLOR.BG_APP }),
    cell('', { bg: COLOR.BG_APP }),
    cell('', { bg: COLOR.BG_APP }),
  ];
  return cells;
}

async function syncConfig(batch, sheetId) {
  let row = headerBlock(batch, sheetId, {
    title: 'Config · Legendas & Referências',
    subtitle: 'guia visual — legendas, tiers, cores, métricas',
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── TIERS ────────────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🎖️ TIERS DE BAIRRISTA', hint: 'níveis de progressão', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Tier', 'Descrição', 'Badge', '', '']);
  const tiers = [
    ['Young Blood',     'entrada na casa — a ganhar terreno',         badgeCell('YB',  COLOR.GRAPHITE)],
    ['O Gunão',         'estabilizado — entrega consistente',          badgeCell('OG',  COLOR.RED_BLOOD)],
    ['Gangster Fodido', 'elite — alto output e fiabilidade',           badgeCell('GF',  COLOR.RED_DEEP)],
    ['Patrão di Zona',  'topo — comando e influência',                 badgeCell('PDZ', COLOR.GOLD)],
  ];
  row = tableBody(batch, sheetId, row, tiers.map(t => pairRow(t[0], t[1], t[2])));
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── RESULTADOS ───────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🏁 RESULTADOS DE SAÍDA', hint: 'estados finais', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Resultado', 'Descrição', 'Badge', '', '']);
  const results = [
    ['Vitória',     'saída bem-sucedida — wins',                 badgeCell('VITÓRIA', COLOR.GREEN_DEEP)],
    ['Derrota',     'saída com perdas significativas',           badgeCell('DERROTA', COLOR.RED_DEEP)],
    ['Empate',      'saída sem vantagem clara',                  badgeCell('EMPATE',  COLOR.YELLOW_DEEP)],
    ['Sem conflito','saída sem encontro inimigo',                badgeCell('NEUTRO',  COLOR.GRAY_DARK)],
    ['Abortada',    'cancelada antes de completar',              badgeCell('ABORT.',  COLOR.GRAPHITE)],
  ];
  row = tableBody(batch, sheetId, row, results.map(r => pairRow(r[0], r[1], r[2])));
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── MOVIMENTOS ───────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🔄 TIPOS DE MOVIMENTO', hint: 'inventory_movements.movement_type', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Tipo', 'Descrição', 'Sinal', '', '']);
  const mtypes = [
    ['entrega_bairrista',  'entrega de material feita por bairrista',     badgeCell('+',    COLOR.GREEN_DEEP)],
    ['entrega_oficial',    'entrega feita por oficial',                   badgeCell('+',    COLOR.GREEN_DEEP)],
    ['venda_bairrista',    'venda na rua',                                badgeCell('+',    COLOR.GOLD)],
    ['fornecimento_org',   'material retirado do stock para saída',       badgeCell('−',    COLOR.RED_BLOOD)],
    ['devolucao_operacao', 'material devolvido após saída',               badgeCell('+',    COLOR.GRAPHITE)],
    ['perda_operacao',     'material perdido em saída',                   badgeCell('−',    COLOR.RED_DEEP)],
    ['consumo_operacao',   'material gasto em saída',                     badgeCell('−',    COLOR.YELLOW_DEEP)],
    ['ajuste_manual',      'correção manual do stock',                    badgeCell('±',    COLOR.GRAY_DARK)],
    ['saldo_inicial',      'bootstrap inicial do stock',                  badgeCell('+',    COLOR.IRON)],
    ['apreendido',         'material capturado / apreendido',             badgeCell('+',    COLOR.BLUE_DEEP)],
    ['craftado',           'material produzido internamente',             badgeCell('+',    COLOR.GOLD)],
  ];
  row = tableBody(batch, sheetId, row, mtypes.map(m => pairRow(m[0], m[1], m[2])));
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── CORES / CONDITIONAL ──────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🎨 LEGENDA DE CORES', hint: 'conditional formatting no workbook', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Sinal', 'Significado', 'Exemplo', '', '']);
  const colors = [
    ['Verde',        'métrica positiva · acima da média · bom dia',  badgeCell('POSITIVO', COLOR.GREEN_DEEP)],
    ['Amarelo',      'atenção · média · volatilidade',               badgeCell('ATENÇÃO',  COLOR.YELLOW_DEEP)],
    ['Vermelho',     'negativo · abaixo · acção necessária',         badgeCell('NEG.',     COLOR.RED_SIGNAL)],
    ['Gold',         'destaque pontual · MVP · 1º lugar · elite',    badgeCell('DESTAQUE', COLOR.GOLD)],
    ['Gradient',     'heatmap — min→max colorido auto em tabelas',   badgeCell('HEAT',     COLOR.RED_DEEP)],
  ];
  row = tableBody(batch, sheetId, row, colors.map(c => pairRow(c[0], c[1], c[2])));
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── MATERIAL vs DINHEIRO ─────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '💰 MATERIAL vs DINHEIRO', hint: 'duas contabilidades distintas', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Conceito', 'Detalhe', '', '', '']);
  const concepts = [
    ['Material (itens)',      'entregas, vendas, progresso de tier — contam UNIDADES'],
    ['Lucro de saídas (€)',   'valor económico das saídas: fornecido / devolvido / perdido / net'],
    ['Promoção YB → OG',      '25.000 itens entregues'],
    ['Promoção OG → GF',      '50.000 itens entregues'],
    ['Stock (€)',             'quantidade × valor estimado por item'],
  ];
  row = tableBody(batch, sheetId, row, concepts.map(c => pairRow(c[0], c[1])));
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── SCORES ───────────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '📊 MÉTRICAS COMPOSTAS', hint: 'scores derivados', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Score', 'Fórmula', '', '', '']);
  const scores = [
    ['K/D',               'kills ÷ mortes — eficácia em combate'],
    ['Return Rate',       'valor devolvido ÷ valor recebido — disciplina'],
    ['Survival Rate',     'saídas sem morrer ÷ saídas totais'],
    ['Win Rate',          'vitórias ÷ saídas concluídas'],
    ['Performance Score', 'combate + sobrevivência + resultado (0-100)'],
    ['Discipline Score',  'gestão de material durante saída (0-100)'],
    ['Hybrid Score',      'contribuição × 0.4 + performance × 0.4 + fiabilidade × 0.2'],
  ];
  row = tableBody(batch, sheetId, row, scores.map(s => pairRow(s[0], s[1])));
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Sync engine info ─────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '⚙️ SYNC ENGINE', hint: 'como o workbook é mantido', columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Comando', 'Efeito', '', '', '']);
  const cmds = [
    ['/rg-sync-sheets',                       'sincroniza todas as 15 tabs (intervalo auto: 15min)'],
    ['/rg-sync-sheets-tab tab:<key>',         'sincroniza apenas uma tab específica'],
    ['/rg-sync-sheets-rebuild',               'apaga e recria as 15 tabs canónicas (reset visual)'],
    ['/rg-sync-sheets-rebuild purge:True',    'o mesmo + apaga quaisquer tabs não-canónicas'],
    ['Trim automático',                       'cada sync encolhe a tab ao tamanho necessário (cleanup engine)'],
    ['Design system',                         'theme.js + _common.js — consistência premium'],
  ];
  row = tableBody(batch, sheetId, row, cmds.map(c => pairRow(c[0], c[1])));

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Config');

  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncConfig };
