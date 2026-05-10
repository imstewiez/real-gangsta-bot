'use strict';
const { MessageFlags } = require('discord.js');
const { incidentRepo } = require('../repositories');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');
const { fmtOrderStatus } = require('../shared/labels');

async function handle(interaction) {
  if (!(await requirePermission(interaction, { minRole: 'OG' }))) return;
  const sub = interaction.options.getSubcommand();
  const userTag = interaction.user.tag;

  if (sub === 'listar') {
    const status = interaction.options.getString('estado');
    const rows = await incidentRepo.list({ status, limit: 25 });
    const lines = rows.map(
      r =>
        `\`#${r.id}\` [${r.severity.toUpperCase()}] **${r.title}** — ${fmtOrderStatus(r.status)} (<t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>)`
    );
    const embed = brandEmbed('SHORT')
      .setTitle('🚨 Incidentes')
      .setDescription(lines.join('\n') || 'Nenhum incidente.');
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (sub === 'criar') {
    const incident = await incidentRepo.create({
      title: interaction.options.getString('titulo'),
      description: interaction.options.getString('descricao') || '',
      severity: interaction.options.getString('severidade') || 'medium',
      source: interaction.options.getString('fonte') || '',
      createdBy: userTag,
    });
    return safeReply(interaction, {
      content: `🚨 Incidente \`#${incident.id}\` criado.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'resolver') {
    const id = interaction.options.getInteger('id');
    const status = interaction.options.getString('estado');
    await incidentRepo.updateStatus(id, status, userTag);
    return safeReply(interaction, {
      content: `✅ Incidente \`#${id}\` marcado como **${status}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { handle };
