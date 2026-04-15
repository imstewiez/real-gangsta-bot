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
const engine = require('./killEngine');

async function handleRegisterKillButton(interaction) {
  if (!canRegisterKill(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('registar kill'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('kill::modal')
    .setTitle('Registar Kill')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('victim').setLabel('Vítima (nome · facção)')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120)
          .setPlaceholder('Ex: Tony Blood · Red Street')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('spot').setLabel('Spot (onde aconteceu)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('context').setLabel('Contexto')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120)
          .setPlaceholder('Ex: emboscada, defesa de spot...')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('saida_id').setLabel('ID da saída (opcional)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10)),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes').setLabel('Observações')
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
    );

  await safeShowModal(interaction, modal);
}

async function handleKillModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const victimRaw = getModalField(interaction, 'victim').trim();
  const spot = getModalField(interaction, 'spot').trim();
  const context = getModalField(interaction, 'context').trim();
  const saidaStr = getModalField(interaction, 'saida_id').trim();
  const notes = getModalField(interaction, 'notes').trim();

  if (!victimRaw) return safeReply(interaction, { content: 'Nome da vítima obrigatório.' }, { dismissible: true });

  // "Nome · facção" / "Nome - facção" / só nome
  let victimName = victimRaw, victimFaction = '';
  const sepMatch = victimRaw.match(/^(.+?)\s*[·\-—]\s*(.+)$/);
  if (sepMatch) { victimName = sepMatch[1].trim(); victimFaction = sepMatch[2].trim(); }

  const saidaId = saidaStr ? parseInt(saidaStr) || null : null;

  try {
    const kill = await engine.recordKill({
      killerDiscordId: interaction.user.id,
      victimName, victimFaction,
      spot, context,
      saidaId, notes,
      createdBy: interaction.user.id,
    });
    engine.publishKillToChannel(interaction.client, kill).catch(() => null);
    const embed = successEmbed(
      'Kill Registada',
      `☠️ **${victimName}**${victimFaction ? ` (${victimFaction})` : ''} adicionado ao cemitério.` +
      `${spot ? `\n📍 Spot: ${spot}` : ''}` +
      `${saidaId ? `\n🏴 Saída: #${saidaId}` : ''}` +
      `${context ? `\n📝 ${context}` : ''}`
    );
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
  }
}

async function handleLeaderboardButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const top = await engine.getLeaderboard(10);
  if (!top.length) return safeReply(interaction, { content: 'Cemitério vazio — ninguém tem kills registadas.' }, { dismissible: true });
  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((r, i) => {
    const prefix = medals[i] || `**${i + 1}.**`;
    return `${prefix} <@${r.discord_id}> — **${r.kills}** kill${r.kills === 1 ? '' : 's'}`;
  });
  const embed = brandEmbed().setTitle('☠️ Cemitério — Top Killers').setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = { handleRegisterKillButton, handleKillModal, handleLeaderboardButton };
