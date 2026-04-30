'use strict';
const { query } = require('../db');

async function calculate(memberId) {
  const r = await query(
    `SELECT
      COALESCE((SELECT COUNT(*) FILTER (WHERE status='approved') * 100.0 / NULLIF(COUNT(*),0)
        FROM inventory_delivery_requests WHERE member_id = $1), 0) as delivery_rate,
      COALESCE((SELECT COUNT(*) FILTER (WHERE status='concluida') * 100.0 / NULLIF(COUNT(*),0)
        FROM operation_participants sp JOIN operations s ON s.id = sp.operation_id WHERE sp.member_id = $1), 0) as saida_rate,
      COALESCE((SELECT COUNT(*) FILTER (WHERE status='pending') * 100.0 / NULLIF(COUNT(*),0)
        FROM inventory_delivery_requests WHERE member_id = $1), 0) as pending_ratio,
      COALESCE((SELECT COUNT(*) FILTER (WHERE status='rejected') * 100.0 / NULLIF(COUNT(*),0)
        FROM inventory_delivery_requests WHERE member_id = $1), 0) as rejection_rate`,
    [memberId]
  );
  const stats = r.rows[0];
  const reliability =
    stats.delivery_rate * 0.3 +
    stats.saida_rate * 0.3 +
    (100 - stats.pending_ratio) * 0.2 +
    (100 - stats.rejection_rate) * 0.2;
  await query(
    `INSERT INTO member_reputation (member_id, reliability_score, regular_delivery_rate, saida_participation_rate, pending_ratio, rejection_rate)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (member_id) DO UPDATE SET
       reliability_score = EXCLUDED.reliability_score,
       regular_delivery_rate = EXCLUDED.regular_delivery_rate,
       saida_participation_rate = EXCLUDED.saida_participation_rate,
       pending_ratio = EXCLUDED.pending_ratio,
       rejection_rate = EXCLUDED.rejection_rate,
       calculated_at = NOW()`,
    [memberId, reliability.toFixed(2), stats.delivery_rate, stats.saida_rate, stats.pending_ratio, stats.rejection_rate]
  );
  return { reliability, ...stats };
}

async function get(memberId) {
  const res = await query('SELECT * FROM member_reputation WHERE member_id = $1', [memberId]);
  return res.rows[0] || null;
}

module.exports = { calculate, get };
