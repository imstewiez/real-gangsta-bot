'use strict';
const { query } = require('../db');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');

async function handle(interaction) {
  const itemName = interaction.options.getString('item');

  if (itemName) {
    const res = await query(
      `SELECT i.name, i.category, i.estimated_value, COALESCE(s.quantity, 0) as quantity,
        i.purchase_price, i.target_stock, i.orderable
       FROM items i
       LEFT JOIN stock s ON s.item_id = i.id
       WHERE i.name ILIKE $1 AND i.active = true LIMIT 1`,
      [`%${itemName}%`]
    );
    if (!res.rows.length) return safeReply(interaction, { content: '❌ Item não encontrado.', flags: 64 });
    const i = res.rows[0];
    const embed = brandEmbed({
      title: `📊 ${i.name}`,
      description: `Categoria: ${i.category}\nStock: **${i.quantity}** unidades\nPreço: €${i.estimated_value}\n${i.purchase_price ? `Preço compra: €${i.purchase_price}\n` : ''}Stock alvo: ${i.target_stock || 'N/A'}`,
      messageClass: 'INFO',
    });
    return safeReply(interaction, { embeds: [embed], flags: 64 });
  }

  // Stock geral agrupado por categoria
  const res = await query(
    `SELECT i.category, COUNT(*)::int as items, SUM(COALESCE(s.quantity,0))::int as total_qty
     FROM items i LEFT JOIN stock s ON s.item_id = i.id
     WHERE i.active = true GROUP BY i.category ORDER BY total_qty DESC`
  );
  const lines = res.rows.map(r => `**${r.category}**: ${r.items} itens | ${r.total_qty} un`);
  const embed = brandEmbed({
    title: '📊 Stock Geral por Categoria',
    description: lines.join('\n'),
    messageClass: 'INFO',
  });
  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
