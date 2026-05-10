'use strict';
const { MessageFlags } = require('discord.js');
const { query } = require('../db');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');
const { formatPtDateOnly } = require('../shared/formatPtDate');
const { formatMoney } = require('../shared/formatMoney');

async function handle(interaction) {
  if (!(await requirePermission(interaction, { minRole: 'OG' }))) return;
  const period = interaction.options.getString('periodo') || 'week';

  const now = new Date();
  let start;
  if (period === 'day') {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    start = new Date(now);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const [deliveries, sales, topMembers, saidas, pendingOrders, pendingPrizes] = await Promise.all([
    query(
      "SELECT COALESCE(SUM(quantity),0)::int AS n, COALESCE(SUM(quantity*estimated_value),0)::numeric AS v FROM inventory_movements im JOIN items i ON i.id = im.item_id WHERE im.movement_type IN ('entrega_bairrista','entrega_oficial') AND im.created_at >= $1",
      [start]
    ),
    query(
      "SELECT COALESCE(SUM(quantity),0)::int AS n, COALESCE(SUM(quantity*estimated_value),0)::numeric AS v FROM inventory_movements im JOIN items i ON i.id = im.item_id WHERE im.movement_type = 'venda_bairrista' AND im.created_at >= $1",
      [start]
    ),
    query(
      "SELECT m.display_name, SUM(im.quantity)::int AS total FROM inventory_movements im JOIN members m ON m.id = im.member_id WHERE im.created_at >= $1 AND im.movement_type IN ('entrega_bairrista','venda_bairrista','entrega_oficial') GROUP BY m.display_name ORDER BY total DESC LIMIT 5",
      [start]
    ),
    query("SELECT COUNT(*)::int AS n FROM operations WHERE status = 'concluida' AND created_at >= $1", [start]),
    query("SELECT COUNT(*)::int AS n FROM orders WHERE status IN ('pending','in_progress','ready')"),
    query("SELECT COUNT(*)::int AS n FROM weekly_prizes WHERE prize_status = 'por_definir'"),
  ]);

  const embed = brandEmbed('SHORT')
    .setTitle(`📊 Relatório ${period === 'day' ? 'Diário' : period === 'week' ? 'Semanal' : 'Mensal'}`)
    .setDescription(`Período: ${formatPtDateOnly(start)} a ${formatPtDateOnly(now)}`);

  embed.addFields(
    {
      name: '📥 Entregas',
      value: `${deliveries.rows[0]?.n || 0} un | ${formatMoney(deliveries.rows[0]?.v)}`,
      inline: true,
    },
    { name: '💰 Vendas', value: `${sales.rows[0]?.n || 0} un | ${formatMoney(sales.rows[0]?.v)}`, inline: true },
    { name: '🚗 Saídas concluídas', value: String(saidas.rows[0]?.n || 0), inline: true },
    { name: '⏳ Encomendas pendentes', value: String(pendingOrders.rows[0]?.n || 0), inline: true },
    { name: '🏆 Prémios por definir', value: String(pendingPrizes.rows[0]?.n || 0), inline: true }
  );

  if (topMembers.rows.length) {
    const lines = topMembers.rows.map((r, i) => `${i + 1}. **${r.display_name}** — ${r.total} un`);
    embed.addFields({ name: '⭐ Top Contribuidores', value: lines.join('\n') });
  }

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handle };
