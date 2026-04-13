'use strict';
const { inventoryRepo, operationRepo, rankingRepo, memberRepo } = require('../repositories');
const { weekBounds } = require('../util');
const { log } = require('../logger');

async function computeWeeklyRankings(weekDate = new Date()) {
  const { start, end } = weekBounds(weekDate);
  const weekStart = start.toISOString().split('T')[0];
  const weekEnd = end.toISOString().split('T')[0];

  const movements = await inventoryRepo.getWeeklyMovements(start, end);
  const members = await memberRepo.findAll('ativo');

  const rankings = [];

  for (const member of members) {
    const movData = movements.find(m => m.member_id === member.id);
    const deliveries = parseInt(movData?.deliveries || 0);
    const sales = parseInt(movData?.sales || 0);
    const weightedValue = parseFloat(movData?.weighted_value || 0);

    const opsCount = await operationRepo.countParticipationsByMember(member.id, weekStart, weekEnd);

    const saved = await rankingRepo.saveWeeklyRanking({
      memberId: member.id,
      weekStart,
      weekEnd,
      deliveries,
      sales,
      operationsCount: opsCount,
      weightedValue: weightedValue + (opsCount * 5),
      returnRate: 0,
    });

    rankings.push({ ...saved, discord_id: member.discord_id, display_name: member.display_name, role: member.role });
  }

  rankings.sort((a, b) => b.weighted_value - a.weighted_value);
  log(`[RANKINGS] Computed ${rankings.length} rankings for week ${weekStart}.`);

  return rankings;
}

async function getCurrentWeekRanking(limit = 10) {
  const { start } = weekBounds();
  const weekStart = start.toISOString().split('T')[0];
  return rankingRepo.getWeekRanking(weekStart, limit);
}

async function getPreviousWeekRanking(limit = 10) {
  const prevWeek = new Date();
  prevWeek.setDate(prevWeek.getDate() - 7);
  const { start } = weekBounds(prevWeek);
  const weekStart = start.toISOString().split('T')[0];
  return rankingRepo.getWeekRanking(weekStart, limit);
}

async function getWeekSummary(weekDate = new Date()) {
  const { start } = weekBounds(weekDate);
  const weekStart = start.toISOString().split('T')[0];
  return rankingRepo.getWeekSummary(weekStart);
}

module.exports = { computeWeeklyRankings, getCurrentWeekRanking, getPreviousWeekRanking, getWeekSummary };
