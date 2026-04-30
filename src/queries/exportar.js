'use strict';
const { MessageFlags } = require('discord.js');
const { query } = require('../db');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });
  const tipo = interaction.options.getString('tipo');
  const inicio = interaction.options.getString('inicio');
  const fim = interaction.options.getString('fim') || new Date().toISOString();

  let sql = '';
  if (tipo === 'entregas') {
    sql = `SELECT m.display_name, i.name, im.quantity, im.created_at FROM inventory_movements im JOIN members m ON m.id = im.member_id JOIN items i ON i.id = im.item_id WHERE im.movement_type IN ('entrega_bairrista','entrega_oficial') AND im.created_at BETWEEN $1 AND $2`;
  } else if (tipo === 'vendas') {
    sql = `SELECT m.display_name, i.name, im.quantity, im.created_at FROM inventory_movements im JOIN members m ON m.id = im.member_id JOIN items i ON i.id = im.item_id WHERE im.movement_type = 'venda_bairrista' AND im.created_at BETWEEN $1 AND $2`;
  } else if (tipo === 'saidas') {
    sql = `SELECT id, status, created_at, created_by FROM operations WHERE created_at BETWEEN $1 AND $2`;
  } else {
    return safeReply(interaction, { content: '❌ Tipo não suportado.', flags: MessageFlags.Ephemeral });
  }

  const res = await query(sql, [inicio, fim]);
  const lines = res.rows.map(r => JSON.stringify(r));
  const content = lines.join('\n');

  if (content.length > 1900) {
    const embed = brandEmbed('SHORT')
      .setTitle('📤 Exportação')
      .setDescription(`${res.rows.length} registos. Conteúdo muito longo para Discord.`);
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }
  return safeReply(interaction, { content: `\`\`\`json\n${content}\n\`\`\``, flags: MessageFlags.Ephemeral });
}

module.exports = { handle };
