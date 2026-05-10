'use strict';
/**
 * Sistema de PvP Rating para saídas.
 *
 * Responsabilidades:
 *   - calcular tier a partir do rating
 *   - calcular delta por sessão (kills, sobrevivência, vitória, MVP)
 *   - bónus de consistência a partir de member_saida_stats
 *   - aplicar mudanças de rating (UPSERT incremental)
 *   - decay semanal para membros inactivos
 *   - leaderboard com join à tabela members
 */

const { query } = require('../db');
const { log } = require('../logger');
const {
  BASE_RATING,
  RATING_FLOOR,
  WEEKLY_DECAY,
  TIERS,
  DELTA_KILL,
  DELTA_SURVIVED,
  DELTA_DEATH,
  DELTA_VICTORY,
  DELTA_DEFEAT,
  DELTA_MVP,
} = require('./_constants');

function calculateTier(rating) {
  const r = Number.isFinite(Number(rating)) ? Number(rating) : BASE_RATING;
  for (const tier of TIERS) {
    if (r >= tier.min) return tier;
  }
  return TIERS[TIERS.length - 1];
}

function calculateSessionDelta({ kills = 0, survived = false, victory = false, mvp = false, hadFight = false }) {
  if (!hadFight) return 0;
  let delta = 0;
  delta += (Number(kills) || 0) * DELTA_KILL;
  if (survived) delta += DELTA_SURVIVED;
  else delta += DELTA_DEATH;
  if (victory === true) delta += DELTA_VICTORY;
  else if (victory === false) delta += DELTA_DEFEAT;
  if (mvp) delta += DELTA_MVP;
  return delta;
}

async function calculateConsistencyBonus(memberId) {
  const res = await query(
    `SELECT wins, saidas_total, survival_rate
       FROM member_saida_stats
      WHERE member_id = $1`,
    [memberId]
  );
  const row = res.rows[0];
  if (!row) return 0;
  let bonus = 0;
  // Bónus por winrate elevado (> 60%)
  const saidas = Number(row.saidas_total) || 1;
  const winRate = Number(row.wins) / saidas;
  if (winRate >= 0.6) bonus += 5;
  // Bónus por sobrevivência consistente (> 80%)
  const survival = Number(row.survival_rate) || 0;
  if (survival >= 80) bonus += 5;
  return bonus;
}

async function applyRatingChange(memberId, sessionResult) {
  const { kills = 0, survived = false, victory = false, mvp = false, hadFight = false } = sessionResult || {};
  const delta = calculateSessionDelta({ kills, survived, victory, mvp, hadFight });
  const consistency = await calculateConsistencyBonus(memberId);
  const totalDelta = delta + consistency;

  const res = await query(
    `INSERT INTO member_pvp_ratings
       (member_id, rating, total_sessions, tier, best_rating, worst_rating,
        streak_current, streak_type, last_session_at, updated_at)
     VALUES ($1, $2, 1, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (member_id) DO UPDATE SET
       rating = GREATEST($8, member_pvp_ratings.rating + EXCLUDED.rating - 1000),
       total_sessions = member_pvp_ratings.total_sessions + 1,
       tier = $3,
       best_rating = GREATEST(member_pvp_ratings.best_rating, member_pvp_ratings.rating + EXCLUDED.rating - 1000),
       worst_rating = LEAST(member_pvp_ratings.worst_rating, member_pvp_ratings.rating + EXCLUDED.rating - 1000),
       streak_current = $6,
       streak_type = $7,
       last_session_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      memberId,
      BASE_RATING + totalDelta,
      calculateTier(0).tier, // placeholder — recalculado abaixo
      BASE_RATING + totalDelta,
      BASE_RATING + totalDelta,
      0,
      null,
      RATING_FLOOR,
    ]
  );

  let row = res.rows[0];
  if (!row) return null;

  // Recalcula tier e streak com base no rating actual
  const newRating = Number(row.rating);
  const tierMeta = calculateTier(newRating);

  // Streak lógica: se delta > 0 → win streak, senão loss streak
  const prevStreakType = row.streak_type;
  const prevStreak = Number(row.streak_current) || 0;
  let streakCurrent = 0;
  let streakType = null;
  if (totalDelta > 0) {
    streakType = 'win';
    streakCurrent = prevStreakType === 'win' ? prevStreak + 1 : 1;
  } else if (totalDelta < 0) {
    streakType = 'loss';
    streakCurrent = prevStreakType === 'loss' ? prevStreak + 1 : 1;
  }

  const upd = await query(
    `UPDATE member_pvp_ratings
        SET tier = $1,
            streak_current = $2,
            streak_type = $3
      WHERE member_id = $4
      RETURNING *`,
    [tierMeta.tier, streakCurrent, streakType, memberId]
  );
  row = upd.rows[0] || row;
  log(`[PVP-RATING] member=${memberId} delta=${totalDelta} rating=${row.rating} tier=${row.tier}`);
  return row;
}

async function applyWeeklyDecay() {
  const res = await query(
    `UPDATE member_pvp_ratings
        SET rating = GREATEST($1, rating - $2),
            updated_at = NOW()
      WHERE last_session_at < NOW() - INTERVAL '7 days'
        AND rating > $1
      RETURNING member_id, rating`,
    [RATING_FLOOR, WEEKLY_DECAY]
  );
  if (res.rowCount > 0) {
    log(`[PVP-RATING] Decay aplicado a ${res.rowCount} membros inactivos.`);
  }
  return { decayed: res.rowCount || 0, rows: res.rows };
}

async function getLeaderboard(limit = 20) {
  const res = await query(
    `SELECT mpr.*, m.display_name, m.discord_id, m.role
       FROM member_pvp_ratings mpr
       JOIN members m ON m.id = mpr.member_id
      ORDER BY mpr.rating DESC, mpr.total_sessions DESC
      LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function getRating(memberId) {
  const res = await query('SELECT * FROM member_pvp_ratings WHERE member_id = $1', [memberId]);
  if (res.rows[0]) return res.rows[0];
  return {
    member_id: memberId,
    rating: BASE_RATING,
    total_sessions: 0,
    tier: calculateTier(BASE_RATING).tier,
    best_rating: BASE_RATING,
    worst_rating: BASE_RATING,
    streak_current: 0,
    streak_type: null,
    last_session_at: null,
  };
}

module.exports = {
  BASE_RATING,
  RATING_FLOOR,
  TIERS,
  calculateTier,
  calculateSessionDelta,
  calculateConsistencyBonus,
  applyRatingChange,
  applyWeeklyDecay,
  getLeaderboard,
  getRating,
};
