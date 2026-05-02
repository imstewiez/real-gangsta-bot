'use strict';
const { query } = require('../db');

async function create({ weekStart, weekEnd, winnerMemberId, hybridScore, metricsJson = {} }) {
  const res = await query(
    `INSERT INTO weekly_prizes (week_start, week_end, winner_member_id, hybrid_score, metrics_json)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (week_start) DO UPDATE SET
       winner_member_id = EXCLUDED.winner_member_id,
       hybrid_score = EXCLUDED.hybrid_score,
       metrics_json = EXCLUDED.metrics_json,
       prize_status = CASE WHEN weekly_prizes.prize_status IN ('por_definir', 'cancelado')
                           THEN 'por_definir' ELSE weekly_prizes.prize_status END,
       updated_at = NOW()
     RETURNING *`,
    [weekStart, weekEnd, winnerMemberId, hybridScore, JSON.stringify(metricsJson)]
  );
  return res.rows[0];
}

async function findByWeek(weekStart) {
  const res = await query(
    `SELECT wp.*, m.display_name AS winner_name, m.discord_id AS winner_discord_id
     FROM weekly_prizes wp
     JOIN members m ON m.id = wp.winner_member_id
     WHERE wp.week_start = $1`,
    [weekStart]
  );
  return res.rows[0] || null;
}

async function findByStatus(status, { limit = 20 } = {}) {
  const res = await query(
    `SELECT wp.*, m.display_name AS winner_name, m.discord_id AS winner_discord_id
     FROM weekly_prizes wp
     JOIN members m ON m.id = wp.winner_member_id
     WHERE wp.prize_status = $1
     ORDER BY wp.week_start DESC
     LIMIT $2`,
    [status, limit]
  );
  return res.rows;
}

async function findRecent({ limit = 10 } = {}) {
  const res = await query(
    `SELECT wp.*, m.display_name AS winner_name, m.discord_id AS winner_discord_id
     FROM weekly_prizes wp
     JOIN members m ON m.id = wp.winner_member_id
     ORDER BY wp.week_start DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function definePrize(weekStart, { prizeDescription, definedBy, notes = '' }) {
  const res = await query(
    `UPDATE weekly_prizes
     SET prize_description = $1, defined_by = $2, defined_at = NOW(),
         prize_status = CASE WHEN prize_status = 'por_definir' THEN 'definido' ELSE 'alterado' END,
         notes = COALESCE(notes, '') || E'\n' || $3,
         updated_at = NOW()
     WHERE week_start = $4
     RETURNING *`,
    [prizeDescription, definedBy, notes, weekStart]
  );
  return res.rows[0] || null;
}

async function markDelivered(weekStart, { deliveredBy, notes = '' }) {
  const res = await query(
    `UPDATE weekly_prizes
     SET delivered_by = $1, delivered_at = NOW(), prize_status = 'entregue',
         notes = COALESCE(notes, '') || E'\n' || $2,
         updated_at = NOW()
     WHERE week_start = $3
     RETURNING *`,
    [deliveredBy, notes, weekStart]
  );
  return res.rows[0] || null;
}

async function cancelPrize(weekStart, { reason, _cancelledBy }) {
  const res = await query(
    `UPDATE weekly_prizes
     SET prize_status = 'cancelado', notes = COALESCE(notes, '') || E'\nCancelado: ' || $1,
         updated_at = NOW()
     WHERE week_start = $2
     RETURNING *`,
    [reason, weekStart]
  );
  return res.rows[0] || null;
}

module.exports = {
  create,
  findByWeek,
  findByStatus,
  findRecent,
  definePrize,
  markDelivered,
  cancelPrize,
};
