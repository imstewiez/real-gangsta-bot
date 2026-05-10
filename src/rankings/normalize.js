'use strict';
/**
 * Normalização de rankings para percentil.
 *
 * percentile = (total_members - rank + 1) / total_members
 * normalized_score = percentile * 1000
 */

function computePercentileRanks(members) {
  if (!members || members.length === 0) return [];

  const sorted = [...members].sort((a, b) => {
    const scoreA = a.hybridScore ?? a.hybrid_score ?? a.weightedValue ?? a.weighted_value ?? 0;
    const scoreB = b.hybridScore ?? b.hybrid_score ?? b.weightedValue ?? b.weighted_value ?? 0;
    return scoreB - scoreA;
  });

  const total = sorted.length;
  return sorted.map((m, index) => {
    const rank = index + 1;
    const percentile = total > 0 ? (total - rank + 1) / total : 0;
    const normalized_score = percentile * 1000;
    return {
      ...m,
      rank,
      percentile,
      normalized_score: Math.round(normalized_score * 100) / 100,
    };
  });
}

module.exports = { computePercentileRanks };
