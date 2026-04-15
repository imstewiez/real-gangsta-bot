'use strict';
/**
 * Repositório de member_saida_stats — agregações de performance em saídas
 * por membro, actualizadas incrementalmente no fecho.
 */
const { query } = require('../db');

async function getByMember(memberId) {
  const res = await query(`SELECT * FROM member_saida_stats WHERE member_id = $1`, [memberId]);
  return res.rows[0] || null;
}

async function listTop(orderBy = 'kills_total', limit = 10) {
  const validCols = new Set([
    'saidas_total', 'wins', 'kills_total', 'deaths_total',
    'kd_ratio', 'profit_generated', 'survival_rate', 'mvp_count',
    'material_return_rate',
  ]);
  const col = validCols.has(orderBy) ? orderBy : 'kills_total';
  const res = await query(
    `SELECT mss.*, m.display_name, m.discord_id
       FROM member_saida_stats mss
       JOIN members m ON m.id = mss.member_id
      ORDER BY mss.${col} DESC, m.display_name
      LIMIT $1`,
    [limit]
  );
  return res.rows;
}

/**
 * Aplica delta a um membro. Ratios (kd, survival, material return) são
 * recalculados no final a partir dos totais, não acumulados.
 */
async function applyIncrement({ memberId, result, kills, deaths, profit, returnedValue, suppliedValue, survived, mvp }) {
  if (!memberId) return null;
  const isWin = result === 'vitoria' ? 1 : 0;
  const isLoss = result === 'derrota' ? 1 : 0;
  const isDraw = result === 'empate' ? 1 : 0;

  const res = await query(
    `INSERT INTO member_saida_stats
       (member_id, saidas_total, wins, losses, draws,
        kills_total, deaths_total, kd_ratio,
        profit_generated, material_return_rate, survival_rate,
        mvp_count, updated_at)
     VALUES ($1, 1, $2, $3, $4, $5, $6, 0, $7, 0, 0, $8, NOW())
     ON CONFLICT (member_id) DO UPDATE SET
       saidas_total     = member_saida_stats.saidas_total + 1,
       wins             = member_saida_stats.wins + EXCLUDED.wins,
       losses           = member_saida_stats.losses + EXCLUDED.losses,
       draws            = member_saida_stats.draws + EXCLUDED.draws,
       kills_total      = member_saida_stats.kills_total + EXCLUDED.kills_total,
       deaths_total     = member_saida_stats.deaths_total + EXCLUDED.deaths_total,
       profit_generated = member_saida_stats.profit_generated + EXCLUDED.profit_generated,
       mvp_count        = member_saida_stats.mvp_count + EXCLUDED.mvp_count,
       updated_at       = NOW()
     RETURNING *`,
    [memberId, isWin, isLoss, isDraw, kills || 0, deaths || 0, profit || 0, mvp ? 1 : 0]
  );
  const row = res.rows[0];
  if (!row) return null;

  // Recalcula ratios com os totais actualizados.
  const kd = row.deaths_total > 0 ? Number(row.kills_total) / Number(row.deaths_total) : Number(row.kills_total);
  const survivalRate = row.saidas_total > 0 ? ((row.saidas_total - row.deaths_total) / row.saidas_total) * 100 : 0;
  // material_return_rate é aproximação (última saída) — afinável.
  const returnRate = suppliedValue > 0 ? (returnedValue / suppliedValue) * 100 : null;

  const upd = await query(
    `UPDATE member_saida_stats
        SET kd_ratio = $1,
            survival_rate = $2,
            material_return_rate = COALESCE($3, material_return_rate)
      WHERE member_id = $4
      RETURNING *`,
    [kd.toFixed(2), survivalRate.toFixed(2), returnRate !== null ? returnRate.toFixed(2) : null, memberId]
  );
  return upd.rows[0] || row;
}

module.exports = { getByMember, listTop, applyIncrement };
