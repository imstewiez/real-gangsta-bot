'use strict';
const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { safeReply, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed, rankBadge, streakBadge } = require('../shared/embedBuilders');
const { canRegisterKill } = require('../permissions/permissionEngine');
const { EMOJI, MODALS, KILLS, ERRORS } = require('../content');
const engine = require('./killEngine');

async function handleRegisterKillButton(interaction) {
  if (!canRegisterKill(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('registar kill'), flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const M = MODALS.KILL_REGISTER;
  const modal = new ModalBuilder()
    .setCustomId('kill::modal')
    .setTitle(M.TITLE)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('victim')
          .setLabel(M.FIELDS.victim.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(M.FIELDS.victim.required)
          .setMaxLength(M.FIELDS.victim.maxLength)
          .setPlaceholder(M.FIELDS.victim.placeholder)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('spot')
          .setLabel(M.FIELDS.spot.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(M.FIELDS.spot.required)
          .setMaxLength(M.FIELDS.spot.maxLength)
          .setPlaceholder(M.FIELDS.spot.placeholder)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('context')
          .setLabel(M.FIELDS.context.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(M.FIELDS.context.required)
          .setMaxLength(M.FIELDS.context.maxLength)
          .setPlaceholder(M.FIELDS.context.placeholder)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('saida_id')
          .setLabel('Saída (ID opcional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setPlaceholder('Ex: 42')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Notas (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
      )
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

  if (!victimRaw)
    return safeReply(interaction, { content: `${EMOJI.WARN} Falta o nome da vítima.` }, { messageClass: 'BANAL' });

  // "Nome · facção" / "Nome - facção" / só nome
  let victimName = victimRaw,
    victimFaction = '';
  const sepMatch = victimRaw.match(/^(.+?)\s*[·\-—]\s*(.+)$/);
  if (sepMatch) {
    victimName = sepMatch[1].trim();
    victimFaction = sepMatch[2].trim();
  }

  const saidaId = saidaStr ? parseInt(saidaStr) || null : null;

  try {
    const kill = await engine.recordKill({
      killerDiscordId: interaction.user.id,
      victimName,
      victimFaction,
      spot,
      context,
      saidaId,
      notes,
      createdBy: interaction.user.id,
    });
    engine.publishKillToChannel(interaction.client, kill).catch(() => null);

    // Fetch context data — rank, streak, weekly count — para enriquecer o embed.
    const stats = await engine.getKillerStats(interaction.user.id).catch(() => null);

    const embed = brandEmbed('STREET')
      .setTitle(KILLS.REGISTERED_TITLE)
      .setDescription(
        KILLS.REGISTERED_LINE(`${victimName}${victimFaction ? ` · ${victimFaction}` : ''}`, spot) +
          (context ? `\n_${context}_` : '') +
          (saidaId ? `\n${EMOJI.SAIDA} Saída **#${saidaId}**` : '')
      );

    // Fields data-rich se tivermos stats
    if (stats) {
      const fields = [];
      if (stats.total !== undefined) {
        fields.push({ name: KILLS.LABELS.KILLS, value: `**${stats.total}**`, inline: true });
      }
      if (stats.streak !== undefined && stats.streak >= 3) {
        const badge = streakBadge(stats.streak);
        fields.push({ name: KILLS.LABELS.STREAK, value: `${badge} **${stats.streak}**`, inline: true });
      }
      if (stats.weekly !== undefined) {
        fields.push({ name: KILLS.LABELS.SEMANA, value: `**${stats.weekly}**`, inline: true });
      }
      if (stats.rank !== undefined && stats.rank > 0) {
        fields.push({ name: 'Topo', value: `${rankBadge(stats.rank)}`, inline: true });
      }
      if (fields.length) embed.addFields(fields);
    }

    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'BANAL' });
  }
}

async function handleLeaderboardButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const top = await engine.getLeaderboard(10);
  if (!top.length) {
    return safeReply(interaction, { content: KILLS.LEADERBOARD_EMPTY }, { messageClass: 'BANAL' });
  }

  const lines = top.map((r, i) => {
    const badge = rankBadge(i + 1);
    const extra = [];
    if (r.kd !== null && r.kd !== undefined) extra.push(`K/D **${Number(r.kd).toFixed(2)}**`);
    if (r.streak !== null && r.streak !== undefined && r.streak >= 3)
      extra.push(`${streakBadge(r.streak)} ${r.streak}`);
    return KILLS.LEADERBOARD_PLACE(badge, r.discord_id, r.kills, extra.join(' · '));
  });

  const embed = brandEmbed('TOP').setTitle(KILLS.LEADERBOARD_TITLE).setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

module.exports = { handleRegisterKillButton, handleKillModal, handleLeaderboardButton };
