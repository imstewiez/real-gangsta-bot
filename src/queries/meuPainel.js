'use strict';
const { query } = require('../db');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');

async function handle(interaction) {
  const discordId = interaction.user.id;
  const mr = await query('SELECT id, display_name, role, lifecycle_state FROM members WHERE discord_id = $1', [
    discordId,
  ]);
  if (!mr.rows.length) return safeReply(interaction, { content: '❌ Não encontrado na base de dados.', flags: 64 });
  const member = mr.rows[0];

  const [pendingDeliveries, pendingOrders, openSaidas, weeklyRank, prizes] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS n FROM inventory_delivery_requests WHERE requester_member_id = $1 AND status = 'pending'`,
      [member.id]
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM orders WHERE member_id = $1 AND status IN ('pending','received','under_review')`,
      [member.id]
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM operation_participants sp JOIN operations s ON s.id = sp.operation_id WHERE sp.member_id = $1 AND s.status NOT IN ('concluida','cancelada')`,
      [member.id]
    ),
    query(
      `SELECT position, hybrid_score FROM weekly_rankings WHERE member_id = $1 AND week_start = (SELECT MAX(week_start) FROM weekly_rankings) LIMIT 1`,
      [member.id]
    ),
    query(
      `SELECT week_start, prize_status FROM weekly_prizes WHERE winner_member_id = $1 ORDER BY week_start DESC LIMIT 3`,
      [member.id]
    ),
  ]);

  const embed = brandEmbed({
    title: `👤 ${member.display_name} — O Meu Painel`,
    description: `Cargo: **${member.role}** | Estado: **${member.lifecycle_state}**`,
    messageClass: 'INFO',
  });

  embed.addFields(
    { name: '⏳ Entregas pendentes', value: String(pendingDeliveries.rows[0]?.n || 0), inline: true },
    { name: '📦 Encomendas pendentes', value: String(pendingOrders.rows[0]?.n || 0), inline: true },
    { name: '🚗 Saídas activas', value: String(openSaidas.rows[0]?.n || 0), inline: true },
    {
      name: '🏆 Ranking semanal',
      value: weeklyRank.rows.length
        ? `#${weeklyRank.rows[0].position} (score: ${weeklyRank.rows[0].hybrid_score})`
        : 'N/A',
      inline: true,
    }
  );

  if (prizes.rows.length) {
    const lines = prizes.rows.map(p => `• Semana ${p.week_start.toISOString().slice(0, 10)}: ${p.prize_status}`);
    embed.addFields({ name: '🎁 Prémios recentes', value: lines.join('\n') });
  }

  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
