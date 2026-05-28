'use strict';
/**
 * Tab Config · Legendas & Referencias — documentacao visual do workbook.
 * Conteudo estatico organizado em seccoes premium.
 * Sem emojis nas celulas (politica do design system v2).
 */

const { COLOR, cell, bodyCell, bodyBoldCell, badgeCell } = require('../theme');
const {
  headerBlock,
  sectionHeader,
  spacer,
  divider,
  tableHeader,
  tableBody,
  footerBlock,
  autoResizeAll,
  gangTitle,
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
    title: gangTitle('Config'),
    subtitle: 'guia visual — legendas, tiers, cores, metricas, comandos',
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── HIERARQUIA ──────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'HIERARQUIA DA BALLAS GANG',
    hint: 'do topo a base',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Posicao', 'Cargo', 'Nivel', '', '']);
  const hierarchy = [
    ['1', 'Manda-Chuva', 'topo absoluto'],
    ['2', 'Kingpin', 'braco direito / alta chefia'],
    ['3', 'OG', 'comando operacional alto'],
    ['4', 'Real Gangster', 'oficial'],
    ['5', 'Patrao di Zona', 'gestao do ramo dos Bairristas'],
    ['6', 'Gangster Fodido', 'tier alto · Bairrista'],
    ['7', 'O Gunao', 'tier intermedio · Bairrista'],
    ['8', 'Young Blood', 'entry · Bairrista'],
    ['9', 'Bairristas', 'role base do ramo'],
    ['10', 'Tropinhas do Guetto', 'recrutamento'],
    ['11', 'Patrulha Pata', 'base'],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    hierarchy.map(h => pairRow(h[0] + '. ' + h[1], h[2]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── TIERS ────────────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'TIERS DE BAIRRISTA',
    hint: 'niveis de progressao · baseado em XP',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Tier', 'Descricao', 'Badge', '', '']);
  const tiers = [
    ['Young Blood', 'entrada na casa — a ganhar terreno', badgeCell('YB', COLOR.GRAPHITE)],
    ['O Gunao', 'estabilizado — entrega consistente', badgeCell('OG', COLOR.RED_BLOOD)],
    ['Gangster Fodido', 'elite — alto output e fiabilidade', badgeCell('GF', COLOR.RED_DEEP)],
    ['Patrao di Zona', 'topo — comando e influencia', badgeCell('PDZ', COLOR.GOLD)],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    tiers.map(t => pairRow(t[0], t[1], t[2]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── PROMOCOES ────────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'SISTEMA DE PROMOCOES (XP)',
    hint: 'auto-promocao baseada em pontos de material',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Transicao', 'Threshold', 'Detalhe', '', '']);
  const promos = [
    [
      'Young Blood -> O Gunao',
      '50.000 XP',
      'molde/corpo/print = 4pts · plastico/cobre/polvora/pecas = 3pts · sucata/ferro/telemovel/carvao/borracha = 2pts · resto = 1pt',
    ],
    ['O Gunao -> Gangster Fodido', '100.000 XP', 'acumulativo — so conta material entregue/vendido valido'],
    ['Acima de GF', 'manual', 'promocao pela chefia — nao e automatica'],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    promos.map(p => pairRow(p[0], p[1] + ' — ' + p[2]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── RESULTADOS ───────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'RESULTADOS DE SAIDA',
    hint: 'estados finais',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Resultado', 'Descricao', 'Badge', '', '']);
  const results = [
    ['Vitoria', 'saida bem-sucedida — wins', badgeCell('VITORIA', COLOR.GREEN_DEEP)],
    ['Derrota', 'saida com perdas significativas', badgeCell('DERROTA', COLOR.RED_DEEP)],
    ['Empate', 'saida sem vantagem clara', badgeCell('EMPATE', COLOR.YELLOW_DEEP)],
    ['Sem conflito', 'saida sem encontro inimigo', badgeCell('NEUTRO', COLOR.GRAY_DARK)],
    ['Abortada', 'cancelada antes de completar', badgeCell('ABORT.', COLOR.GRAPHITE)],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    results.map(r => pairRow(r[0], r[1], r[2]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── MOVIMENTOS ───────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'TIPOS DE MOVIMENTO',
    hint: 'inventory_movements.movement_type',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Tipo', 'Descricao', 'Sinal', '', '']);
  const mtypes = [
    ['entrega_bairrista', 'entrega de material feita por bairrista', badgeCell('+', COLOR.GREEN_DEEP)],
    ['entrega_oficial', 'entrega feita por oficial', badgeCell('+', COLOR.GREEN_DEEP)],
    ['venda_bairrista', 'venda na rua', badgeCell('+', COLOR.GOLD)],
    ['fornecimento_org', 'material retirado do stock para saida', badgeCell('-', COLOR.RED_BLOOD)],
    ['devolucao_saida', 'material devolvido apos saida', badgeCell('+', COLOR.GRAPHITE)],
    ['perda_saida', 'material perdido em saida', badgeCell('-', COLOR.RED_DEEP)],
    ['consumo_saida', 'material gasto em saida', badgeCell('-', COLOR.YELLOW_DEEP)],
    ['ajuste_manual', 'correcao manual do stock', badgeCell('+-', COLOR.GRAY_DARK)],
    ['saldo_inicial', 'bootstrap inicial do stock', badgeCell('+', COLOR.IRON)],
    ['apreendido', 'material capturado / apreendido', badgeCell('+', COLOR.BLUE_DEEP)],
    ['craftado', 'material produzido internamente', badgeCell('+', COLOR.GOLD)],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    mtypes.map(m => pairRow(m[0], m[1], m[2]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = divider(batch, sheetId, row, COL_COUNT, 'accent');

  // ── LIFECYCLE DE SAIDA ────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'LIFECYCLE DE SAIDA',
    hint: 'estados da saida',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Estado', 'Descricao', 'Badge', '', '']);
  const lifecycle = [
    ['criada', 'inscricoes abertas — membros podem entrar', badgeCell('CRIADA', COLOR.GREEN_DEEP)],
    ['trancagem', 'inscricoes fechadas — selecao de equipa', badgeCell('TRANCAGEM', COLOR.YELLOW_DEEP)],
    ['em_preparacao', 'a preparar — material a ser emitido', badgeCell('PREP', COLOR.YELLOW_DEEP)],
    ['em_curso', 'na rua — saida activa', badgeCell('CURSO', COLOR.RED_DEEP)],
    ['em_liquidacao', 'a fechar — participantes a submeter resultados', badgeCell('LIQUID.', COLOR.GOLD)],
    ['concluida', 'fechada — resultados e stats calculados', badgeCell('FECHADA', COLOR.GRAPHITE)],
    ['cancelada', 'cancelada antes de completar', badgeCell('CANCEL', COLOR.GRAY_DARK)],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    lifecycle.map(l => pairRow(l[0], l[1], l[2]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── CORES / CONDITIONAL ──────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'LEGENDA DE CORES',
    hint: 'conditional formatting no workbook',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Sinal', 'Significado', 'Exemplo', '', '']);
  const colors = [
    ['Verde', 'metrica positiva · acima da media · bom dia', badgeCell('POSITIVO', COLOR.GREEN_DEEP)],
    ['Amarelo', 'atencao · media · volatilidade', badgeCell('ATENCAO', COLOR.YELLOW_DEEP)],
    ['Vermelho', 'negativo · abaixo · accao necessaria', badgeCell('NEG.', COLOR.RED_SIGNAL)],
    ['Gold', 'destaque pontual · MVP · 1o lugar · elite', badgeCell('DESTAQUE', COLOR.GOLD)],
    ['Gradient', 'heatmap — min->max colorido auto em tabelas', badgeCell('HEAT', COLOR.RED_DEEP)],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    colors.map(c => pairRow(c[0], c[1], c[2]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── MATERIAL vs DINHEIRO ─────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'MATERIAL vs DINHEIRO',
    hint: 'duas contabilidades distintas',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Conceito', 'Detalhe', '', '', '']);
  const concepts = [
    ['Material (XP)', 'entregas, vendas, progresso de tier — contam em PONTOS DE XP (nao €)'],
    ['Lucro de saidas (€)', 'valor economico: fornecido - devolvido - perdido = liquido'],
    ['Stock (€)', 'quantidade x valor estimado por item'],
    ['Armazem vs Grupo', 'armazem = chefes · grupo = oficiais — stock separado por casa'],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    concepts.map(c => pairRow(c[0], c[1]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── SCORES ───────────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'METRICAS COMPOSTAS',
    hint: 'scores derivados',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Score', 'Formula', '', '', '']);
  const scores = [
    ['K/D', 'kills / mortes — eficacia em combate'],
    ['Return Rate', 'valor devolvido / valor recebido — disciplina material'],
    ['Survival Rate', 'saidas sem morrer / saidas totais'],
    ['Win Rate', 'vitorias / saidas concluidas'],
    ['Performance Score', 'killsx10 + (vivo?+5:-5) + (win?+20) — clamped 0-100'],
    ['Discipline Score', 'devolvido / recebido x 100 — clamped 0-100'],
    ['Hybrid Score', 'contribuicaox0.4 + performancex0.4 + fiabilidadex0.2'],
    ['MVP', 'maior performance score na saida — se kills>0 ou (vivo + disc>=70%)'],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    scores.map(s => pairRow(s[0], s[1]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Comandos Discord ─────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'COMANDOS DISCORD',
    hint: 'slash commands activos',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Comando', 'Descricao', '', '', '']);
  const cmds = [
    ['/versao', 'estado do bot, versao e dados'],
    ['/stock', 'inventario actual (geral ou por item)'],
    ['/catalogo', 'catalogo de material com precos'],
    ['/ficha', 'perfil de um membro (stats, tiers, historial)'],
    ['/movimento', 'cockpit pessoal (material, PvP, progresso)'],
    ['/ranking', 'rankings (semanal / mensal / all-time)'],
    ['/saidas', 'as tuas saidas recentes (ou por ID)'],
    ['/kill', 'registar uma kill'],
    ['/audit', 'logs de auditoria (chefia)'],
    ['/transfer', 'mover material entre armazem e grupo (chefia)'],
    ['/recon', 'reconhecimento de spot — intel antes da saida'],
    ['/war', 'estado de guerra — metricas de combate em tempo real'],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    cmds.map(c => pairRow(c[0], c[1]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── Sync do workbook ────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: 'SYNC DO WORKBOOK',
    hint: 'como estas tabs sao mantidas',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Mecanismo', 'Detalhe', '', '', '']);
  const syncInfo = [
    ['Event-driven', 'cada accao (entrega, saida, kill) dispara sync das tabs afectadas'],
    ['Boot sync', 'ao arrancar, o bot sincroniza todas as 7 tabs automaticamente'],
    ['Reconciliacao', 'a cada 15 minutos, tabs paradas ou com erro sao re-sincronizadas'],
    ['Trim automatico', 'cada sync encolhe a tab ao tamanho necessario (sem rows mortas)'],
    ['Debounce 5s', 'eventos rapidos sao agrupados — 1 sync por burst, nao 1 por evento'],
    ['Circuit breaker', 'proteccao contra falhas — 3 erros consecutivos abrem o circuito por 5 min'],
    ['Batch writer', 'acumula pedidos a Google API e envia em batch (max 900 requests)'],
    ['Design system', 'theme.js + _common.js — paleta, tipografia e componentes centralizados'],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    syncInfo.map(s => pairRow(s[0], s[1]))
  );

  row = spacer(batch, sheetId, row, COL_COUNT, 'MD');
  row = footerBlock(batch, sheetId, row, COL_COUNT, 0, 'Config');

  autoResizeAll(batch, sheetId, row, COL_COUNT);
  return { lastRow: row, lastCol: COL_COUNT };
}

module.exports = { syncConfig };
