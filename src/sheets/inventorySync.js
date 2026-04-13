'use strict';
const { writeRange, clearRange } = require('./googleAuth');
const { inventoryRepo, memberRepo, operationRepo, rankingRepo } = require('../repositories');
const { log, warn } = require('../logger');
const CONFIG = require('../config');
const { formatTierName, getMemberMaterialValue } = require('../members/autoPromotionEngine');
const { weekBounds } = require('../util');

// Tab names matching the premium sheet layout
const TABS = {
  RESUMO:     '📊 Resumo Geral',
  MEMBROS:    '👥 Membros',
  STOCK:      '📦 Stock Atual',
  MOVIMENTOS: '📋 Movimentos',
  OPERACOES:  '⚔️ Operações',
  TOP:        '🏆 Top Semanal',
  CATALOGO:   '🏷️ Catálogo',
};

async function syncAll() {
  const sheetId = CONFIG.SPREADSHEET_ID;
  if (!sheetId) { warn('[SHEETS] SPREADSHEET_ID não configurado.'); return; }

  log('[SHEETS] A exportar dados para Google Sheets...');

  await Promise.all([
    syncResumo(sheetId),
    syncStock(sheetId),
    syncMovements(sheetId),
    syncMembers(sheetId),
    syncOperations(sheetId),
    syncTopSemanal(sheetId),
    syncCatalogo(sheetId),
  ]);

  log('[SHEETS] Export concluído.');
}

async function syncResumo(sheetId) {
  try {
    const counts = await memberRepo.countByRole();
    const stock = await inventoryRepo.getStock();
    const totalStockValue = stock.reduce((a, s) => a + (parseInt(s.balance || 0) * parseFloat(s.estimated_value || 0)), 0);

    const { start, end } = weekBounds();
    const weekMovements = await inventoryRepo.getWeeklyMovements(start, end);
    const weekDeliveries = weekMovements.reduce((a, m) => a + parseInt(m.deliveries || 0), 0);
    const weekSales = weekMovements.reduce((a, m) => a + parseInt(m.sales || 0), 0);

    const ops = await operationRepo.findRecent(100);
    const weekOps = ops.filter(o => new Date(o.date) >= start && new Date(o.date) <= end);
    const completedOps = ops.filter(o => o.status === 'concluida');

    // Top 3
    const top3 = weekMovements.slice(0, 3);

    const rows = [
      ['\uD83E\uDE78 REAL GANGSTA — RESUMO GERAL \uD83E\uDE78'],
      [],
      ['', '\uD83D\uDCCA  VISÃO GERAL', '', ''],
      ['', 'Total Membros Ativos', String((counts.morador || 0) + (counts.oficial || 0) + (counts.chefia || 0)), ''],
      ['', 'Moradores', String(counts.morador || 0), ''],
      ['', 'Oficiais', String(counts.oficial || 0), ''],
      ['', 'Chefia', String(counts.chefia || counts.chefe_moradores || 0), ''],
      [],
      ['', '\uD83D\uDCE6  INVENTÁRIO', '', ''],
      ['', 'Itens em Stock', String(stock.filter(s => parseInt(s.balance || 0) > 0).length), ''],
      ['', 'Valor Total do Stock', `${totalStockValue.toLocaleString('pt-PT')}\u20AC`, ''],
      ['', 'Entregas esta Semana', String(weekDeliveries), ''],
      ['', 'Vendas esta Semana', String(weekSales), ''],
      [],
      ['', '\u2694\uFE0F  OPERAÇÕES', '', ''],
      ['', 'Operações esta Semana', String(weekOps.length), ''],
      ['', 'Operações Concluídas (total)', String(completedOps.length), ''],
      [],
      ['', '\uD83C\uDFC6  TOP CONTRIBUINTES DA SEMANA', '', ''],
      ['', '\uD83E\uDD47 1º Lugar', top3[0]?.display_name || '\u2014', top3[0] ? `${parseFloat(top3[0].weighted_value).toLocaleString('pt-PT')}\u20AC` : ''],
      ['', '\uD83E\uDD48 2º Lugar', top3[1]?.display_name || '\u2014', top3[1] ? `${parseFloat(top3[1].weighted_value).toLocaleString('pt-PT')}\u20AC` : ''],
      ['', '\uD83E\uDD49 3º Lugar', top3[2]?.display_name || '\u2014', top3[2] ? `${parseFloat(top3[2].weighted_value).toLocaleString('pt-PT')}\u20AC` : ''],
      [],
      ['', '\uD83D\uDCC8  PROMOÇÕES AUTOMÁTICAS', '', ''],
      ['', 'Young Blood \u2192 O Gunão', `${CONFIG.PROMO_YOUNG_BLOOD_TO_GUNAO.toLocaleString('pt-PT')}\u20AC`, 'meta de material'],
      ['', 'O Gunão \u2192 Gangster Fodido', `${CONFIG.PROMO_GUNAO_TO_GANGSTER_FODIDO.toLocaleString('pt-PT')}\u20AC`, 'meta de material'],
    ];

    await clearRange(sheetId, `${TABS.RESUMO}!A1:D30`);
    await writeRange(sheetId, `${TABS.RESUMO}!A1`, rows);
    log(`[SHEETS] Resumo Geral atualizado.`);
  } catch (e) {
    warn(`[SHEETS] Falha no resumo: ${e.message}`);
  }
}

async function syncStock(sheetId) {
  try {
    const stock = await inventoryRepo.getStock();
    const header = ['#', '\uD83D\uDCE6 Item', '\uD83C\uDFF7\uFE0F Categoria', '\uD83D\uDCCF Unidade', '\uD83D\uDCB0 Preço (\u20AC)', '\uD83D\uDCCA Stock', '\uD83D\uDC8E Valor Total (\u20AC)'];
    const rows = stock.map((s, i) => [
      i + 1, s.name, s.category, s.unit,
      parseFloat(s.estimated_value || 0),
      parseInt(s.balance || 0),
      (parseInt(s.balance || 0) * parseFloat(s.estimated_value || 0)).toFixed(0),
    ]);

    const totalValue = rows.reduce((acc, r) => acc + parseFloat(r[6] || 0), 0);
    rows.push(['', '', '', '', '', 'TOTAL', `${totalValue.toFixed(0)}\u20AC`]);

    await clearRange(sheetId, `${TABS.STOCK}!A:G`);
    await writeRange(sheetId, `${TABS.STOCK}!A1`, [header, ...rows]);
    log(`[SHEETS] Stock: ${rows.length - 1} itens.`);
  } catch (e) {
    warn(`[SHEETS] Falha stock: ${e.message}`);
  }
}

async function syncMovements(sheetId, limit = 500) {
  try {
    const { query } = require('../db');
    const res = await query(`
      SELECT im.*, i.name as item_name, i.category as item_category,
             i.estimated_value as item_price,
             m.display_name, m.discord_id, m.tier
      FROM inventory_movements im
      JOIN items i ON i.id = im.item_id
      LEFT JOIN members m ON m.id = im.member_id
      ORDER BY im.created_at DESC LIMIT $1
    `, [limit]);

    const typeLabels = {
      entrega_morador: '\uD83D\uDCE6 Entrega', venda_morador: '\uD83D\uDCB0 Venda',
      entrega_oficial: '\uD83C\uDF1F Entrega Oficial', fornecimento_org: '\uD83C\uDFE2 Fornecimento',
      consumo_operacao: '\u2694\uFE0F Consumo', devolucao_operacao: '\u21A9\uFE0F Devolução',
      ajuste_manual: '\uD83D\uDD27 Ajuste', perda_operacao: '\u274C Perda',
      apreendido: '\uD83D\uDD12 Apreendido', craftado: '\uD83D\uDD28 Craftado',
    };

    const header = ['\uD83D\uDCC5 Data', '\uD83D\uDD04 Tipo', '\uD83D\uDC64 Membro', '\uD83D\uDCE6 Item', '\uD83C\uDFF7\uFE0F Cat', '\uD83D\uDCCA Qtd', '\uD83D\uDCB0 PU', '\uD83D\uDC8E Total', '\u2694\uFE0F Op', '\u2B50 Tier', '\uD83D\uDCDD Notas'];
    const rows = res.rows.map(m => [
      m.created_at ? new Date(m.created_at).toISOString().replace('T', ' ').slice(0, 16) : '',
      typeLabels[m.movement_type] || m.movement_type,
      m.display_name || '',
      m.item_name, m.item_category,
      m.quantity,
      parseFloat(m.item_price || 0),
      (m.quantity * parseFloat(m.item_price || 0)).toFixed(0),
      m.operation_id ? `#${m.operation_id}` : '',
      m.tier ? formatTierName(m.tier) : '',
      m.notes || '',
    ]);

    await clearRange(sheetId, `${TABS.MOVIMENTOS}!A:K`);
    await writeRange(sheetId, `${TABS.MOVIMENTOS}!A1`, [header, ...rows]);
    log(`[SHEETS] Movimentos: ${rows.length}.`);
  } catch (e) {
    warn(`[SHEETS] Falha movimentos: ${e.message}`);
  }
}

async function syncMembers(sheetId) {
  try {
    const members = await memberRepo.findAll('ativo');
    const header = ['#', '\uD83D\uDC64 Nome', '\uD83C\uDD94 Discord ID', '\uD83C\uDFF7\uFE0F Cargo', '\u2B50 Tier', '\uD83D\uDCC5 Entrada', '\uD83D\uDCE6 Entregas', '\uD83D\uDCB0 Vendas', '\uD83D\uDC8E Valor Total', '\uD83D\uDCC8 Progresso', '\uD83C\uDFAF Próx. Meta', '\uD83D\uDCDD Notas'];

    const rows = [];
    for (const m of members) {
      const totals = await inventoryRepo.getMemberTotals(m.id);
      const totalValue = await getMemberMaterialValue(m.id);
      const nextThreshold = m.tier === 'young_blood' ? CONFIG.PROMO_YOUNG_BLOOD_TO_GUNAO
        : m.tier === 'o_gunao' ? CONFIG.PROMO_GUNAO_TO_GANGSTER_FODIDO : null;
      const progress = nextThreshold ? `${((totalValue / nextThreshold) * 100).toFixed(1)}%` : 'MAX';

      rows.push([
        rows.length + 1,
        m.display_name,
        m.discord_id,
        m.role,
        formatTierName(m.tier || 'young_blood'),
        m.joined_at ? new Date(m.joined_at).toISOString().split('T')[0] : '',
        totals.entrega_morador || 0,
        totals.venda_morador || 0,
        `${totalValue.toLocaleString('pt-PT')}\u20AC`,
        progress,
        nextThreshold ? `${nextThreshold.toLocaleString('pt-PT')}\u20AC` : '\u2014',
        m.notes || '',
      ]);
    }

    rows.sort((a, b) => parseFloat(String(b[8]).replace(/[^\d.-]/g, '')) - parseFloat(String(a[8]).replace(/[^\d.-]/g, '')));
    rows.forEach((r, i) => { r[0] = i + 1; });

    await clearRange(sheetId, `${TABS.MEMBROS}!A:L`);
    await writeRange(sheetId, `${TABS.MEMBROS}!A1`, [header, ...rows]);
    log(`[SHEETS] Membros: ${rows.length}.`);
  } catch (e) {
    warn(`[SHEETS] Falha membros: ${e.message}`);
  }
}

async function syncOperations(sheetId) {
  try {
    const ops = await operationRepo.findRecent(100);
    const header = ['\uD83C\uDD94 ID', '\uD83D\uDCC5 Data', '\u23F0 Hora', '\uD83C\uDFAF Tipo', '\uD83D\uDCCD Estado', '\uD83D\uDDFA\uFE0F Spot', '\uD83D\uDC51 Líder', '\uD83D\uDC65 Part.', '\u2694\uFE0F Fight?', '\uD83C\uDFAD Inimigo', '\uD83D\uDC80 Mortes', '\u2705 Sobrev.', '\uD83D\uDCDD Notas'];

    const statusLabels = {
      aberta: '\uD83D\uDFE2 Aberta', em_preparacao: '\uD83D\uDFE1 Preparação',
      em_curso: '\uD83D\uDFE0 Em Curso', concluida: '\u2705 Concluída', cancelada: '\u274C Cancelada',
    };

    const rows = [];
    for (const op of ops) {
      const participants = await operationRepo.getParticipants(op.id);
      rows.push([
        op.id,
        op.date ? new Date(op.date).toISOString().split('T')[0] : '',
        op.scheduled_time || '',
        op.operation_type,
        statusLabels[op.status] || op.status,
        op.spot || '', op.leader_name || '',
        participants.length,
        op.had_fight ? 'Sim' : 'Não',
        op.enemy_name || '', op.deaths || 0, op.survivors || 0,
        op.notes || '',
      ]);
    }

    await clearRange(sheetId, `${TABS.OPERACOES}!A:M`);
    await writeRange(sheetId, `${TABS.OPERACOES}!A1`, [header, ...rows]);
    log(`[SHEETS] Operações: ${rows.length}.`);
  } catch (e) {
    warn(`[SHEETS] Falha operações: ${e.message}`);
  }
}

async function syncTopSemanal(sheetId) {
  try {
    const { start, end } = weekBounds();
    const weekStart = start.toISOString().split('T')[0];
    const rankings = await rankingRepo.getWeekRanking(weekStart, 20);
    const header = ['\uD83C\uDFC5 Pos', '\uD83D\uDC64 Nome', '\uD83C\uDD94 Discord', '\u2B50 Tier', '\uD83D\uDCE6 Entregas', '\uD83D\uDCB0 Vendas', '\u2694\uFE0F Ops', '\uD83D\uDC8E Valor Total', '\uD83D\uDCC8 Trend'];

    const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
    const rows = rankings.map((r, i) => [
      medals[i] || `${i + 1}`,
      r.display_name,
      r.discord_id,
      formatTierName(r.role === 'morador' ? 'young_blood' : r.role),
      r.deliveries || 0, r.sales || 0, r.operations_count || 0,
      `${parseFloat(r.weighted_value || 0).toLocaleString('pt-PT')}\u20AC`,
      '',
    ]);

    await clearRange(sheetId, `${TABS.TOP}!A:I`);
    await writeRange(sheetId, `${TABS.TOP}!A1`, [header, ...rows]);
    log(`[SHEETS] Top Semanal: ${rows.length}.`);
  } catch (e) {
    warn(`[SHEETS] Falha top: ${e.message}`);
  }
}

async function syncCatalogo(sheetId) {
  try {
    const items = await inventoryRepo.getItems(false);
    const header = ['#', '\uD83D\uDCE6 Material', '\uD83C\uDFF7\uFE0F Categoria', '\uD83D\uDCCF Unidade', '\uD83D\uDCB0 Preço (\u20AC)', '\u2705 Ativo'];
    const rows = items.map((item, i) => [
      i + 1, item.name, item.category, item.unit,
      parseFloat(item.estimated_value || 0),
      item.active ? 'Sim' : 'Não',
    ]);

    await clearRange(sheetId, `${TABS.CATALOGO}!A:F`);
    await writeRange(sheetId, `${TABS.CATALOGO}!A1`, [header, ...rows]);
    log(`[SHEETS] Catálogo: ${rows.length} itens.`);
  } catch (e) {
    warn(`[SHEETS] Falha catálogo: ${e.message}`);
  }
}

module.exports = { syncAll, syncResumo, syncStock, syncMovements, syncMembers, syncOperations, syncTopSemanal, syncCatalogo };
