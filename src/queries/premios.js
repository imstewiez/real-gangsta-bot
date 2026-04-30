'use strict';
/**
 * /premios — gestão de prémios semanais (chefia only).
 *
 * Sub-comandos:
 *   listar      → lista últimas semanas com prémios
 *   definir     → define prémio para uma semana (modal)
 *   entregar    → marca prémio como entregue
 */

const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { safeReply, safeShowModal, getModalField } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');
const { isChefia } = require('../permissions/permissionEngine');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { prizeService } = require('../services');
const { formatPtDateOnly } = require('../shared/formatPtDate');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand(false) || 'listar';
  if (sub === 'listar') return handleListar(interaction);
  if (sub === 'definir') return handleDefinir(interaction);
  if (sub === 'entregar') return handleEntregar(interaction);
}

async function handleListar(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const recent = await prizeService.getRecentPrizes({ limit: 10 });
  if (!recent.length) {
    return safeReply(interaction, { content: 'Sem prémios registados ainda.' }, { messageClass: 'BANAL' });
  }

  const lines = recent.map(p => {
    const statusEmoji =
      p.prize_status === 'entregue' ? '✅' :
      p.prize_status === 'definido' ? '📝' :
      p.prize_status === 'por_definir' ? '⏳' : '❌';
    const prizeText = p.prize_description ? ` — ${p.prize_description}` : '';
    return `${statusEmoji} **${p.week_start}** · <@${p.winner_discord_id}> · ${p.hybrid_score} pts${prizeText}`;
  });

  const embed = brandEmbed('MOVEMENT')
    .setTitle(`${EMOJI.TOPO} Prémios Semanais`)
    .setDescription(lines.join('\n'));

  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'COCKPIT' });
}

async function handleDefinir(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;

  const weekStart = interaction.options.getString('semana', true);
  const modal = new ModalBuilder()
    .setCustomId(`prize::define::${weekStart}`)
    .setTitle('Definir Prémio Semanal');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('prize_desc')
        .setLabel('Descrição do prémio')
        .setPlaceholder('Ex: 50k + Colete Tático')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('prize_notes')
        .setLabel('Notas (opcional)')
        .setPlaceholder('Observações internas...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
    )
  );

  return safeShowModal(interaction, modal);
}

async function handleEntregar(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const weekStart = interaction.options.getString('semana', true);
  try {
    const prize = await prizeService.markDelivered({
      weekStart,
      deliveredBy: interaction.user.id,
    });
    return safeReply(
      interaction,
      { content: `✅ Prémio da semana **${weekStart}** marcado como entregue.` },
      { messageClass: 'RESULT' }
    );
  } catch (e) {
    return safeReply(interaction, { content: `❌ ${e.message}` }, { messageClass: 'ERROR' });
  }
}

// Modal submit handler
async function handleDefineModal(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;

  const weekStart = interaction.customId.split('::')[2];
  const desc = getModalField(interaction, 'prize_desc');
  const notes = getModalField(interaction, 'prize_notes') || '';

  try {
    await prizeService.definePrize({
      weekStart,
      prizeDescription: desc,
      definedBy: interaction.user.id,
      notes,
    });
    return safeReply(
      interaction,
      { content: `🏆 Prémio definido para semana **${weekStart}**: ${desc}` },
      { messageClass: 'RESULT' }
    );
  } catch (e) {
    return safeReply(interaction, { content: `❌ ${e.message}` }, { messageClass: 'ERROR' });
  }
}

module.exports = { handle, handleDefineModal };
