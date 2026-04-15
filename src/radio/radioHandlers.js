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

const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { radioRepo } = require('../repositories');
const {
  setRadio, setRandom, swapRadios, buildEmbed, buildComponents, historyText, TYPE_META,
  notifyStickyChange,
} = require('./radioEngine');
const { safeReply } = require('../shared/interactionHelpers');
const { RADIO, EMOJI } = require('../content');
const { warn } = require('../logger');

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
  const [, , type] = parseId(interaction.customId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const result = await setRandom({ type, actorId: interaction.user.id });
    await refreshMessage(interaction);
    notifyStickyChange(interaction.client).catch(() => {});
    const meta = TYPE_META[type];
    return safeReply(interaction, {
      content: RADIO.RANDOM(meta.label, meta.emoji, result.previous, result.value),
    }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }
}

async function handleSet(interaction) {
  const [, , type] = parseId(interaction.customId);
  if (!TYPE_META[type]) return;
  const meta = TYPE_META[type];
  const modal = new ModalBuilder()
    .setCustomId(`radio::modal_set::${type}`)
    .setTitle(`Rádio ${meta.label}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(`Valor (${meta.label.toLowerCase()})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(8)
          .setPlaceholder('Ex: 4321'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('note')
          .setLabel('Nota (opcional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(120),
      ),
    );
  return interaction.showModal(modal);
}

async function handleSetModal(interaction) {
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
    return safeReply(interaction, {
      content: RADIO.SET(meta.label, meta.emoji, result.previous, result.value),
    }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }
}

async function handleSwap(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const swapped = await swapRadios({ actorId: interaction.user.id });
    await refreshMessage(interaction);
    notifyStickyChange(interaction.client).catch(() => {});
    return safeReply(interaction, {
      content: RADIO.SWAPPED(swapped.principal, swapped.parceria),
    }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }
}

async function handleHistory(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const text = await historyText(15);
  return safeReply(interaction, { content: text.slice(0, 1900) }, { dismissible: true });
}

async function handleRefresh(interaction) {
  await refreshMessage(interaction);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return safeReply(interaction, { content: `${EMOJI.REFRESH} Actualizado.` }, { dismissible: true });
}

module.exports = {
  handleRandom, handleSet, handleSetModal, handleSwap, handleHistory, handleRefresh,
};
