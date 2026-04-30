'use strict';
const { query } = require('../db');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');

async function handle(interaction) {
  const category = interaction.options.getString('categoria');
  const search = interaction.options.getString('pesquisa');

  let sql = `SELECT id, name, category, unit, estimated_value, active, orderable, target_stock FROM items WHERE active = true`;
  const params = [];
  if (category) {
    params.push(category);
    sql += ` AND category = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND name ILIKE $${params.length}`;
  }
  sql += ` ORDER BY category, name LIMIT 25`;

  const res = await query(sql, params);
  if (!res.rows.length) {
    return safeReply(interaction, { content: 'ℹ️ Nenhum item encontrado.', flags: 64 });
  }

  const lines = res.rows.map(
    i => `\`#${i.id}\` **${i.name}** (${i.category}) — €${i.estimated_value}/${i.unit} ${i.orderable ? '📦' : ''}`
  );

  const embed = brandEmbed({
    title: search ? `🔍 Resultados para "${search}"` : '📦 Catálogo de Materiais',
    description: lines.join('\n'),
    messageClass: 'INFO',
  });
  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
