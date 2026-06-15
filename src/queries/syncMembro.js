'use strict';

const { MessageFlags } = require('discord.js');
const { canManageOnboarding } = require('../permissions/permissionEngine');
const { safeReply } = require('../shared/interactionHelpers');
const { syncMemberDiscordState } = require('../members/syncMemberDiscordState');

async function handle(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!canManageOnboarding(interaction.member)) {
    return safeReply(interaction, { content: 'Não tens permissão para executar esta ação.' }, { messageClass: 'BANAL' });
  }

  const target = interaction.options.getUser('membro');
  if (!target) return safeReply(interaction, { content: 'Membro inválido.' }, { messageClass: 'BANAL' });

  const result = await syncMemberDiscordState(interaction.client, { discordId: target.id });
  if (!result.ok) {
    return safeReply(interaction, { content: `Sync falhou: ${result.error || 'erro desconhecido'}` }, { messageClass: 'ERROR' });
  }

  return safeReply(interaction, { content: `Sync concluído para ${target.tag}.` }, { messageClass: 'BANAL' });
}

module.exports = { handle };
