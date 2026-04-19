'use strict';
/**
 * Leaderboard handlers — botões da live message.
 *
 *   lb::details::daily|weekly|monthly  → ephemeral embed com top 5 / categoria
 *   lb::refresh                         → força refresh (rate-limit 30s / user)
 */

const { MessageFlags } = require('discord.js');
const { safeReply, isDuplicate } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');
const {
  buildDetailsForPeriod,
  publishOrRefresh,
  canUserRefresh,
  markUserRefresh,
  REFRESH_COOLDOWN_MS,
} = require('./leaderboardPublisher');
const { warn } = require('../logger');

async function handleLeaderboardDetails(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  const period = interaction.customId.split('::')[2];
  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    return interaction.editReply({ content: `${EMOJI.ERRO} Período inválido.` }).catch(() => {});
  }

  try {
    const embed = await buildDetailsForPeriod(period);
    return interaction.editReply({ embeds: [embed] }).catch(() => {});
  } catch (e) {
    warn(`[LEADERBOARD] details (${period}) falhou: ${e.message}`);
    return interaction
      .editReply({ content: `${EMOJI.ERRO} Falha a carregar detalhes — tenta daqui a pouco.` })
      .catch(() => {});
  }
}

async function handleLeaderboardRefresh(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  const gate = canUserRefresh(interaction.user.id);
  if (!gate.ok) {
    const secs = Math.ceil(gate.waitMs / 1000);
    return interaction
      .editReply({
        content: `${EMOJI.PENDENTE} Aguarda **${secs}s** antes de pedir outro refresh.`,
      })
      .catch(() => {});
  }
  markUserRefresh(interaction.user.id);

  try {
    const r = await publishOrRefresh(interaction.client);
    if (r.skipped) {
      return interaction
        .editReply({ content: `${EMOJI.WARN} Refresh ignorado: ${r.skipped}.` })
        .catch(() => {});
    }
    return interaction
      .editReply({
        content: `${EMOJI.OK} Leaderboard actualizado. _(podes pedir outro refresh daqui a ${Math.round(REFRESH_COOLDOWN_MS / 1000)}s)_`,
      })
      .catch(() => {});
  } catch (e) {
    warn(`[LEADERBOARD] refresh manual falhou: ${e.message}`);
    return interaction.editReply({ content: `${EMOJI.ERRO} Falha a atualizar.` }).catch(() => {});
  }
}

module.exports = {
  handleLeaderboardDetails,
  handleLeaderboardRefresh,
};
