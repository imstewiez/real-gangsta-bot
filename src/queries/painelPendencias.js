'use strict';
const { query } = require('../db');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });

  const [deliveries, orders, prizes, saidas, stockLow] = await Promise.all([
    query(`SELECT COUNT(*)::int AS n FROM inventory_delivery_requests WHERE status = 'pending'`),
    query(`SELECT COUNT(*)::int AS n FROM orders WHERE status IN ('pending','received','under_review')`),
    query(`SELECT COUNT(*)::int AS n FROM weekly_prizes WHERE prize_status = 'por_definir'`),
    query(`SELECT COUNT(*)::int AS n FROM operations WHERE status NOT IN ('concluida','cancelada')`),
    query(
      `SELECT i.name, s.quantity FROM stock s JOIN items i ON i.id = s.item_id WHERE s.quantity < i.target_stock AND i.target_stock > 0 LIMIT 5`
    ),
  ]);

  const embed = brandEmbed({
    title: '📋 Painel de Pendências',
    description: 'Resumo de tudo que precisa de atenção da chefia:',
    messageClass: 'INFO',
  });

  embed.addFields(
    { name: '📥 Entregas pendentes', value: `**${deliveries.rows[0]?.n || 0}**`, inline: true },
    { name: '📦 Encomendas pendentes', value: `**${orders.rows[0]?.n || 0}**`, inline: true },
    { name: '🏆 Prémios por definir', value: `**${prizes.rows[0]?.n || 0}**`, inline: true },
    { name: '🚗 Saídas activas', value: `**${saidas.rows[0]?.n || 0}**`, inline: true }
  );

  if (stockLow.rows.length) {
    const lines = stockLow.rows.map(r => `• **${r.name}**: ${r.quantity} unidades`);
    embed.addFields({ name: '⚠️ Stock abaixo do alvo', value: lines.join('\n') });
  }

  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
