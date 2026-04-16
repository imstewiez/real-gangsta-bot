'use strict';
/**
 * /audit — logs de auditoria recentes (chefia only).
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { ERRORS } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { getRecentLogs } = require('../audit/auditEngine');

async function handle(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('ver logs'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const limit = interaction.options.getInteger('limite') || 20;
  const logs = await getRecentLogs(limit);
  if (!logs.length) {
    return safeReply(interaction, { content: 'Sem logs recentes.' }, { dismissible: true });
  }
  const lines = logs.map(l =>
    `\`${l.created_at?.toISOString?.()?.split('T')[0] || ''}\` **${l.action}** — ${l.entity_type} — por <@${l.actor_id}>`
  );
  const embed = brandEmbed().setTitle('Logs de Auditoria').setDescription(lines.slice(0, 20).join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = { handle };
