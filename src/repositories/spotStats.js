'use strict';
/**
 * Repositório de spot_stats — agregações por spot, actualizadas
 * incrementalmente no fecho de cada saída.
 */
const { query } = require('../db');

async function getBySpot(spot) {
  const res = await query('SELECT * FROM spot_stats WHERE spot = $1', [spot]);
  return res.rows[0] || null;
}

async function listTop(orderBy = 'total_net_value', limit = 10) {
  const validCols = new Set([
    'total_net_value',
    'total_gross_value',
    'total_saidas',
    'wins',
    'losses',
    'our_kills',
    'our_deaths',
  ]);
  const col = validCols.has(orderBy) ? orderBy : 'total_net_value';
  const res = await query(
    `SELECT s.*, m.display_name AS best_member_name
       FROM spot_stats s
       LEFT JOIN members m ON m.id = s.best_member_id
      ORDER BY s.${col} DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function listAll() {
  const res = await query('SELECT * FROM spot_stats ORDER BY total_saidas DESC');
  return res.rows;
}

/**
 * Actualização incremental para uma saída fechada.
 * Aplica delta (+=) a todos os campos relevantes do spot.
 */
async function applyIncrement({ spot, result, supplied, returned, lost, gross, net, kills, deaths, bestMemberId }) {
  if (!spot) return null;
  const isWin = result === 'vitoria' ? 1 : 0;
  const isLoss = result === 'derrota' ? 1 : 0;
  const isDraw = result === 'empate' ? 1 : 0;
  const noConflict = result === 'sem_conflito' ? 1 : 0;

  const res = await query(
    `INSERT INTO spot_stats
       (spot, total_saidas, wins, losses, draws, no_conflict_runs,
        total_supplied_value, total_returned_value, total_lost_value,
        total_gross_value, total_net_value, our_kills, our_deaths,
        best_member_id, updated_at)
     VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
     ON CONFLICT (spot) DO UPDATE SET
       total_saidas         = spot_stats.total_saidas + 1,
       wins                 = spot_stats.wins + EXCLUDED.wins,
       losses               = spot_stats.losses + EXCLUDED.losses,
       draws                = spot_stats.draws + EXCLUDED.draws,
       no_conflict_runs     = spot_stats.no_conflict_runs + EXCLUDED.no_conflict_runs,
       total_supplied_value = spot_stats.total_supplied_value + EXCLUDED.total_supplied_value,
       total_returned_value = spot_stats.total_returned_value + EXCLUDED.total_returned_value,
       total_lost_value     = spot_stats.total_lost_value + EXCLUDED.total_lost_value,
       total_gross_value    = spot_stats.total_gross_value + EXCLUDED.total_gross_value,
       total_net_value      = spot_stats.total_net_value + EXCLUDED.total_net_value,
       our_kills            = spot_stats.our_kills + EXCLUDED.our_kills,
       our_deaths           = spot_stats.our_deaths + EXCLUDED.our_deaths,
       best_member_id       = COALESCE(EXCLUDED.best_member_id, spot_stats.best_member_id),
       updated_at           = NOW()
     RETURNING *`,
    [
      spot,
      isWin,
      isLoss,
      isDraw,
      noConflict,
      supplied || 0,
      returned || 0,
      lost || 0,
      gross || 0,
      net || 0,
      kills || 0,
      deaths || 0,
      bestMemberId || null,
    ]
  );
  return res.rows[0];
}

module.exports = { getBySpot, listTop, listAll, applyIncrement };
