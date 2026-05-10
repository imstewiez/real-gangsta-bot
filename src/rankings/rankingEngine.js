'use strict';
/**
 * Rankings semanais — motor híbrido com 3 eixos:
 *
 *   contribuicao   = weighted_value (material entregue/vendido)
 *   performance    = kills*10 + wins*20 - losses*5 + netProfit/100 + saidas*3
 *   fiabilidade    = return_rate*0.5 + survival_rate*0.3
 *   hybrid_score   = contribuicao*0.4 + performance*0.4 + fiabilidade*0.2
 *
 * (Pesos intencionalmente explícitos. Afináveis em caso de mudança cultural.)
 */

const { inventoryRepo, rankingRepo, memberRepo, killRepo } = require('../repositories');
const { query } = require('../db');
const { weekBounds } = require('../util');
const { log, warn } = require('../logger');
const eventBus = require('../core/eventBus');
const { computePercentileRanks } = require('./normalize');

// Pesos dos 3 eixos do hybrid_score
const WEIGHTS = { contribuicao: 0.4, performance: 0.4, fiabilidade: 0.2 };

function computeHybridScore({
  weightedValue,
  killsCount,
  winsCount,
  lossCount,
  netProfit,
  saidasCount,
  returnRate,
  survivalRate,
}) {
  const contribuicao = Number(weightedValue) || 0;
  const performance =
    (killsCount || 0) * 10 +
    (winsCount || 0) * 20 -
    (lossCount || 0) * 5 +
    (netProfit || 0) / 100 +
    (saidasCount || 0) * 3;
  const fiabilidade = (returnRate || 0) * 0.5 + (survivalRate || 0) * 0.3;
  return contribuicao * WEIGHTS.contribuicao + performance * WEIGHTS.performance + fiabilidade * WEIGHTS.fiabilidade;
}

async function _memberWeekStats(memberId, weekStart, weekEnd) {
  // Kills na janela
  const killsCount = await killRepo.countKillsByMember(memberId, weekStart, weekEnd);
  // Agregados a partir de operation_participants das saídas fechadas na janela
  const res = await query(
    `SELECT
       COUNT(*) FILTER (WHERE o.result = 'vitoria')::int AS wins,
       COUNT(*) FILTER (WHERE o.result = 'derrota')::int AS losses,
       COUNT(*)::int AS saidas,
       COUNT(*) FILTER (WHERE op.survived = true)::int AS survived_count,
       COUNT(*) FILTER (WHERE op.died = true)::int AS died_count,
       COALESCE(SUM(op.net_material_delta), 0)::numeric AS net_profit,
       COALESCE(AVG(op.discipline_score), 0)::numeric AS avg_discipline
     FROM operation_participants op
     JOIN operations o ON o.id = op.operation_id
     WHERE op.member_id = $1
       AND o.status = 'concluida'
       AND o.date >= $2 AND o.date <= $3`,
    [memberId, weekStart, weekEnd]
  );
  const r = res.rows[0] || {};
  const saidas = Number(r.saidas || 0);
  const survivalRate = saidas > 0 ? (Number(r.survived_count) / saidas) * 100 : 0;
  const returnRate = Number(r.avg_discipline || 0); // aproximação — disciplina média
  return {
    killsCount,
    winsCount: Number(r.wins || 0),
    lossCount: Number(r.losses || 0),
    saidasCount: saidas,
    netProfit: Number(r.net_profit || 0),
    survivalRate,
    returnRate,
  };
}

async function computeWeeklyRankings(weekDate = new Date()) {
  const { start, end } = weekBounds(weekDate);
  const weekStart = start.toISOString().split('T')[0];
  const weekEnd = end.toISOString().split('T')[0];

  const movements = await inventoryRepo.getWeeklyMovements(start, end);
  const members = await memberRepo.findAll('ativo');

  // First pass: compute raw scores for all members
  const memberData = [];
  for (const member of members) {
    const movData = movements.find(m => m.member_id === member.id);
    const deliveries = parseInt(movData?.deliveries || 0);
    const sales = parseInt(movData?.sales || 0);
    const weightedValue = parseFloat(movData?.weighted_value || 0);

    const stats = await _memberWeekStats(member.id, weekStart, weekEnd);
    const performanceRaw =
      (stats.killsCount || 0) * 10 +
      (stats.winsCount || 0) * 20 -
      (stats.lossCount || 0) * 5 +
      (stats.netProfit || 0) / 100 +
      (stats.saidasCount || 0) * 3;

    const hybrid = computeHybridScore({
      weightedValue,
      ...stats,
    });

    memberData.push({
      member,
      deliveries,
      sales,
      weightedValue,
      stats,
      performanceRaw,
      hybrid,
    });
  }

  // Second pass: percentile normalization
  const forNormalization = memberData.map(md => ({
    ...md.member,
    hybridScore: md.hybrid,
    weightedValue: md.weightedValue,
    deliveries: md.deliveries,
    sales: md.sales,
    performanceScore: md.performanceRaw,
    ...md.stats,
  }));
  const normalized = computePercentileRanks(forNormalization);

  // Third pass: persist
  const rankings = [];
  for (const r of normalized) {
    const saved = await rankingRepo.saveWeeklyRanking({
      memberId: r.id,
      weekStart,
      weekEnd,
      deliveries: r.deliveries,
      sales: r.sales,
      saidasCount: r.saidasCount,
      weightedValue: r.weightedValue,
      returnRate: r.returnRate,
      killsCount: r.killsCount,
      winsCount: r.winsCount,
      lossCount: r.lossCount,
      netProfitGenerated: r.netProfit,
      survivalRate: r.survivalRate,
      performanceScore: r.performanceScore,
      hybridScore: r.hybridScore,
      normalizedScore: r.normalized_score,
    });

    rankings.push({ ...saved, discord_id: r.discord_id, display_name: r.display_name, role: r.role });
  }

  rankings.sort((a, b) => (b.normalized_score || 0) - (a.normalized_score || 0));
  log(`[RANKINGS] ${rankings.length} rankings computados para semana ${weekStart}.`);

  eventBus
    .emitAsync('ranking.updated', {
      weekStart,
      weekEnd,
      count: rankings.length,
      topMemberId: rankings[0]?.member_id || null,
      topScore: rankings[0]?.normalized_score || null,
      at: new Date(),
    })
    .catch(e => warn(`[EVENT] ranking.updated: ${e.message}`));

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

module.exports = {
  computeWeeklyRankings,
  getCurrentWeekRanking,
  getPreviousWeekRanking,
  getWeekSummary,
  computeHybridScore,
  WEIGHTS,
};
