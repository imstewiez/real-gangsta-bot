'use strict';
const { operationRepo, memberRepo, inventoryRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const metrics = require('../lib/metrics');
const { warn } = require('../logger');

async function createOperation({ date, scheduledTime, spot, operationType, leaderDiscordId, groupNumber, maxParticipants, notes, createdBy }) {
  let leaderId = null;
  if (leaderDiscordId) {
    const leader = await memberRepo.findByDiscordId(leaderDiscordId);
    if (leader) leaderId = leader.id;
  }

  const op = await operationRepo.create({
    date, scheduledTime, spot, operationType,
    leaderId, groupNumber, maxParticipants, notes, createdBy,
  });

  metrics.operationsCreated.inc();

  await logAudit({
    action: 'operation_created',
    entityType: 'operation',
    entityId: String(op.id),
    actorId: createdBy,
    afterState: { operationType, spot, date, groupNumber },
  });

  return op;
}

async function startOperation(opId, actorId) {
  return operationRepo.updateStatus(opId, 'em_curso', { start_time: new Date() });
}

async function closeOperation(opId, resultData, actorId) {
  const op = await operationRepo.closeOperation(opId, resultData);
  if (!op) return null;

  metrics.operationsClosed.inc();

  await logAudit({
    action: 'operation_closed',
    entityType: 'operation',
    entityId: String(opId),
    actorId,
    afterState: resultData,
  });

  return op;
}

async function cancelOperation(opId, actorId) {
  const op = await operationRepo.updateStatus(opId, 'cancelada');

  await logAudit({
    action: 'operation_cancelled',
    entityType: 'operation',
    entityId: String(opId),
    actorId,
  });

  return op;
}

async function addParticipant(opId, discordId, data, actorId) {
  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) throw new Error('Membro não encontrado.');

  const participant = await operationRepo.addParticipant(opId, member.id, data);

  await logAudit({
    action: 'participant_added',
    entityType: 'operation',
    entityId: String(opId),
    actorId,
    afterState: { memberId: member.id, displayName: member.display_name },
  });

  return participant;
}

async function updateParticipantResult(opId, discordId, fields, actorId) {
  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) throw new Error('Membro não encontrado.');

  return operationRepo.updateParticipant(opId, member.id, fields);
}

async function registerOperationMaterial(opId, itemId, direction, quantity, discordId, notes, actorId) {
  let memberId = null;
  if (discordId) {
    const member = await memberRepo.findByDiscordId(discordId);
    if (member) memberId = member.id;
  }

  const mat = await operationRepo.addMaterial(opId, itemId, direction, quantity, memberId, notes);

  const movementTypeMap = {
    fornecido: 'fornecimento_org',
    devolvido: 'devolucao_operacao',
    perdido: 'perda_operacao',
    consumido: 'consumo_operacao',
  };

  await inventoryRepo.recordMovement({
    movementType: movementTypeMap[direction] || 'consumo_operacao',
    itemId,
    quantity,
    memberId,
    memberRole: '',
    origin: direction === 'fornecido' ? 'org' : 'operacao',
    destination: direction === 'devolvido' ? 'org' : 'operacao',
    context: `Operação #${opId}`,
    notes,
    operationId: opId,
    createdBy: actorId,
  });

  await logAudit({
    action: 'operation_material',
    entityType: 'operation',
    entityId: String(opId),
    actorId,
    afterState: { itemId, direction, quantity },
  });

  return mat;
}

async function getOperationSummary(opId) {
  const [op, participants, materials, materialSummary] = await Promise.all([
    operationRepo.findById(opId),
    operationRepo.getParticipants(opId),
    operationRepo.getMaterials(opId),
    operationRepo.getMaterialSummary(opId),
  ]);

  if (!op) return null;

  return {
    operation: op,
    participants,
    materials,
    materialSummary,
    participantCount: participants.length,
    survivors: participants.filter(p => p.survived).length,
    deaths: participants.filter(p => p.died).length,
    returned: participants.filter(p => p.returned).length,
  };
}

module.exports = {
  createOperation, startOperation, closeOperation, cancelOperation,
  addParticipant, updateParticipantResult, registerOperationMaterial,
  getOperationSummary,
};
