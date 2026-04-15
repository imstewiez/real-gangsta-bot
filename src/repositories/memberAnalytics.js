'use strict';
/**
 * Analytics pessoais por membro — junta member_saida_stats, kill_logs,
 * operation_participants e operation_materials para dar uma visão
 * completa da performance de cada nome da firma.
 *
 * Todas as queries aceitam discord_id directamente para simplificar
 * handlers (não é preciso traduzir para member.id antes).
 */
const { query } = require('../db');

async function _memberId(discordId) {
  const r = await query(`SELECT id FROM members WHERE discord_id = $1`, [discordId]);
  return r.rows[0]?.id || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE / COMBATE
// ─────────────────────────────────────────────────────────────────────────────

async function getCombatProfile(discordId) {
  const memberId = await _memberId(discordId);
  if (!memberId) return null;

  const stats = await query(`SELECT * FROM member_saida_stats WHERE member_id = $1`, [memberId]);
  const row = stats.rows[0] || {
    saidas_total: 0, wins: 0, losses: 0, draws: 0,
    kills_total: 0, deaths_total: 0, kd_ratio: 0,
    survival_rate: 0, mvp_count: 0, profit_generated: 0,
    material_return_rate: 0,
  };

  // Kills da semana (7 dias).
  const weekKills = await query(
    `SELECT COUNT(*)::int AS n FROM kill_logs
      WHERE killer_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
    [memberId]
  );

  // Última kill (data + vítima).
  const lastKill = await query(
    `SELECT victim_name, victim_faction, spot, created_at
       FROM kill_logs WHERE killer_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [memberId]
  );

  // Posição no leaderboard all-time.
  const rank = await query(
    `WITH ranked AS (
       SELECT killer_id, COUNT(*) AS kills,
              RANK() OVER (ORDER BY COUNT(*) DESC) AS rnk
         FROM kill_logs GROUP BY killer_id
     )
     SELECT rnk FROM ranked WHERE killer_id = $1`,
    [memberId]
  );

  return {
    memberId,
    saidasTotal:        Number(row.saidas_total) || 0,
    wins:               Number(row.wins) || 0,
    losses:             Number(row.losses) || 0,
    draws:              Number(row.draws) || 0,
    killsTotal:         Number(row.kills_total) || 0,
    deathsTotal:        Number(row.deaths_total) || 0,
    kdRatio:            Number(row.kd_ratio) || 0,
    survivalRate:       Number(row.survival_rate) || 0,
    mvpCount:           Number(row.mvp_count) || 0,
    profitGenerated:    Number(row.profit_generated) || 0,
    materialReturnRate: Number(row.material_return_rate) || 0,
    weekKills:          weekKills.rows[0]?.n || 0,
    lastKill:           lastKill.rows[0] || null,
    killRank:           rank.rows[0]?.rnk || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL — fornecido / devolvido / perdido / consumido
// ─────────────────────────────────────────────────────────────────────────────

async function getMaterialProfile(discordId) {
  const memberId = await _memberId(discordId);
  if (!memberId) return null;

  // Agrega valor por direcção a partir dos materiais ligados a participações.
  const agg = await query(`
    SELECT om.direction,
           SUM(om.quantity)::int AS qty,
           SUM(om.quantity * COALESCE(i.estimated_value, 0))::numeric AS value
      FROM operation_materials om
      JOIN items i ON i.id = om.item_id
     WHERE om.member_id = $1
     GROUP BY om.direction`,
    [memberId]
  );
  const byDir = agg.rows.reduce((a, r) => {
    a[r.direction] = { qty: Number(r.qty) || 0, value: Number(r.value) || 0 };
    return a;
  }, {});

  const fornecido = byDir.fornecido || { qty: 0, value: 0 };
  const devolvido = byDir.devolvido || { qty: 0, value: 0 };
  const perdido   = byDir.perdido   || { qty: 0, value: 0 };
  const consumido = byDir.consumido || { qty: 0, value: 0 };

  const returnRate = fornecido.value > 0
    ? (devolvido.value / fornecido.value) * 100
    : 0;
  const lossRate = fornecido.value > 0
    ? (perdido.value / fornecido.value) * 100
    : 0;

  // Top 3 itens fornecidos.
  const topItems = await query(`
    SELECT i.name, SUM(om.quantity)::int AS qty
      FROM operation_materials om
      JOIN items i ON i.id = om.item_id
     WHERE om.member_id = $1 AND om.direction = 'fornecido'
     GROUP BY i.name
     ORDER BY qty DESC LIMIT 3`,
    [memberId]
  );

  return {
    memberId,
    fornecido, devolvido, perdido, consumido,
    returnRate, lossRate,
    topItems: topItems.rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LUCRO / SPOTS PESSOAIS
// ─────────────────────────────────────────────────────────────────────────────

async function getProfitProfile(discordId) {
  const memberId = await _memberId(discordId);
  if (!memberId) return null;

  // Lucro total a partir de member_saida_stats + breakdown por spot via
  // participações ligadas às saídas.
  const stats = await query(
    `SELECT profit_generated, saidas_total FROM member_saida_stats WHERE member_id = $1`,
    [memberId]
  );
  const totals = stats.rows[0] || { profit_generated: 0, saidas_total: 0 };

  // Top spots onde este membro gerou mais lucro (aproximação: net_value da saída
  // dividido pelo número de participantes com delta positivo — simples e justo).
  const spots = await query(`
    SELECT o.spot,
           COUNT(DISTINCT o.id)::int AS saidas,
           SUM(COALESCE(op.net_material_delta, 0))::numeric AS net_delta,
           SUM(CASE WHEN o.result = 'vitoria' THEN 1 ELSE 0 END)::int AS wins,
           SUM(COALESCE(op.kills, 0))::int AS kills
      FROM operation_participants op
      JOIN operations o ON o.id = op.operation_id
     WHERE op.member_id = $1 AND o.status = 'concluida' AND o.spot IS NOT NULL AND o.spot <> ''
     GROUP BY o.spot
     ORDER BY net_delta DESC NULLS LAST, saidas DESC
     LIMIT 5`,
    [memberId]
  );

  // Últimas 5 saídas do membro.
  const recent = await query(`
    SELECT o.id, o.date, o.spot, o.result, o.operation_type,
           op.kills, op.died, op.net_material_delta, op.mvp_flag
      FROM operation_participants op
      JOIN operations o ON o.id = op.operation_id
     WHERE op.member_id = $1 AND o.status = 'concluida'
     ORDER BY o.date DESC, o.id DESC
     LIMIT 5`,
    [memberId]
  );

  return {
    memberId,
    profitGenerated: Number(totals.profit_generated) || 0,
    saidasTotal:     Number(totals.saidas_total) || 0,
    topSpots:        spots.rows,
    recentSaidas:    recent.rows,
  };
}

module.exports = { getCombatProfile, getMaterialProfile, getProfitProfile };
