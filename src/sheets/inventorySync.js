'use strict';
const { writeRange, clearRange } = require('./googleAuth');
const { inventoryRepo, memberRepo, operationRepo } = require('../repositories');
const { log, warn } = require('../logger');
const CONFIG = require('../config');
const { formatTierName } = require('../members/autoPromotionEngine');
const { getMemberMaterialValue } = require('../members/autoPromotionEngine');

/**
 * Exporta dados completos de inventário para o Google Sheets.
 * Estrutura das tabs:
 *   - Stock_Atual        → Stock atual por item
 *   - Movimentos         → Últimos N movimentos
 *   - Membros            → Lista de membros com totais
 *   - Operações          → Lista de operações
 *   - Top_Semanal        → Ranking semanal
 */
async function syncAll() {
  const sheetId = CONFIG.SPREADSHEET_ID;
  if (!sheetId) {
    warn('[SHEETS] SPREADSHEET_ID não configurado. Export desativado.');
    return;
  }

  log('[SHEETS] A exportar dados para Google Sheets...');

  await Promise.all([
    syncStock(sheetId),
    syncMovements(sheetId),
    syncMembers(sheetId),
    syncOperations(sheetId),
  ]);

  log('[SHEETS] Export concluído.');
}

async function syncStock(sheetId) {
  try {
    const stock = await inventoryRepo.getStock();
    const header = ['Item', 'Categoria', 'Unidade', 'Preço (€)', 'Stock Atual', 'Valor Total (€)'];
    const rows = stock.map(s => [
      s.name,
      s.category,
      s.unit,
      parseFloat(s.estimated_value || 0),
      parseInt(s.balance || 0),
      (parseInt(s.balance || 0) * parseFloat(s.estimated_value || 0)).toFixed(2),
    ]);

    // Total row
    const totalValue = rows.reduce((acc, r) => acc + parseFloat(r[5]), 0);
    rows.push(['', '', '', '', 'TOTAL', totalValue.toFixed(2)]);

    await clearRange(sheetId, 'Stock_Atual!A:F');
    await writeRange(sheetId, 'Stock_Atual!A1', [header, ...rows]);
    log(`[SHEETS] Stock: ${rows.length - 1} itens exportados.`);
  } catch (e) {
    warn(`[SHEETS] Falha ao exportar stock: ${e.message}`);
  }
}

async function syncMovements(sheetId, limit = 500) {
  try {
    const { query } = require('../db');
    const res = await query(`
      SELECT im.*, i.name as item_name, i.category as item_category,
             i.estimated_value as item_price,
             m.display_name as member_name, m.discord_id as member_discord_id
      FROM inventory_movements im
      JOIN items i ON i.id = im.item_id
      LEFT JOIN members m ON m.id = im.member_id
      ORDER BY im.created_at DESC
      LIMIT $1
    `, [limit]);

    const typeLabels = {
      entrega_morador: 'Entrega (Morador)', venda_morador: 'Venda (Morador)',
      entrega_oficial: 'Entrega (Oficial)', fornecimento_org: 'Fornecimento Org',
      consumo_operacao: 'Consumo Operação', devolucao_operacao: 'Devolução',
      ajuste_manual: 'Ajuste Manual', perda_operacao: 'Perda',
      apreendido: 'Apreendido', craftado: 'Craftado',
    };

    const header = ['Data', 'Tipo', 'Membro', 'Item', 'Categoria', 'Qtd', 'Preço Unit (€)', 'Valor Total (€)', 'Operação', 'Notas'];
    const rows = res.rows.map(m => [
      m.created_at ? new Date(m.created_at).toISOString().replace('T', ' ').slice(0, 19) : '',
      typeLabels[m.movement_type] || m.movement_type,
      m.member_name || '',
      m.item_name,
      m.item_category,
      m.quantity,
      parseFloat(m.item_price || 0),
      (m.quantity * parseFloat(m.item_price || 0)).toFixed(2),
      m.operation_id ? `#${m.operation_id}` : '',
      m.notes || '',
    ]);

    await clearRange(sheetId, 'Movimentos!A:J');
    await writeRange(sheetId, 'Movimentos!A1', [header, ...rows]);
    log(`[SHEETS] Movimentos: ${rows.length} registos exportados.`);
  } catch (e) {
    warn(`[SHEETS] Falha ao exportar movimentos: ${e.message}`);
  }
}

async function syncMembers(sheetId) {
  try {
    const members = await memberRepo.findAll('ativo');
    const header = ['Nome', 'Discord ID', 'Cargo', 'Tier', 'Desde', 'Entregas', 'Vendas', 'Valor Total (€)'];

    const rows = [];
    for (const m of members) {
      const totals = await inventoryRepo.getMemberTotals(m.id);
      const totalValue = await getMemberMaterialValue(m.id);
      rows.push([
        m.display_name,
        m.discord_id,
        m.role,
        formatTierName(m.tier || 'young_blood'),
        m.joined_at ? new Date(m.joined_at).toISOString().split('T')[0] : '',
        totals.entrega_morador || 0,
        totals.venda_morador || 0,
        totalValue.toFixed(2),
      ]);
    }

    // Sort by total value descending
    rows.sort((a, b) => parseFloat(b[7]) - parseFloat(a[7]));

    await clearRange(sheetId, 'Membros!A:H');
    await writeRange(sheetId, 'Membros!A1', [header, ...rows]);
    log(`[SHEETS] Membros: ${rows.length} exportados.`);
  } catch (e) {
    warn(`[SHEETS] Falha ao exportar membros: ${e.message}`);
  }
}

async function syncOperations(sheetId) {
  try {
    const ops = await operationRepo.findRecent(100);
    const header = ['ID', 'Data', 'Tipo', 'Estado', 'Spot', 'Líder', 'Participantes', 'Fight?', 'Inimigo', 'Mortes', 'Sobreviventes', 'Notas'];
    const rows = [];

    for (const op of ops) {
      const participants = await operationRepo.getParticipants(op.id);
      rows.push([
        op.id,
        op.date ? new Date(op.date).toISOString().split('T')[0] : '',
        op.operation_type,
        op.status,
        op.spot || '',
        op.leader_name || '',
        participants.length,
        op.had_fight ? 'Sim' : 'Não',
        op.enemy_name || '',
        op.deaths || 0,
        op.survivors || 0,
        op.notes || '',
      ]);
    }

    await clearRange(sheetId, 'Operações!A:L');
    await writeRange(sheetId, 'Operações!A1', [header, ...rows]);
    log(`[SHEETS] Operações: ${rows.length} exportadas.`);
  } catch (e) {
    warn(`[SHEETS] Falha ao exportar operações: ${e.message}`);
  }
}

module.exports = { syncAll, syncStock, syncMovements, syncMembers, syncOperations };
