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
} = require('./radioEngine');
const { safeReply } = require('../shared/interactionHelpers');
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
    const meta = TYPE_META[type];
    return safeReply(interaction, {
      content: `${meta.emoji} ${meta.label} aleatória: \`${result.value}\` (era \`${result.previous || '∅'}\`).`,
    }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
  }
}

async function handleSet(interaction) {
  const [, , type] = parseId(interaction.customId);
  if (!TYPE_META[type]) return;
  const meta = TYPE_META[type];
  // Abre modal para o user inserir o valor.
  const modal = new ModalBuilder()
    .setCustomId(`radio::modal_set::${type}`)
    .setTitle(`Definir Rádio ${meta.label}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(`Valor da rádio ${meta.label.toLowerCase()}`)
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
    // Actualiza a mensagem original do painel se vinher de lá. Aqui só temos
    // a interaction do modal — o painel é refrescado quando alguém carregar
    // em refresh (ou via sticky update na fase 5).
    const meta = TYPE_META[type];
    return safeReply(interaction, {
      content: `${meta.emoji} ${meta.label}: \`${result.previous || '∅'}\` → \`${result.value}\`.`,
    }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
  }
}

async function handleSwap(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const swapped = await swapRadios({ actorId: interaction.user.id });
    await refreshMessage(interaction);
    return safeReply(interaction, {
      content: `🔁 Trocadas: 📻 \`${swapped.principal}\` • 🤝 \`${swapped.parceria}\`.`,
    }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
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
  return safeReply(interaction, { content: '🔄 Atualizado.' }, { dismissible: true });
}

module.exports = {
  handleRandom, handleSet, handleSetModal, handleSwap, handleHistory, handleRefresh,
};
