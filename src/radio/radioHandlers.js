'use strict';
/**
 * Handlers para botões do painel de rádio.
 *
 * customIds:
 *   radio::random::<type>    botão — gera aleatória para <type>
 *   radio::set::<type>       botão — abre modal para definir <type>
 *   radio::modal_set::<type> modal submit — define valor manual
 */

const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const CONFIG = require('../config');
const { radioRepo } = require('../repositories');
const { setRandom, setRadio, buildEmbed, buildComponents, TYPE_META, notifyStickyChange } = require('./radioEngine');
const { safeReply, safeShowModal, getModalField } = require('../shared/interactionHelpers');
const { successEmbed, brandEmbed, COLOR, metricCard } = require('../shared/embedBuilders');
const { isCommand } = require('../permissions/permissionEngine');
const { RADIO, EMOJI, MODALS } = require('../content');
const { warn } = require('../logger');

// Quem pode alterar a rádio: Comando (Kingpin, Manda-Chuva), OG, ou Patrão di Zona.
// Exclui Real Gangster.
function _canManageRadio(member) {
  const { memberRoleIds, isPatraoDiZona } = require('../permissions/permissionEngine');
  return isCommand(member) || memberRoleIds(member).has(CONFIG.OG_ROLE_ID) || isPatraoDiZona(member);
}

async function _denyIfNotOG(interaction) {
  if (_canManageRadio(interaction.member)) return false;
  await safeReply(
    interaction,
    {
      content: `${EMOJI.BLOQUEADO} Apenas Patrão di Zona, OG, Kingpin ou Manda-Chuva pode alterar a rádio.`,
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'BANAL' }
  );
  return true;
}

function parseId(customId) {
  return customId.split('::');
}

async function refreshMessage(interaction) {
  try {
    const states = await radioRepo.getAllStates();
    await interaction.message.edit({
      embeds: [buildEmbed(states)],
      components: buildComponents(),
    });
  } catch (e) {
    warn(`[RADIO] refreshMessage falhou: ${e.message}`);
  }
}

/**
 * Envia notificação embed no canal, mencionando @redwood e @bairristas.
 * Usado tanto por handleRandom como por handleSetModal.
 */
async function notifyRadioChange(channel, { type, value, previous, mode, actorId }) {
  const meta = TYPE_META[type];
  const modeLabel = mode === 'random' ? '🎲 Aleatória' : '✋ Manual';
  const modeEmoji = mode === 'random' ? EMOJI.REFRESH : '✏️';

  const embed = brandEmbed('MOVEMENT')
    .setColor(COLOR.DANGER)
    .setTitle(`${EMOJI.RADIO} Frequência Actualizada`)
    .setDescription(
      `**${meta.label}** — nova onda definida.\n\n` +
        `\`\`\`fix\n${value}\n\`\`\`\n` +
        `${modeEmoji} ${modeLabel} · por <@${actorId}>`
    )
    .addFields(
      metricCard('Anterior', previous || '—', { icon: '⬅️', inline: true }),
      metricCard('Actual', value, { icon: EMOJI.FREQUENCIA, inline: true }),
      metricCard('Modo', modeLabel, { icon: modeEmoji, inline: true })
    );

  const mentions = [];
  if (CONFIG.REDWOOD_ROLE_ID) mentions.push(`<@&${CONFIG.REDWOOD_ROLE_ID}>`);
  if (CONFIG.BAIRRISTAS_ROLE_ID) mentions.push(`<@&${CONFIG.BAIRRISTAS_ROLE_ID}>`);

  try {
    if (mentions.length) {
      await channel.send({
        content: mentions.join(' '),
        embeds: [embed],
        allowedMentions: { parse: [] }, // força só mentions explícitas (<@&id>)
      });
    } else {
      await channel.send({ embeds: [embed] });
    }
  } catch (e) {
    warn(`[RADIO] notifyRadioChange falhou: ${e.message}`);
  }
}

async function handleSet(interaction) {
  if (await _denyIfNotOG(interaction)) return;
  const [, , type] = parseId(interaction.customId);
  const meta = TYPE_META[type];
  const M = MODALS.RADIO_SET(meta.label);

  const modal = new ModalBuilder()
    .setCustomId(`radio::modal_set::${type}`)
    .setTitle(M.TITLE(meta.label))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(M.FIELDS.value.label(meta.label))
          .setStyle(TextInputStyle.Short)
          .setRequired(M.FIELDS.value.required)
          .setMaxLength(M.FIELDS.value.maxLength)
          .setPlaceholder(M.FIELDS.value.placeholder)
      )
    );

  await safeShowModal(interaction, modal);
}

async function handleSetModal(interaction) {
  if (await _denyIfNotOG(interaction)) return;
  const [, , type] = parseId(interaction.customId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const rawValue = getModalField(interaction, 'value').trim();
    const result = await setRadio({
      type,
      value: rawValue,
      mode: 'manual',
      actorId: interaction.user.id,
    });

    await refreshMessage(interaction);
    notifyStickyChange(interaction.client).catch(() => {});
    await notifyRadioChange(interaction.channel, {
      type,
      value: result.value,
      previous: result.previous,
      mode: 'manual',
      actorId: interaction.user.id,
    });

    const meta = TYPE_META[type];
    const embed = successEmbed(
      RADIO.SET_TITLE,
      `**${meta.label}**\n${RADIO.LABELS.ANTES}: \`${result.previous || '—'}\`\n${RADIO.LABELS.AGORA}: \`${result.value}\``
    );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'RESULT' });
  }
}

async function handleRandom(interaction) {
  if (await _denyIfNotOG(interaction)) return;
  const [, , type] = parseId(interaction.customId);
  await interaction.deferUpdate();
  try {
    await setRandom({ type, actorId: interaction.user.id });
    await refreshMessage(interaction);
    notifyStickyChange(interaction.client).catch(() => {});
  } catch (e) {
    warn(`[RADIO] handleRandom: ${e.message}`);
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }
}

module.exports = {
  handleSet,
  handleSetModal,
  handleRandom,
};
