'use strict';
const { MessageFlags } = require('discord.js');
const { maintenanceRepo } = require('../repositories');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });
  const sub = interaction.options.getSubcommand();
  const userTag = interaction.user.tag;

  if (sub === 'status') {
    const state = await maintenanceRepo.isActive();
    const embed = brandEmbed('SHORT')
      .setTitle(state.active ? '🔧 Modo Manutenção ACTIVO' : '✅ Sistema Operacional')
      .setDescription(
        state.active
          ? `**Motivo:** ${state.reason}\n**Desde:** <t:${Math.floor(new Date(state.started_at).getTime() / 1000)}:R>`
          : 'Tudo normal.'
      );
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (sub === 'ativar') {
    const reason = interaction.options.getString('motivo') || 'Manutenção programada';
    await maintenanceRepo.setActive(true, reason, userTag);
    return safeReply(interaction, { content: `🔧 Modo manutenção ACTIVO: *${reason}*`, flags: MessageFlags.Ephemeral });
  }

  if (sub === 'desativar') {
    await maintenanceRepo.setActive(false, '', userTag);
    return safeReply(interaction, { content: `✅ Modo manutenção DESACTIVO.`, flags: MessageFlags.Ephemeral });
  }
}

module.exports = { handle };
