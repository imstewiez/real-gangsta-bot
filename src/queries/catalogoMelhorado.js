'use strict';
const { MessageFlags } = require('discord.js');
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
    return safeReply(interaction, { content: 'ℹ️ Nenhum item encontrado.', flags: MessageFlags.Ephemeral });
  }

  const lines = res.rows.map(
    i => `\`#${i.id}\` **${i.name}** (${i.category}) — €${i.estimated_value}/${i.unit} ${i.orderable ? '📦' : ''}`
  );

  const embed = brandEmbed('SHORT')
    .setTitle(search ? `🔍 Resultados para "${search}"` : '📦 Catálogo de Materiais')
    .setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handle };
