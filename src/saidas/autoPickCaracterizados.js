'use strict';
/**
 * autoPickCaracterizados — algoritmo que escolhe quais participantes pending
 * vão como caracterizados (os N melhores) e quais como trabalhadores (os
 * restantes), usando um score composto.
 *
 * Score (maior = mais prioritário para caracterizado):
 *
 *   score = kd * W_KD
 *         + mvp_count * W_MVP
 *         + survival_rate * W_SURV
 *         + (own_weapon ? W_WEAPON : 0)
 *         + material_normalized * W_MATERIAL
 *
 * Pesos:
 *   W_KD       = 3.0   — dominante (skill em PvP)
 *   W_MVP      = 1.0   — histórico de destaque
 *   W_SURV     = 1.0   — não morre muito (fator disciplinar)
 *   W_WEAPON   = 2.0   — tem arma própria (poupa à org + mostra preparação)
 *   W_MATERIAL = 0.5   — contribui com material (menor peso por pedido do user)
 *
 * Para pessoal NOVO (sem saídas), score = W_WEAPON apenas se tem arma própria,
 * senão 0 — ficam no final do ranking mas não são excluídos (permite rotação).
 *
 * Ties: preserve ordem de inscrição (mais cedo ganha), usa p.created_at.
 */

const { query } = require('../db');

const W_KD = 3.0;
const W_MVP = 1.0;
const W_SURV = 1.0;
const W_WEAPON = 2.0;
const W_MATERIAL = 0.5;

const MATERIAL_NORMALIZATION = 100000; // "material_value" em €; 100k € = 1.0 normalizado

async function _loadScoringData(memberIds) {
  if (!memberIds.length) return new Map();
  const res = await query(
    `SELECT m.id AS member_id,
            COALESCE(mss.kd_ratio, 0)::numeric AS kd_ratio,
            COALESCE(mss.mvp_count, 0)::int AS mvp_count,
            COALESCE(mss.survival_rate, 0)::numeric AS survival_rate,
            COALESCE((
              SELECT SUM(im.quantity * COALESCE(i.estimated_value, 0))
                FROM inventory_movements im
                LEFT JOIN items i ON i.id = im.item_id
               WHERE im.member_id = m.id
                 AND im.movement_type IN ('entrega_bairrista', 'venda_bairrista', 'entrega_oficial')
            ), 0)::numeric AS material_value
       FROM members m
       LEFT JOIN member_saida_stats mss ON mss.member_id = m.id
      WHERE m.id = ANY($1::int[])`,
    [memberIds]
  );
  const map = new Map();
  for (const r of res.rows) {
    map.set(r.member_id, {
      kd_ratio: Number(r.kd_ratio) || 0,
      mvp_count: Number(r.mvp_count) || 0,
      survival_rate: Number(r.survival_rate) || 0,
      material_value: Number(r.material_value) || 0,
    });
  }
  return map;
}

function _scoreParticipant(p, stats) {
  const s = stats || { kd_ratio: 0, mvp_count: 0, survival_rate: 0, material_value: 0 };
  const weaponBonus = p.own_weapon ? W_WEAPON : 0;
  const materialNorm = Math.min(1.0, s.material_value / MATERIAL_NORMALIZATION);
  return s.kd_ratio * W_KD + s.mvp_count * W_MVP + s.survival_rate * W_SURV + weaponBonus + materialNorm * W_MATERIAL;
}

/**
 * Classifica participants por score e devolve:
 *   { caracterizados: [...], trabalhadores: [...], scored: [{participant, score}...] }
 *
 * @param {Array} participants — rows de operation_participants (precisam de
 *                               `member_id` e opcionalmente `own_weapon`)
 * @param {number} maxCaracterizados — quantos vão ser caracterizados
 */
async function autoPickCaracterizados(participants, maxCaracterizados) {
  if (!participants?.length) return { caracterizados: [], trabalhadores: [], scored: [] };
  const memberIds = participants.map(p => p.member_id).filter(Boolean);
  const statsMap = await _loadScoringData(memberIds);

  const scored = participants.map(p => ({
    participant: p,
    score: _scoreParticipant(p, statsMap.get(p.member_id)),
    stats: statsMap.get(p.member_id) || null,
  }));

  // Sort: score DESC, tiebreak by created_at ASC (inscrição mais cedo ganha).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = new Date(a.participant.created_at || 0).getTime();
    const tb = new Date(b.participant.created_at || 0).getTime();
    return ta - tb;
  });

  const caracterizados = scored.slice(0, maxCaracterizados).map(s => s.participant);
  const trabalhadores = scored.slice(maxCaracterizados).map(s => s.participant);

  return { caracterizados, trabalhadores, scored };
}

module.exports = { autoPickCaracterizados, _scoreParticipant };
