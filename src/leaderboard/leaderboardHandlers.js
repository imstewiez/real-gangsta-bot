'use strict';
/**
 * Leaderboard handlers — botões da live message.
 *
 *   lb::details::daily|weekly|monthly  → ephemeral embed com top 5 / categoria
 *   lb::nav::period::offset             → navegação temporal (anterior/seguinte)
 *   lb::custom::open                    → modal para escolher datas
 *   lb::custom::submit                  → resultado do modal
 *   lb::refresh                         → força refresh (rate-limit 30s / user)
 */

const { MessageFlags, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');
const { buildDetailsForPeriod, buildDetailsForCustomRange } = require('./leaderboardPublisher');
const { warn } = require('../logger');

async function handleLeaderboardDetails(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  const period = interaction.customId.split('::')[2];
  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} Período inválido.` }, { messageClass: 'WARN' });
  }

  try {
    const { embed, components } = await buildDetailsForPeriod(period, 0);
    return safeReply(interaction, { embeds: [embed], components }, { messageClass: 'COCKPIT' });
  } catch (e) {
    warn(`[LEADERBOARD] details (${period}) falhou: ${e.message}`);
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Falha a carregar detalhes — tenta daqui a pouco.` },
      { messageClass: 'ERROR' }
    );
  }
}

async function handleLeaderboardNav(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  const [, , period, offsetStr] = interaction.customId.split('::');
  const offset = parseInt(offsetStr, 10) || 0;
  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} Período inválido.` }, { messageClass: 'WARN' });
  }

  try {
    const { embed, components } = await buildDetailsForPeriod(period, offset);
    return safeReply(interaction, { embeds: [embed], components }, { messageClass: 'COCKPIT' });
  } catch (e) {
    warn(`[LEADERBOARD] nav (${period}, ${offset}) falhou: ${e.message}`);
    return safeReply(interaction, { content: `${EMOJI.ERRO} Falha a carregar detalhes.` }, { messageClass: 'ERROR' });
  }
}

async function handleLeaderboardCustomOpen(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('lb::custom::modal')
    .setTitle('📅 Leaderboard — datas custom')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('start')
          .setLabel('Data de início (YYYY-MM-DD)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('2026-04-01')
          .setRequired(true)
          .setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('end')
          .setLabel('Data de fim (YYYY-MM-DD)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('2026-04-30')
          .setRequired(true)
          .setMaxLength(10)
      )
    );
  return interaction.showModal(modal).catch(() => {});
}

async function handleLeaderboardCustomModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const start = interaction.fields.getTextInputValue('start');
  const end = interaction.fields.getTextInputValue('end');

  try {
    const { embed } = await buildDetailsForCustomRange(start, end);
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'COCKPIT' });
  } catch (e) {
    warn(`[LEADERBOARD] custom range (${start} → ${end}) falhou: ${e.message}`);
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} ${e.message || 'Falha a carregar leaderboard custom.'}` },
      { messageClass: 'ERROR' }
    );
  }
}

module.exports = {
  handleLeaderboardDetails,
  handleLeaderboardNav,
  handleLeaderboardCustomOpen,
  handleLeaderboardCustomModal,
};
