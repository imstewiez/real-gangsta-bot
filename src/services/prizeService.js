'use strict';
/**
 * Prize Service — lógica de negócio para prémios semanais.
 *
 * Responsabilidades:
 *   - Registar vencedor da semana (chamado pelo rankingJobs)
 *   - Permitir chefia definir prémio
 *   - Permitir chefia marcar prémio como entregue
 *   - Listar prémios pendentes/histórico
 *   - Enviar notificações ao vencedor
 */

const { prizeRepo } = require('../repositories');
const { log } = require('../logger');
const { logAudit } = require('../audit/auditEngine');
const { NotFoundError } = require('../shared/errors');

async function recordWeeklyWinner({ weekStart, weekEnd, winnerMemberId, hybridScore, metrics }) {
  const prize = await prizeRepo.create({
    weekStart,
    weekEnd,
    winnerMemberId,
    hybridScore,
    metricsJson: metrics,
  });
  log(`[PRIZE] Vencedor semana ${weekStart} registado: member=${winnerMemberId}, score=${hybridScore}`);
  return prize;
}

async function definePrize({ weekStart, prizeDescription, definedBy, notes = '' }) {
  const prize = await prizeRepo.definePrize(weekStart, { prizeDescription, definedBy, notes });
  if (!prize) throw new NotFoundError('Semana não encontrada ou prémio já entregue.', { code: 'PRIZE_NOT_FOUND' });

  await logAudit({
    action: 'prize_defined',
    entityType: 'weekly_prize',
    entityId: String(weekStart),
    actorId: definedBy,
    afterState: { prizeDescription, status: prize.prize_status },
    context: notes,
  });

  log(`[PRIZE] Prémio definido para semana ${weekStart} por ${definedBy}: ${prizeDescription}`);
  return prize;
}

async function markDelivered({ weekStart, deliveredBy, notes = '' }) {
  const prize = await prizeRepo.markDelivered(weekStart, { deliveredBy, notes });
  if (!prize) throw new NotFoundError('Semana não encontrada.', { code: 'PRIZE_NOT_FOUND' });

  await logAudit({
    action: 'prize_delivered',
    entityType: 'weekly_prize',
    entityId: String(weekStart),
    actorId: deliveredBy,
    afterState: { status: 'entregue' },
    context: notes,
  });

  log(`[PRIZE] Prémio entregue semana ${weekStart} por ${deliveredBy}`);
  return prize;
}

async function listPendingPrizes({ limit = 10 } = {}) {
  return prizeRepo.findByStatus('por_definir', { limit });
}

async function listDefinedButNotDelivered({ limit = 10 } = {}) {
  return prizeRepo.findByStatus('definido', { limit });
}

async function getRecentPrizes({ limit = 10 } = {}) {
  return prizeRepo.findRecent({ limit });
}

async function getPrizeByWeek(weekStart) {
  return prizeRepo.findByWeek(weekStart);
}

module.exports = {
  recordWeeklyWinner,
  definePrize,
  markDelivered,
  listPendingPrizes,
  listDefinedButNotDelivered,
  getRecentPrizes,
  getPrizeByWeek,
};
