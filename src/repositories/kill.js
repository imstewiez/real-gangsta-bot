'use strict';
/**
 * Repositório de kills — tabela `kill_logs` (renomeada de cemetery_kills).
 * Kills podem estar ligadas a saídas (saida_id) ou ser standalone.
 */
const { query } = require('../db');

async function recordKill({
  killerId,
  victimName,
  victimDiscordId = null,
  victimFaction = '',
  spot = '',
  context = '',
  saidaId = null,
  date = null,
  notes = '',
  confirmedBy = null,
  createdBy,
}) {
  const res = await query(
    `INSERT INTO kill_logs
       (killer_id, victim_name, victim_discord_id, victim_faction, spot,
        context, saida_id, date, notes, confirmed_by, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE), $9, $10, $11)
     RETURNING *`,
    [killerId, victimName, victimDiscordId, victimFaction, spot, context, saidaId, date, notes, confirmedBy, createdBy]
  );
  return res.rows[0];
}

async function getLeaderboard(limit = 10, windowDays = null) {
  const params = [limit];
  const window = windowDays ? `AND k.created_at >= NOW() - INTERVAL '${parseInt(windowDays)} days'` : '';
  const res = await query(
    `
    SELECT m.display_name, m.discord_id, COUNT(*) as kills
    FROM kill_logs k
    JOIN members m ON m.id = k.killer_id
    WHERE 1=1 ${window}
    GROUP BY m.id, m.display_name, m.discord_id
    ORDER BY kills DESC, m.display_name
    LIMIT $1
  `,
    params
  );
  return res.rows.map(r => ({ ...r, kills: parseInt(r.kills) }));
}

async function getRecent(limit = 20) {
  const res = await query(
    `
    SELECT k.*, m.display_name as killer_name, m.discord_id as killer_discord_id
    FROM kill_logs k
    JOIN members m ON m.id = k.killer_id
    ORDER BY k.created_at DESC
    LIMIT $1
  `,
    [limit]
  );
  return res.rows;
}

async function countKillsBySaida(saidaId) {
  const res = await query('SELECT COUNT(*)::int AS n FROM kill_logs WHERE saida_id = $1', [saidaId]);
  return res.rows[0]?.n || 0;
}

async function countKillsByMember(memberId, weekStart = null, weekEnd = null) {
  let sql = 'SELECT COUNT(*)::int AS n FROM kill_logs WHERE killer_id = $1';
  const params = [memberId];
  if (weekStart && weekEnd) {
    sql += ' AND date >= $2 AND date <= $3';
    params.push(weekStart, weekEnd);
  }
  const res = await query(sql, params);
  return res.rows[0]?.n || 0;
}

async function totalOrgKills(windowDays = null) {
  const window = windowDays ? `WHERE created_at >= NOW() - INTERVAL '${parseInt(windowDays)} days'` : '';
  const res = await query(`SELECT COUNT(*)::int AS n FROM kill_logs ${window}`);
  return res.rows[0]?.n || 0;
}

module.exports = {
  recordKill,
  getLeaderboard,
  getRecent,
  countKillsBySaida,
  countKillsByMember,
  totalOrgKills,
};
