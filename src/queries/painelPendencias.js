'use strict';
const { MessageFlags } = require('discord.js');
const { query } = require('../db');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });

  const [deliveries, orders, prizes, saidas, stockLow, ausencias] = await Promise.all([
    query("SELECT COUNT(*)::int AS n FROM inventory_delivery_requests WHERE status = 'pending'"),
    query("SELECT COUNT(*)::int AS n FROM orders WHERE status IN ('pending','in_progress','ready')"),
    query("SELECT COUNT(*)::int AS n FROM weekly_prizes WHERE prize_status = 'por_definir'"),
    query("SELECT COUNT(*)::int AS n FROM operations WHERE status NOT IN ('concluida','cancelada')"),
    query(`
      WITH stock_balances AS (
        SELECT i.id, i.name, i.alert_threshold,
          COALESCE(SUM(CASE
            WHEN im.movement_type IN ('saldo_inicial','entrega_bairrista','entrega_oficial','venda_bairrista','devolucao_saida','ajuste_manual','craftado','apreendido') THEN im.quantity
            WHEN im.movement_type IN ('fornecimento_org','perda_saida','consumo_saida') THEN -im.quantity
            ELSE 0
          END), 0)::int AS balance
        FROM items i
        LEFT JOIN inventory_movements im ON im.item_id = i.id
        WHERE i.active = true
        GROUP BY i.id, i.name, i.alert_threshold
      )
      SELECT name, balance FROM stock_balances
      WHERE alert_threshold > 0 AND balance < alert_threshold
      ORDER BY balance ASC, name
      LIMIT 5
    `),
    query(
      "SELECT COUNT(*)::int AS n FROM member_absences WHERE status = 'approved' AND CURRENT_DATE BETWEEN start_date AND end_date"
    ),
  ]);

  const embed = brandEmbed('MOVEMENT')
    .setTitle('📋 Painel de Pendências')
    .setDescription('Resumo de tudo que precisa de atenção da chefia:');

  embed.addFields(
    { name: '📥 Entregas pendentes', value: `**${deliveries.rows[0]?.n || 0}**`, inline: true },
    { name: '📦 Encomendas pendentes', value: `**${orders.rows[0]?.n || 0}**`, inline: true },
    { name: '🏆 Prémios por definir', value: `**${prizes.rows[0]?.n || 0}**`, inline: true },
    { name: '🚗 Saídas activas', value: `**${saidas.rows[0]?.n || 0}**`, inline: true },
    { name: '🏖️ Ausências activas', value: `**${ausencias.rows[0]?.n || 0}**`, inline: true }
  );

  if (stockLow.rows.length) {
    const lines = stockLow.rows.map(r => `• **${r.name}**: ${r.balance} unidades`);
    embed.addFields({ name: '⚠️ Stock abaixo do alvo', value: lines.join('\n') });
  }

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handle };
