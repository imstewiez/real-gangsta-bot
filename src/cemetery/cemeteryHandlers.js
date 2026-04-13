'use strict';
const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const {
  safeReply, safeShowModal, getModalField, isDuplicate,
} = require('../shared/interactionHelpers');
const { successEmbed, brandEmbed } = require('../shared/embedBuilders');
const { canRegisterKill } = require('../permissions/permissionEngine');
const MESSAGES = require('../shared/errorMessages');
const engine = require('./cemeteryEngine');

async function handleRegisterKillButton(interaction) {
  if (!canRegisterKill(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('registar kill'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('cemetery::modal_kill')
    .setTitle('Registar Kill')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('victim_name').setLabel('Contra quem (nome ou alcunha)')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder('Ex: Alguém dos Bloods')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('context').setLabel('Contexto')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('Ex: defesa de spot, emboscada...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('operation_id').setLabel('ID da operação (opcional)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('date').setLabel('Data (YYYY-MM-DD, opcional — hoje por omissão)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes').setLabel('Observações')
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
      ),
    );

  await safeShowModal(interaction, modal);
}

async function handleKillModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const victimName = getModalField(interaction, 'victim_name').trim();
  const context = getModalField(interaction, 'context').trim();
  const opStr = getModalField(interaction, 'operation_id').trim();
  const date = getModalField(interaction, 'date').trim() || null;
  const notes = getModalField(interaction, 'notes').trim();

  if (!victimName) {
    return safeReply(interaction, { content: 'Nome da vítima obrigatório.' }, { dismissible: true });
  }

  const operationId = opStr ? parseInt(opStr) || null : null;

  try {
    const kill = await engine.recordKill({
      killerDiscordId: interaction.user.id,
      victimName,
      context,
      operationId,
      date,
      notes,
      createdBy: interaction.user.id,
    });

    // Publicar no canal cemitério (não-bloqueante)
    engine.publishKillToChannel(interaction.client, kill).catch(() => null);

    const embed = successEmbed('Kill Registada', `**${victimName}** adicionado ao cemitério.${operationId ? `\nOperação: #${operationId}` : ''}${context ? `\nContexto: ${context}` : ''}`);
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
  }
}

async function handleLeaderboardButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const top = await engine.getLeaderboard(10);
  if (!top.length) {
    return safeReply(interaction, { content: 'Cemitério vazio — ninguém tem kills registadas.' }, { dismissible: true });
  }
  const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
  const lines = top.map((r, i) => {
    const prefix = medals[i] || `**${i + 1}.**`;
    return `${prefix} <@${r.discord_id}> \u2014 **${r.kills}** kill${r.kills === 1 ? '' : 's'}`;
  });
  const embed = brandEmbed().setTitle('\u2620\uFE0F Leaderboard do Cemitério').setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = { handleRegisterKillButton, handleKillModal, handleLeaderboardButton };
