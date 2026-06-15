'use strict';

const { MessageFlags } = require('discord.js');
const { query } = require('../db');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');

async function handle(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const res = await query(
    `SELECT display_name, full_name, nickname, role, tier, status, lifecycle_state, created_at, updated_at
       FROM members
      WHERE discord_id = $1
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1`,
    [interaction.user.id]
  );

  const member = res.rows[0];
  if (!member) {
    return safeReply(interaction, { content: 'Ainda não existe perfil associado ao teu Discord.' }, { messageClass: 'BANAL' });
  }

  const embed = brandEmbed('SHORT')
    .setColor(COLOR.INFO)
    .setTitle('Perfil de membro')
    .addFields(
      { name: 'Nome', value: member.display_name || member.full_name || '—', inline: true },
      { name: 'Alcunha', value: member.nickname || '—', inline: true },
      { name: 'Cargo', value: member.tier || member.role || '—', inline: true },
      { name: 'Estado', value: member.lifecycle_state || member.status || '—', inline: true }
    );

  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

module.exports = { handle };
