'use strict';
const { inventoryRepo, memberRepo, bairristaStatsRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const { notifyMovement } = require('./stockNotifier');
const { notifyBairristaMovement } = require('./bairristaNotifier');
const metrics = require('../lib/metrics');
const { weekBounds } = require('../util');
const { warn } = require('../logger');
const eventBus = require('../core/eventBus');

async function recordDelivery({ discordId, itemId, quantity, movementType, notes = '', operationId = null, createdBy }) {
  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) throw new Error('Membro não encontrado.');

  const item = await inventoryRepo.getItemById(itemId);
  if (!item) throw new Error('Item não encontrado no catálogo.');

  if (quantity <= 0) throw new Error('Quantidade deve ser positiva.');

  const movement = await inventoryRepo.recordMovement({
    movementType,
    itemId,
    quantity,
    memberId: member.id,
    memberRole: member.role,
    origin: /bairrista|morador|oficial/.test(movementType) ? 'membro' : 'org',
    destination: /bairrista|morador|oficial/.test(movementType) ? 'org' : 'membro',
    context: operationId ? `Operação #${operationId}` : '',
    notes,
    operationId,
    createdBy,
  });

  metrics.inventoryMovements.inc();

  await logAudit({
    action: 'inventory_movement',
    entityType: 'inventory',
    entityId: String(movement.id),
    actorId: createdBy,
    afterState: {
      movementType, itemName: item.name, quantity,
      memberName: member.display_name, operationId,
    },
    context: notes,
  });

  // Fire-and-forget notify nos canais de stock
  const balanceAfter = await inventoryRepo.getStockForItem(itemId).catch(() => null);
  notifyMovement({
    movementType, itemName: item.name, quantity,
    memberName: member.display_name, memberDiscordId: member.discord_id,
    actorId: createdBy, operationId, balanceAfter, context: notes,
  }).catch(() => {});

  // Fire-and-forget: log dedicado dos Bairristas (entregas + vendas)
  const isBairristaMovement = /entrega_bairrista|venda_bairrista|entrega_morador|venda_morador/.test(movementType);
  if (isBairristaMovement) {
    (async () => {
      const { start } = weekBounds();
      const weekStartStr = start.toISOString().split('T')[0];
      const [weekStats, rankPosition] = await Promise.all([
        bairristaStatsRepo.getWeeklyMaterialStats(member.discord_id).catch(() => null),
        bairristaStatsRepo.getRankingPosition(member.discord_id, weekStartStr).catch(() => null),
      ]);
      notifyBairristaMovement({
        movementType, itemName: item.name, quantity,
        itemPrice: parseFloat(item.estimated_value) || 0,
        memberName: member.display_name, memberDiscordId: member.discord_id,
        notes, weekStats, rankPosition,
      });
    })().catch(() => {});
  }

  // Event bus — subscribers podem projectar para Sheets / dashboards.
  eventBus.emitAsync('material.registered', {
    movementId: movement.id,
    movementType,
    itemId,
    itemName: item.name,
    itemValue: parseFloat(item.estimated_value) || 0,
    quantity,
    memberId: member.id,
    memberDiscordId: member.discord_id,
    memberRole: member.role,
    operationId,
    actorId: createdBy,
    balanceAfter,
    notes,
    at: new Date(),
  }).catch(e => warn(`[EVENT] material.registered: ${e.message}`));

  return { movement, member, item };
}

async function adjustStock({ itemId, quantity, notes, createdBy }) {
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new Error('Quantidade inválida. Tem de ser um número diferente de zero.');
  }

  const item = await inventoryRepo.getItemById(itemId);
  if (!item) throw new Error('Item não encontrado.');

  // Guard: não permitir ajuste que deixe stock negativo. Permite descontar
  // (quantity < 0) desde que saldo actual + quantity >= 0.
  if (quantity < 0) {
    const current = await inventoryRepo.getStockForItem(itemId).catch(() => null);
    const balance = Number(current?.balance ?? 0);
    if (balance + quantity < 0) {
      throw new Error(
        `Stock insuficiente para **${item.name}** — saldo actual ${balance}, ajuste pedido ${quantity}. ` +
        `Máximo que podes descontar: ${balance}.`
      );
    }
  }

  const movement = await inventoryRepo.recordMovement({
    movementType: 'ajuste_manual',
    itemId,
    quantity,
    createdBy,
    notes,
  });

  await logAudit({
    action: 'stock_adjustment',
    entityType: 'inventory',
    entityId: String(movement.id),
    actorId: createdBy,
    afterState: { itemName: item.name, quantity, notes },
  });

  const balanceAfter = await inventoryRepo.getStockForItem(itemId).catch(() => null);
  notifyMovement({
    movementType: 'ajuste_manual', itemName: item.name, quantity,
    actorId: createdBy, balanceAfter, context: notes,
  }).catch(() => {});

  // Event bus — notification routing publica em INVENTORY_EVENTS.
  eventBus.emitAsync('material.adjusted', {
    movementId: movement.id,
    itemId,
    itemName: item.name,
    itemValue: parseFloat(item.estimated_value) || 0,
    quantity,
    actorId: createdBy,
    balanceAfter,
    notes,
    at: new Date(),
  }).catch(e => warn(`[EVENT] material.adjusted: ${e.message}`));

  return movement;
}

async function getCurrentStock() {
  return inventoryRepo.getStock();
}

async function getStockForItem(itemId) {
  return inventoryRepo.getStockForItem(itemId);
}

module.exports = { recordDelivery, adjustStock, getCurrentStock, getStockForItem };
