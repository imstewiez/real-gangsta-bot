'use strict';
/**
 * Handlers para botões/modais do painel de rádio.
 *
 * customIds:
 *   radio::random::<type>    botão — gera aleatória para <type>
 *   radio::set::<type>       botão — abre modal para inserir valor
 *   radio::modal_set         modal — submete o valor (carrega type do title)
 *   radio::swap              botão — troca principal ↔ parceria
 *   radio::history           botão — ephemeral com últimas alterações
 *   radio::refresh           botão — re-edita a mensagem com estado actual
 */

const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { radioRepo } = require('../repositories');
const {
  setRadio,
  setRandom,
  swapRadios,
  buildEmbed,
  buildComponents,
  historyText,
  TYPE_META,
  notifyStickyChange,
} = require('./radioEngine');
const { safeReply } = require('../shared/interactionHelpers');
const { successEmbed, brandEmbed } = require('../shared/embedBuilders');
const { isOficial, isChefia } = require('../permissions/permissionEngine');
const { RADIO, EMOJI, MODALS } = require('../content');
const { warn } = require('../logger');

// OG+ = Oficial (OG, Real Gangster) ou Chefia (Kingpin, Manda-Chuva).
function _canManageRadio(member) {
  return isOficial(member) || isChefia(member);
}

async function _denyIfNotOG(interaction) {
  if (_canManageRadio(interaction.member)) return false;
  const { MessageFlags } = require('discord.js');
  await safeReply(
    interaction,
    {
      content: `${EMOJI.BLOQUEADO} Apenas OG+ pode alterar a rádio.`,
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
  // Re-edita a própria mensagem do botão (mantemos o painel actualizado).
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

async function handleRandom(interaction) {
  if (await _denyIfNotOG(interaction)) return;
  const [, , type] = parseId(interaction.customId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = await setRandom({ type, actorId: interaction.user.id });
    await refreshMessage(interaction);
    notifyStickyChange(interaction.client).catch(() => {});
    const meta = TYPE_META[type];
    const embed = successEmbed(
      RADIO.RANDOM_TITLE,
      `**${meta.label}**\n${RADIO.LABELS.ANTES}: \`${result.previous || '—'}\`\n${RADIO.LABELS.AGORA}: \`${result.value}\``
    );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'RESULT' });
  }
}

async function handleSet(interaction) {
  if (await _denyIfNotOG(interaction)) return;
  const [, , type] = parseId(interaction.customId);
  if (!TYPE_META[type]) return;
  const meta = TYPE_META[type];
  const M = MODALS.RADIO_SET;
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
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('note')
          .setLabel('Nota (opcional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(120)
      )
    );
  return interaction.showModal(modal);
}

async function handleSetModal(interaction) {
  if (await _denyIfNotOG(interaction)) return;
  const [, , type] = parseId(interaction.customId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const value = interaction.fields.getTextInputValue('value');
  const note = interaction.fields.getTextInputValue('note') || '';
  try {
    const result = await setRadio({ type, value, mode: 'manual', actorId: interaction.user.id, note });
    // Sticky radio:current refresca-se via notifyStickyChange — o painel-fonte
    // é actualizado pelo refresh button.
    notifyStickyChange(interaction.client).catch(() => {});
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

async function handleSwap(interaction) {
  if (await _denyIfNotOG(interaction)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const swapped = await swapRadios({ actorId: interaction.user.id });
    await refreshMessage(interaction);
    notifyStickyChange(interaction.client).catch(() => {});
    const embed = successEmbed(
      RADIO.SWAP_TITLE,
      `${RADIO.LABELS.PRINCIPAL}: \`${swapped.principal}\`\n${RADIO.LABELS.PARCERIA}: \`${swapped.parceria}\``
    );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'RESULT' });
  }
}

async function handleHistory(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const text = await historyText(15);
  return safeReply(interaction, { content: text.slice(0, 1900) }, { messageClass: 'ERROR' });
}

async function handleRefresh(interaction) {
  await refreshMessage(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return safeReply(interaction, { content: `${EMOJI.REFRESH} Actualizado.` }, { messageClass: 'BANAL' });
}

module.exports = {
  handleRandom,
  handleSet,
  handleSetModal,
  handleSwap,
  handleHistory,
  handleRefresh,
};
