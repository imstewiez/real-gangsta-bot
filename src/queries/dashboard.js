'use strict';
const { query } = require('../db');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });

  const [stockTotal, pendingDel, pendingSales, pendingOrd, openSaidas, weapons, topWeekly, incidents] =
    await Promise.all([
      query(`SELECT SUM(quantity)::int as n FROM stock`),
      query(`SELECT COUNT(*)::int as n FROM inventory_delivery_requests WHERE status='pending'`),
      query(`SELECT COUNT(*)::int as n FROM inventory_delivery_requests WHERE status='pending' AND type='venda'`),
      query(`SELECT COUNT(*)::int as n FROM orders WHERE status IN ('pending','received','under_review')`),
      query(`SELECT COUNT(*)::int as n FROM operations WHERE status NOT IN ('concluida','cancelada')`),
      query(
        `SELECT COUNT(*)::int as n FROM operation_participants sp JOIN operations s ON s.id=sp.operation_id WHERE sp.weapon_returned=false AND s.status='concluida'`
      ),
      query(
        `SELECT m.display_name, wr.hybrid_score FROM weekly_rankings wr JOIN members m ON m.id=wr.member_id WHERE wr.week_start=(SELECT MAX(week_start) FROM weekly_rankings) ORDER BY wr.position LIMIT 3`
      ),
      query(`SELECT COUNT(*)::int as n FROM incidents WHERE status IN ('open','analysing')`),
    ]);

  const embed = brandEmbed({
    title: '🎯 Dashboard Chefia',
    description: `Resumo operacional em <t:${Math.floor(Date.now() / 1000)}:R>`,
    messageClass: 'INFO',
  });

  embed.addFields(
    { name: '📊 Stock total', value: String(stockTotal.rows[0]?.n || 0), inline: true },
    { name: '📥 Entregas pendentes', value: String(pendingDel.rows[0]?.n || 0), inline: true },
    { name: '💰 Vendas pendentes', value: String(pendingSales.rows[0]?.n || 0), inline: true },
    { name: '📦 Encomendas', value: String(pendingOrd.rows[0]?.n || 0), inline: true },
    { name: '🚗 Saídas abertas', value: String(openSaidas.rows[0]?.n || 0), inline: true },
    { name: '🔫 Armas por devolver', value: String(weapons.rows[0]?.n || 0), inline: true },
    { name: '🚨 Incidentes', value: String(incidents.rows[0]?.n || 0), inline: true }
  );

  if (topWeekly.rows.length) {
    const lines = topWeekly.rows.map((r, i) => `${i + 1}. **${r.display_name}** — ${r.hybrid_score}`);
    embed.addFields({ name: '🏆 Top Semanal', value: lines.join('\n') });
  }

  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
