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

  // Reconciliação de materiais: alerta para chefe se ficou material por
  // contabilizar (fornecido > devolvido + perdido + consumido).
  const recon = await reconcileOperationMaterials(opId);

  await logAudit({
    action: 'operation_closed',
    entityType: 'operation',
    entityId: String(opId),
    actorId,
    afterState: { ...resultData, reconciliation: recon },
    context: recon.unaccounted > 0
      ? `Fechou com ${recon.unaccounted} unidades não contabilizadas (fornecido=${recon.fornecido}, devolvido=${recon.devolvido}, perdido=${recon.perdido}, consumido=${recon.consumido}).`
      : undefined,
  });

  return { ...op, reconciliation: recon };
}

/**
 * Calcula totais de material por direction e devolve `unaccounted` —
 * unidades que saíram da org mas não foram devolvidas/perdidas/consumidas.
 * Apenas informativo; não bloqueia o fecho.
 */
async function reconcileOperationMaterials(opId) {
  const summary = await operationRepo.getMaterialSummary(opId);
  const fornecido = summary.fornecido?.total || 0;
  const devolvido = summary.devolvido?.total || 0;
  const perdido = summary.perdido?.total || 0;
  const consumido = summary.consumido?.total || 0;
  const unaccounted = Math.max(0, fornecido - devolvido - perdido - consumido);
  return { fornecido, devolvido, perdido, consumido, unaccounted };
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

// ═══════════════════════════════════════════════════════════════════════════
// CADEIA DE CUSTÓDIA POR PARTICIPANTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Regista entrega de material da org a UM participante específico.
 * Afecta stock (movimento `fornecimento_org`) e marca o participante como
 * `received_org_material` + `material_source='org'`.
 */
async function issueMaterialToParticipant(opId, discordId, itemId, quantity, actorId, notes = '') {
  if (!quantity || quantity <= 0) throw new Error('Quantidade inválida.');
  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) throw new Error('Membro não encontrado.');

  await operationRepo.addParticipant(opId, member.id, {
    roleInOp: 'membro',
    broughtOwn: false,
    receivedOrg: true,
    notes,
  });
  await operationRepo.updateParticipant(opId, member.id, { material_source: 'org' });

  await operationRepo.addMaterial(opId, itemId, 'fornecido', quantity, member.id, `Fornecimento a <@${discordId}>`);

  await inventoryRepo.recordMovement({
    movementType: 'fornecimento_org',
    itemId,
    quantity,
    memberId: member.id,
    memberRole: member.role,
    origin: 'org',
    destination: `participante:${discordId}`,
    context: `Operação #${opId}`,
    notes,
    operationId: opId,
    createdBy: actorId,
  });

  await logAudit({
    action: 'op_material_issued',
    entityType: 'operation',
    entityId: String(opId),
    actorId,
    afterState: { member: discordId, itemId, quantity },
  });

  return { opId, member: discordId, itemId, quantity };
}

/**
 * Fecha a custódia de um participante após a operação.
 * Regista separadamente devolvido / perdido / morto-com-material.
 *
 * @param opId
 * @param discordId
 * @param outcome {{ returnedItems?: [{itemId,qty}], lostItems?: [...], diedWithItems?: [...], died?: boolean, survived?: boolean, returned?: boolean }}
 */
async function settleParticipantCustody(opId, discordId, outcome, actorId) {
  const member = await memberRepo.findByDiscordId(discordId);
  if (!member) throw new Error('Membro não encontrado.');

  const returned = outcome.returnedItems || [];
  const lost = outcome.lostItems || [];
  const diedWith = outcome.diedWithItems || [];

  let totalReturnedQty = 0;
  let totalLostQty = 0;

  for (const r of returned) {
    if (!r.itemId || !r.qty || r.qty <= 0) continue;
    totalReturnedQty += r.qty;
    await operationRepo.addMaterial(opId, r.itemId, 'devolvido', r.qty, member.id, `Devolvido por <@${discordId}>`);
    await inventoryRepo.recordMovement({
      movementType: 'devolucao_operacao',
      itemId: r.itemId, quantity: r.qty,
      memberId: member.id, memberRole: member.role,
      origin: `participante:${discordId}`, destination: 'org',
      context: `Operação #${opId} — devolução`,
      operationId: opId, createdBy: actorId,
    });
  }

  for (const r of lost) {
    if (!r.itemId || !r.qty || r.qty <= 0) continue;
    totalLostQty += r.qty;
    await operationRepo.addMaterial(opId, r.itemId, 'perdido', r.qty, member.id, `Perdido por <@${discordId}>`);
    await inventoryRepo.recordMovement({
      movementType: 'perda_operacao',
      itemId: r.itemId, quantity: r.qty,
      memberId: member.id, memberRole: member.role,
      origin: `participante:${discordId}`, destination: 'perdido',
      context: `Operação #${opId} — perda`,
      operationId: opId, createdBy: actorId,
    });
  }

  for (const r of diedWith) {
    if (!r.itemId || !r.qty || r.qty <= 0) continue;
    totalLostQty += r.qty;
    await operationRepo.addMaterial(opId, r.itemId, 'perdido', r.qty, member.id, `Morreu com material (<@${discordId}>)`);
    await inventoryRepo.recordMovement({
      movementType: 'perda_operacao',
      itemId: r.itemId, quantity: r.qty,
      memberId: member.id, memberRole: member.role,
      origin: `participante:${discordId}`, destination: 'perdido_morte',
      context: `Operação #${opId} — morto com material`,
      operationId: opId, createdBy: actorId,
    });
  }

  await operationRepo.updateParticipant(opId, member.id, {
    died: outcome.died ?? false,
    survived: outcome.survived ?? !outcome.died,
    returned: outcome.returned ?? !outcome.died,
    returned_material: totalReturnedQty > 0,
    material_returned_qty: totalReturnedQty,
    material_lost_qty: totalLostQty,
  });

  await logAudit({
    action: 'op_custody_settled',
    entityType: 'operation',
    entityId: String(opId),
    actorId,
    afterState: { member: discordId, returned: totalReturnedQty, lost: totalLostQty, died: outcome.died },
  });

  return { member: discordId, returnedQty: totalReturnedQty, lostQty: totalLostQty };
}

module.exports = {
  createOperation, startOperation, closeOperation, cancelOperation,
  addParticipant, updateParticipantResult, registerOperationMaterial,
  issueMaterialToParticipant, settleParticipantCustody,
  getOperationSummary, reconcileOperationMaterials,
};
