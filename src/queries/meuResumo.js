'use strict';
const { query } = require('../db');
const { brandEmbed, progressBar } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');

async function handle(interaction) {
  const discordId = interaction.user.id;
  const mr = await query('SELECT id, display_name, role FROM members WHERE discord_id = $1', [discordId]);
  if (!mr.rows.length) return safeReply(interaction, { content: '❌ Não encontrado.', flags: 64 });
  const m = mr.rows[0];

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);

  const [deliveries, sales, rank, pendingDel, pendingOrd, openSaidas, goals] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(quantity),0)::int as n FROM inventory_movements WHERE member_id=$1 AND movement_type IN ('entrega_bairrista','entrega_oficial') AND created_at>=$2`,
      [m.id, weekStart]
    ),
    query(
      `SELECT COALESCE(SUM(quantity),0)::int as n FROM inventory_movements WHERE member_id=$1 AND movement_type='venda_bairrista' AND created_at>=$2`,
      [m.id, weekStart]
    ),
    query(
      `SELECT position, hybrid_score FROM weekly_rankings WHERE member_id=$1 AND week_start=(SELECT MAX(week_start) FROM weekly_rankings) LIMIT 1`,
      [m.id]
    ),
    query(`SELECT COUNT(*)::int as n FROM inventory_delivery_requests WHERE member_id=$1 AND status='pending'`, [m.id]),
    query(
      `SELECT COUNT(*)::int as n FROM orders WHERE member_id=$1 AND status IN ('pending','received','under_review')`,
      [m.id]
    ),
    query(
      `SELECT COUNT(*)::int as n FROM operation_participants sp JOIN saidas s ON s.id=sp.saida_id WHERE sp.member_id=$1 AND s.status NOT IN ('concluida','cancelada')`,
      [m.id]
    ),
    query(
      `SELECT COALESCE(SUM(percent_complete),0)::numeric as pct FROM weekly_goal_progress p JOIN weekly_goals g ON g.id=p.goal_id WHERE g.week_start=$1 AND (g.scope='org' OR g.target_id=$2::text)`,
      [weekStart, m.id]
    ),
  ]);

  const embed = brandEmbed({
    title: `📊 Resumo de ${m.display_name}`,
    description: `Cargo: **${m.role}** | Semana de ${weekStart.toISOString().slice(0, 10)}`,
    messageClass: 'INFO',
  });

  embed.addFields(
    { name: '📥 Entregas', value: `${deliveries.rows[0].n} un`, inline: true },
    { name: '💰 Vendas', value: `${sales.rows[0].n} un`, inline: true },
    { name: '🏆 Ranking', value: rank.rows.length ? `#${rank.rows[0].position}` : 'N/A', inline: true },
    { name: '⏳ Pendentes', value: `${pendingDel.rows[0].n} ent | ${pendingOrd.rows[0].n} enc`, inline: true },
    { name: '🚗 Saídas', value: `${openSaidas.rows[0].n} activas`, inline: true },
    { name: '🎯 Metas', value: `${Math.round(goals.rows[0]?.pct || 0)}%`, inline: true }
  );

  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
