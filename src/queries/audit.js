'use strict';
/**
 * /audit — logs de auditoria recentes (chefia only).
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { ERRORS } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { requirePermission } = require('../shared/requirePermission');
const { getRecentLogs } = require('../audit/auditEngine');
const { formatPtDate } = require('../shared/formatPtDate');

async function handle(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const limit = interaction.options.getInteger('limite') || 20;
  const logs = await getRecentLogs(limit);
  if (!logs.length) {
    return safeReply(interaction, { content: 'Sem logs recentes.' }, { messageClass: 'BANAL' });
  }
  const lines = logs.map(
    l => `\`${formatPtDate(l.created_at)}\` **${l.action}** — ${l.entity_type} — por <@${l.actor_id}>`
  );
  const embed = brandEmbed().setTitle('Logs de Auditoria').setDescription(lines.slice(0, 20).join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
}

module.exports = { handle };
