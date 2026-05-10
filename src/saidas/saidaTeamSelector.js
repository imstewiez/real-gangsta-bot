'use strict';
/**
 * Seleção inteligente de equipas para saídas.
 *
 * Responsabilidades:
 *   - separar roles protegidos (chefia, patrao_di_zona)
 *   - score compostos para competidores
 *   - persistir participant_type + selection_score
 */

const { query } = require('../db');
const { log } = require('../logger');
const {
  MAX_FIGHTERS,
  W_PVP_RATING,
  W_KD_RATIO,
  W_MVP,
  W_DELIVERY,
  W_SURVIVAL,
  WEAPON_BONUS_PCT,
  MATERIAL_NORMALIZATION,
  PROTECTED_ROLES,
  BASE_RATING,
} = require('./_constants');
const { saidaRepo } = require('../repositories');

async function _loadParticipantStats(memberIds) {
  if (!memberIds?.length) return new Map();
  const res = await query(
    `SELECT m.id AS member_id,
            COALESCE(mpr.rating, $1)::int AS pvp_rating,
            COALESCE(mss.kd_ratio, 0)::numeric AS kd_ratio,
            COALESCE(mss.mvp_count, 0)::int AS mvp_count,
            COALESCE(mss.survival_rate, 0)::numeric AS survival_rate,
            COALESCE((
              SELECT SUM(im.quantity * COALESCE(i.estimated_value, 0))
                FROM inventory_movements im
                LEFT JOIN items i ON i.id = im.item_id
               WHERE im.member_id = m.id
                 AND im.movement_type IN ('entrega_bairrista', 'venda_bairrista', 'entrega_oficial')
            ), 0)::numeric AS delivery_value
       FROM members m
       LEFT JOIN member_pvp_ratings mpr ON mpr.member_id = m.id
       LEFT JOIN member_saida_stats mss ON mss.member_id = m.id
      WHERE m.id = ANY($2::int[])`,
    [BASE_RATING, memberIds]
  );
  const map = new Map();
  for (const r of res.rows) {
    map.set(r.member_id, {
      pvp_rating: Number(r.pvp_rating) || BASE_RATING,
      kd_ratio: Number(r.kd_ratio) || 0,
      mvp_count: Number(r.mvp_count) || 0,
      survival_rate: Number(r.survival_rate) || 0,
      delivery_value: Number(r.delivery_value) || 0,
    });
  }
  return map;
}

function _scoreParticipant(p, stats) {
  const s = stats || {
    pvp_rating: BASE_RATING,
    kd_ratio: 0,
    mvp_count: 0,
    survival_rate: 0,
    delivery_value: 0,
  };

  const score =
    s.pvp_rating * W_PVP_RATING +
    s.kd_ratio * 300 * W_KD_RATIO +
    s.mvp_count * 50 * W_MVP +
    (s.delivery_value / MATERIAL_NORMALIZATION) * 100 * W_DELIVERY +
    s.survival_rate * W_SURVIVAL;

  const weaponBonus = p.own_weapon ? 1 + WEAPON_BONUS_PCT : 1;
  return score * weaponBonus;
}

async function selectTeams(saidaId) {
  const participants = await saidaRepo.getParticipants(saidaId);
  if (!participants?.length) {
    return { fighters: [], workers: [], scored: [] };
  }

  const protectedList = participants.filter(p => PROTECTED_ROLES.has(p.member_role));
  const competitive = participants.filter(p => !PROTECTED_ROLES.has(p.member_role));

  const maxFighters = MAX_FIGHTERS;
  const remainingSlots = Math.max(0, maxFighters - protectedList.length);

  const memberIds = competitive.map(p => p.member_id).filter(Boolean);
  const statsMap = await _loadParticipantStats(memberIds);

  const scoredCompetitive = competitive.map(p => ({
    participant: p,
    score: _scoreParticipant(p, statsMap.get(p.member_id)),
    stats: statsMap.get(p.member_id) || null,
  }));

  scoredCompetitive.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = new Date(a.participant.created_at || 0).getTime();
    const tb = new Date(b.participant.created_at || 0).getTime();
    return ta - tb;
  });

  const competitiveWinners = scoredCompetitive.slice(0, remainingSlots);
  const competitiveLosers = scoredCompetitive.slice(remainingSlots);

  const fighters = [
    ...protectedList.map(p => ({ participant: p, score: Infinity, stats: null, protected: true })),
    ...competitiveWinners.map(s => ({ ...s, protected: false })),
  ];
  const workers = competitiveLosers.map(s => ({ ...s, protected: false }));

  const scored = [...fighters, ...workers];
  return { fighters, workers, scored };
}

async function persistSelection(saidaId, selection) {
  const { fighters = [], workers = [] } = selection || {};
  const { queryWithTransaction } = require('../db');

  await queryWithTransaction(async client => {
    for (const f of fighters) {
      const p = f.participant;
      const score = f.protected ? null : Number(f.score).toFixed(2);
      await client.query(
        `UPDATE operation_participants
            SET participant_type = 'caracterizado',
                selection_score = COALESCE($1, selection_score),
                pvp_rating_at_session = COALESCE($2, pvp_rating_at_session)
          WHERE operation_id = $3 AND member_id = $4`,
        [score, f.stats?.pvp_rating || null, saidaId, p.member_id]
      );
    }
    for (const w of workers) {
      const p = w.participant;
      const score = Number(w.score).toFixed(2);
      await client.query(
        `UPDATE operation_participants
            SET participant_type = 'trabalhador',
                own_weapon = FALSE,
                brought_own_material = FALSE,
                received_org_material = FALSE,
                weapon_item_id = NULL,
                selection_score = $1,
                pvp_rating_at_session = COALESCE($2, pvp_rating_at_session)
          WHERE operation_id = $3 AND member_id = $4`,
        [score, w.stats?.pvp_rating || null, saidaId, p.member_id]
      );
    }
    await client.query(
      `UPDATE operations
          SET team_selected_at = NOW(),
              fighters_count = $1,
              updated_at = NOW()
        WHERE id = $2`,
      [fighters.length, saidaId]
    );
  });

  log(`[TEAM-SELECTOR] Saída #${saidaId}: ${fighters.length} fighters, ${workers.length} workers.`);
  return { fightersCount: fighters.length, workersCount: workers.length };
}

module.exports = {
  selectTeams,
  persistSelection,
  _loadParticipantStats,
  _scoreParticipant,
  MAX_FIGHTERS,
};
