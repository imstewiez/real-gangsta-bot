'use strict';
/**
 * Repositório de kills — tabela `kill_logs` (renomeada de cemetery_kills).
 * Kills podem estar ligadas a saídas (saida_id) ou ser standalone.
 */
const { query } = require('../db');
const { triggerRecalc } = require('../lib/webAppClient');

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
  // Dispara recalc dos rankings na web app — fire-and-forget
  triggerRecalc('kill_recorded').catch(() => {});

  return res.rows[0];
}

async function getLeaderboard(limit = 10, windowDays = null) {
  const params = [limit];
  let window = '';
  if (windowDays) {
    params.push(parseInt(windowDays, 10) + ' days');
    window = `AND k.created_at >= NOW() - $${params.length}::interval`;
  }
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

async function countKillsToday(killerId) {
  const res = await query('SELECT COUNT(*)::int AS n FROM kill_logs WHERE killer_id = $1 AND date = CURRENT_DATE', [
    killerId,
  ]);
  return res.rows[0]?.n || 0;
}

async function totalOrgKills(windowDays = null) {
  const params = [];
  let window = '';
  if (windowDays) {
    params.push(parseInt(windowDays, 10) + ' days');
    window = 'WHERE created_at >= NOW() - $1::interval';
  }
  const res = await query(`SELECT COUNT(*)::int AS n FROM kill_logs ${window}`, params);
  return res.rows[0]?.n || 0;
}

/**
 * Total de kills da Ballas Gang incluindo operation_participants (saídas) +
 * kill_logs (/kill events). Para display "Kills da Ballas Gang all-time" —
 * totalOrgKills sozinho só conta /kill e deixa de fora as saídas.
 */
async function totalOrgKillsAllSources(windowDays = null) {
  const params = [];
  let logsWindow = '';
  let opsWindow = '';
  if (windowDays) {
    const interval = `${parseInt(windowDays, 10)} days`;
    params.push(interval);
    logsWindow = 'WHERE created_at >= NOW() - $1::interval';
    opsWindow = 'WHERE updated_at >= NOW() - $1::interval';
  }
  const r = await query(
    `
    SELECT
      (SELECT COUNT(*) FROM kill_logs ${logsWindow})::int AS from_logs,
      (SELECT COALESCE(SUM(kills), 0) FROM operation_participants ${opsWindow})::int AS from_saidas
  `,
    params
  );
  const row = r.rows[0] || {};
  return (row.from_logs || 0) + (row.from_saidas || 0);
}

module.exports = {
  recordKill,
  getLeaderboard,
  getRecent,
  countKillsBySaida,
  countKillsByMember,
  countKillsToday,
  totalOrgKills,
  totalOrgKillsAllSources,
};
