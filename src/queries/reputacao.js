'use strict';
const { MessageFlags } = require('discord.js');
const { reputationRepo } = require('../repositories');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });
  const member = interaction.options.getMember('membro');
  const { query } = require('../db');
  const r = await query('SELECT id FROM members WHERE discord_id = $1', [member.id]);
  if (!r.rows.length)
    return safeReply(interaction, { content: '❌ Membro não encontrado.', flags: MessageFlags.Ephemeral });

  const stats = await reputationRepo.calculate(r.rows[0].id);
  const embed = brandEmbed('SHORT')
    .setTitle(`🔍 Reputação — ${member.displayName}`)
    .setDescription(
      `**Fiabilidade:** ${stats.reliability.toFixed(1)}/100\n**Taxa entregas:** ${stats.delivery_rate.toFixed(1)}%\n**Taxa saídas:** ${stats.saida_rate.toFixed(1)}%\n**Pendentes:** ${stats.pending_ratio.toFixed(1)}%\n**Rejeições:** ${stats.rejection_rate.toFixed(1)}%`
    );
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handle };
