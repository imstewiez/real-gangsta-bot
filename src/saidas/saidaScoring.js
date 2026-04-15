'use strict';
/**
 * Scoring de saídas — calcula performance_score, discipline_score e MVP
 * a partir dos participantes e do resultado da saída.
 *
 * Fórmulas (intencionalmente explícitas e ajustáveis):
 *
 *   performance_score = kills*10 + wins_bonus + disciplina_bonus
 *     + se o resultado for 'vitoria': +20
 *     + se survived=true e !died: +5
 *     - se died: -5
 *     + kills*10, downs*3, assists*2 (se preenchidos)
 *     clamped a [0, 100]
 *
 *   discipline_score = % de material devolvido sobre o recebido
 *     issued=0 → 100 (nada a devolver, não é penalizado)
 *     issued>0 → (returned / issued) * 100
 *     clamped a [0, 100]
 *
 *   net_material_delta = returned_value - lost_value - consumed_value
 *     (positivo = participante rentável para a org)
 *
 *   mvp_flag = true para o participante com maior performance_score
 *     desde que tenha kills > 0 OU sobrevivido+disciplina≥70%
 */

function computeSaidaScores({ participants, result, suppliedTotal }) {
  const isWin = result === 'vitoria';
  const isLoss = result === 'derrota';

  const scored = participants.map(p => {
    const kills = Number(p.kills || 0);
    const deaths_count = Number(p.deaths_count || (p.died ? 1 : 0));
    const downs = Number(p.downs || 0);
    const died = Boolean(p.died);
    const survived = p.survived !== false && !died;

    const issued_value   = Number(p.issued_value   || 0);
    const returned_value = Number(p.returned_value || 0);
    const lost_value     = Number(p.lost_value     || 0);
    const consumed_value = Number(p.consumed_value || 0);

    const net_material_delta = returned_value - lost_value - consumed_value;

    // Performance score — combina combate e sobrevivência + resultado.
    let perf = 0;
    perf += kills * 10;
    perf += downs * 3;
    if (survived) perf += 5;
    if (died) perf -= 5;
    if (isWin) perf += 20;
    if (isLoss && died) perf -= 5;
    const performance_score = Math.max(0, Math.min(100, perf));

    // Discipline score — quanto material devolveu face ao que recebeu.
    let discipline_score;
    if (issued_value > 0) {
      discipline_score = Math.max(0, Math.min(100, (returned_value / issued_value) * 100));
    } else {
      discipline_score = 100; // não recebeu → disciplina neutra/total
    }

    return {
      ...p,
      kills, deaths_count, downs, died, survived,
      issued_value, returned_value, lost_value, consumed_value,
      net_material_delta,
      performance_score,
      discipline_score,
      mvp_flag: false, // definido abaixo
    };
  });

  // MVP: maior performance_score, desde que tenha kills > 0 ou (survived + discipline ≥ 70).
  const eligible = scored.filter(p => p.kills > 0 || (p.survived && p.discipline_score >= 70));
  if (eligible.length) {
    eligible.sort((a, b) => b.performance_score - a.performance_score);
    const top = eligible[0];
    const idx = scored.findIndex(p => p.member_id === top.member_id);
    if (idx >= 0) scored[idx].mvp_flag = true;
  }

  return scored;
}

module.exports = { computeSaidaScores };
