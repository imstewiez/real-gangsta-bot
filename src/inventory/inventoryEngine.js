'use strict';
const { inventoryRepo, memberRepo, bairristaStatsRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const { notifyMovement } = require('./stockNotifier');
const { notifyBairristaMovement } = require('./bairristaNotifier');
const metrics = require('../lib/metrics');
const { weekBounds } = require('../util');
const { warn } = require('../logger');

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

  return { movement, member, item };
}

async function adjustStock({ itemId, quantity, notes, createdBy }) {
  const item = await inventoryRepo.getItemById(itemId);
  if (!item) throw new Error('Item não encontrado.');

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

  return movement;
}

async function getCurrentStock() {
  return inventoryRepo.getStock();
}

async function getStockForItem(itemId) {
  return inventoryRepo.getStockForItem(itemId);
}

module.exports = { recordDelivery, adjustStock, getCurrentStock, getStockForItem };
