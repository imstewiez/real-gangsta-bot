'use strict';
const { inventoryRepo, memberRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const metrics = require('../lib/metrics');
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
    origin: movementType.includes('morador') || movementType.includes('oficial') ? 'membro' : 'org',
    destination: movementType.includes('morador') || movementType.includes('oficial') ? 'org' : 'membro',
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

  return movement;
}

async function getCurrentStock() {
  return inventoryRepo.getStock();
}

async function getStockForItem(itemId) {
  return inventoryRepo.getStockForItem(itemId);
}

module.exports = { recordDelivery, adjustStock, getCurrentStock, getStockForItem };
