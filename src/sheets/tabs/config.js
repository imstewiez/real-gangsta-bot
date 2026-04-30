'use strict';
/**
 * Tab Config · Legendas & Referências — documentação visual do workbook.
 * Conteúdo estático organizado em secções premium.
 */

const { COLOR, cell, bodyCell, bodyBoldCell, captionCell, badgeCell } = require('../theme');
const {
  headerBlock,
  sectionHeader,
  spacer,
  divider,
  tableHeader,
  tableBody,
  footerBlock,
  setWidths,
  autoResizeColumns,
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
    subtitle: 'guia visual — legendas, tiers, cores, métricas, comandos',
    columnCount: COL_COUNT,
  });
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── HIERARQUIA ──────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '👑 HIERARQUIA DA FIRMA',
    hint: 'do topo à base',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Posição', 'Cargo', 'Nível', '', '']);
  const hierarchy = [
    ['1', 'Manda-Chuva', 'topo absoluto'],
    ['2', 'Kingpin', 'braço direito / alta chefia'],
    ['3', 'OG', 'comando operacional alto'],
    ['4', 'Real Gangster', 'oficial'],
    ['5', 'Patrão di Zona', 'gestão do ramo dos Bairristas'],
    ['6', 'Gangster Fodido', 'tier alto · Bairrista'],
    ['7', 'O Gunão', 'tier intermédio · Bairrista'],
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
    title: '🎖️ TIERS DE BAIRRISTA',
    hint: 'níveis de progressão',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Tier', 'Descrição', 'Badge', '', '']);
  const tiers = [
    ['Young Blood', 'entrada na casa — a ganhar terreno', badgeCell('YB', COLOR.GRAPHITE)],
    ['O Gunão', 'estabilizado — entrega consistente', badgeCell('OG', COLOR.RED_BLOOD)],
    ['Gangster Fodido', 'elite — alto output e fiabilidade', badgeCell('GF', COLOR.RED_DEEP)],
    ['Patrão di Zona', 'topo — comando e influência', badgeCell('PDZ', COLOR.GOLD)],
  ];
  row = tableBody(
    batch,
    sheetId,
    row,
    tiers.map(t => pairRow(t[0], t[1], t[2]))
  );
  row = spacer(batch, sheetId, row, COL_COUNT, 'SM');

  // ── RESULTADOS ───────────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🏁 RESULTADOS DE SAÍDA',
    hint: 'estados finais',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Resultado', 'Descrição', 'Badge', '', '']);
  const results = [
    ['Vitória', 'saída bem-sucedida — wins', badgeCell('VITÓRIA', COLOR.GREEN_DEEP)],
    ['Derrota', 'saída com perdas significativas', badgeCell('DERROTA', COLOR.RED_DEEP)],
    ['Empate', 'saída sem vantagem clara', badgeCell('EMPATE', COLOR.YELLOW_DEEP)],
    ['Sem conflito', 'saída sem encontro inimigo', badgeCell('NEUTRO', COLOR.GRAY_DARK)],
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
    title: '🔄 TIPOS DE MOVIMENTO',
    hint: 'inventory_movements.movement_type',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Tipo', 'Descrição', 'Sinal', '', '']);
  const mtypes = [
    ['entrega_bairrista', 'entrega de material feita por bairrista', badgeCell('+', COLOR.GREEN_DEEP)],
    ['entrega_oficial', 'entrega feita por oficial', badgeCell('+', COLOR.GREEN_DEEP)],
    ['venda_bairrista', 'venda na rua', badgeCell('+', COLOR.GOLD)],
    ['fornecimento_org', 'material retirado do stock para saída', badgeCell('−', COLOR.RED_BLOOD)],
    ['devolucao_saida', 'material devolvido após saída', badgeCell('+', COLOR.GRAPHITE)],
    ['perda_saida', 'material perdido em saída', badgeCell('−', COLOR.RED_DEEP)],
    ['consumo_saida', 'material gasto em saída', badgeCell('−', COLOR.YELLOW_DEEP)],
    ['ajuste_manual', 'correção manual do stock', badgeCell('±', COLOR.GRAY_DARK)],
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

  // ── LIFECYCLE DE SAÍDA ────────────────────────────────────────────────────
  row = sectionHeader(batch, sheetId, row, {
    title: '🔄 LIFECYCLE DE SAÍDA',
    hint: 'estados da saída',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Estado', 'Descrição', 'Badge', '', '']);
  const lifecycle = [
    ['aberta', 'inscrições abertas — membros podem entrar', badgeCell('ABERTA', COLOR.GREEN_DEEP)],
    ['em_preparacao', 'a preparar — material a ser emitido', badgeCell('PREP', COLOR.YELLOW_DEEP)],
    ['em_curso', 'na rua — saída activa', badgeCell('CURSO', COLOR.RED_DEEP)],
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
    title: '🎨 LEGENDA DE CORES',
    hint: 'conditional formatting no workbook',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Sinal', 'Significado', 'Exemplo', '', '']);
  const colors = [
    ['Verde', 'métrica positiva · acima da média · bom dia', badgeCell('POSITIVO', COLOR.GREEN_DEEP)],
    ['Amarelo', 'atenção · média · volatilidade', badgeCell('ATENÇÃO', COLOR.YELLOW_DEEP)],
    ['Vermelho', 'negativo · abaixo · acção necessária', badgeCell('NEG.', COLOR.RED_SIGNAL)],
    ['Gold', 'destaque pontual · MVP · 1º lugar · elite', badgeCell('DESTAQUE', COLOR.GOLD)],
    ['Gradient', 'heatmap — min→max colorido auto em tabelas', badgeCell('HEAT', COLOR.RED_DEEP)],
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
    title: '💰 MATERIAL vs DINHEIRO',
    hint: 'duas contabilidades distintas',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Conceito', 'Detalhe', '', '', '']);
  const concepts = [
    ['Material (itens)', 'entregas, vendas, progresso de tier — contam UNIDADES (não €)'],
    ['Lucro de saídas (€)', 'valor económico: fornecido − devolvido − perdido = líquido'],
    ['Promoção YB → OG', '25.000 unidades entregues (auto-promoção)'],
    ['Promoção OG → GF', '50.000 unidades entregues (auto-promoção)'],
    ['Acima de GF', 'promoção manual pela chefia'],
    ['Stock (€)', 'quantidade × valor estimado por item'],
    ['Armazém vs Grupo', 'armazém = chefes · grupo = oficiais — stock separado por casa'],
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
    title: '📊 MÉTRICAS COMPOSTAS',
    hint: 'scores derivados',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Score', 'Fórmula', '', '', '']);
  const scores = [
    ['K/D', 'kills ÷ mortes — eficácia em combate'],
    ['Return Rate', 'valor devolvido ÷ valor recebido — disciplina material'],
    ['Survival Rate', 'saídas sem morrer ÷ saídas totais'],
    ['Win Rate', 'vitórias ÷ saídas concluídas'],
    ['Performance Score', 'kills×10 + (vivo?+5:-5) + (win?+20) — clamped 0-100'],
    ['Discipline Score', 'devolvido ÷ recebido × 100 — clamped 0-100'],
    ['Hybrid Score', 'contribuição×0.4 + performance×0.4 + fiabilidade×0.2'],
    ['MVP', 'maior performance score na saída — se kills>0 ou (vivo + disc≥70%)'],
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
    title: '💬 COMANDOS DISCORD',
    hint: 'slash commands activos',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Comando', 'Descrição', '', '', '']);
  const cmds = [
    ['/versao', 'estado do bot, versão e dados'],
    ['/stock', 'inventário actual (geral ou por item)'],
    ['/catalogo', 'catálogo de material com preços'],
    ['/ficha', 'perfil de um membro (stats, tiers, historial)'],
    ['/movimento', 'cockpit pessoal (material, PvP, progresso)'],
    ['/ranking', 'rankings (semanal / mensal / all-time)'],
    ['/saidas', 'as tuas saídas recentes (ou por ID)'],
    ['/kill', 'registar uma kill'],
    ['/audit', 'logs de auditoria (chefia)'],
    ['/transfer', 'mover material entre armazém e grupo (chefia)'],
    ['/recon', 'reconhecimento de spot — intel antes da saída'],
    ['/war', 'estado de guerra — métricas de combate em tempo real'],
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
    title: '⚙️ SYNC DO WORKBOOK',
    hint: 'como estas tabs são mantidas',
    columnCount: COL_COUNT,
  });
  row = tableHeader(batch, sheetId, row, ['Mecanismo', 'Detalhe', '', '', '']);
  const syncInfo = [
    ['Event-driven', 'cada acção (entrega, saída, kill) dispara sync das tabs afectadas'],
    ['Boot sync', 'ao arrancar, o bot sincroniza todas as 7 tabs automaticamente'],
    ['Reconciliação', 'a cada 15 minutos, tabs paradas ou com erro são re-sincronizadas'],
    ['Trim automático', 'cada sync encolhe a tab ao tamanho necessário (sem rows mortas)'],
    ['Debounce 5s', 'eventos rápidos são agrupados — 1 sync por burst, não 1 por evento'],
    ['Circuit breaker', 'protecção contra falhas — 3 erros consecutivos abrem o circuito por 5 min'],
    ['Batch writer', 'acumula pedidos à Google API e envia em batch (máx 900 requests)'],
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
