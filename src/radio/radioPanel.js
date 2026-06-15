'use strict';

const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const CONFIG = require('../config');
const { getStateKey, setStateKey } = require('../state');
const { button, buttonRow } = require('../shared/ui/buttons');
const { safeReply, safeShowModal, getModalField } = require('../shared/interactionHelpers');
const { isCommand, isSupervisor, isPatraoDiZona } = require('../permissions/permissionEngine');
const { log, warn } = require('../logger');

const RADIO_STATE_KEY = 'radioFrequencyPanel';
const PANEL_MESSAGES_KEY = 'panelMessages';
const RADIO_MIN = 0;
const RADIO_MAX = 4999;

function canManageRadio(member) {
  return isCommand(member) || isSupervisor(member) || isPatraoDiZona(member);
}

async function getLogoUrl() {
  try {
    const { resolveLogoUrl } = require('../panels/entradaPanel');
    return (await resolveLogoUrl()) || '';
  } catch (_) {
    return CONFIG.BALLAS_GANG_LOGO_URL || CONFIG.BOT_LOGO_URL || '';
  }
}

async function getRadioState() {
  return getStateKey(RADIO_STATE_KEY, {
    frequency: null,
    updated_by: null,
    updated_by_name: null,
    updated_at: null,
  });
}

async function setRadioFrequency(frequency, actor) {
  const value = Number.parseInt(frequency, 10);
  if (!Number.isInteger(value) || value < RADIO_MIN || value > RADIO_MAX) {
    throw new Error(`A frequência tem de ser um número entre ${RADIO_MIN} e ${RADIO_MAX}.`);
  }

  const state = {
    frequency: value,
    updated_by: actor?.id || null,
    updated_by_name: actor?.displayName || actor?.user?.username || actor?.username || null,
    updated_at: new Date().toISOString(),
  };
  await setStateKey(RADIO_STATE_KEY, state);
  return state;
}

function formatFrequency(value) {
  if (value === null || value === undefined || value === '') return 'Ainda não definida';
  return String(value);
}

function buildButtons() {
  return [
    buttonRow(
      button({ customId: 'radio::random', label: 'Gerar aleatória', style: 'Primary', emoji: '🎲' }),
      button({ customId: 'radio::manual', label: 'Inserir manualmente', style: 'Secondary', emoji: '📡' })
    ),
  ];
}

async function buildRadioPanel() {
  const state = await getRadioState();
  const logoUrl = await getLogoUrl();
  const freq = formatFrequency(state.frequency);

  const embed = new EmbedBuilder()
    .setColor(0x7b2cbf)
    .setTitle('🟣 Rádio do Bairro')
    .setDescription(
      'Comunicação limpa, direta e sem confusão. A rádio atual do bairro fica sempre aqui visível.\n\n' +
        `# 📡 ${freq}`
    )
    .setFooter({ text: '— Ballas Gang', iconURL: logoUrl || undefined });

  if (logoUrl) embed.setThumbnail(logoUrl);

  if (state.updated_by) {
    embed.addFields({
      name: 'Última alteração',
      value: `<@${state.updated_by}>${state.updated_at ? ` · <t:${Math.floor(new Date(state.updated_at).getTime() / 1000)}:R>` : ''}`,
      inline: false,
    });
  }

  return { embeds: [embed], components: buildButtons(), allowedMentions: { parse: [] } };
}

async function updateRadioPanelMessage(client) {
  const channelId = CONFIG.RADIO_PANEL_CHANNEL_ID || '1490397808531079449';
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) {
    warn(`[RADIO] Canal ${channelId} não encontrado ou não é texto.`);
    return null;
  }

  const panelMessages = await getStateKey(PANEL_MESSAGES_KEY, {});
  const messageId = panelMessages.panel_radio;
  const payload = await buildRadioPanel();

  if (messageId) {
    const existing = await channel.messages.fetch(messageId).catch(() => null);
    if (existing) {
      await existing.edit(payload);
      return existing;
    }
  }

  const msg = await channel.send(payload);
  panelMessages.panel_radio = msg.id;
  await setStateKey(PANEL_MESSAGES_KEY, panelMessages);
  return msg;
}

async function handleRadioRandomButton(interaction) {
  if (!canManageRadio(interaction.member)) {
    return safeReply(interaction, {
      content: '🚫 Não tens permissão para alterar a rádio. Apenas Patrao di Zona, Real Gangster, OG, Kingpin e Manda-Chuva podem trocar.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const value = Math.floor(Math.random() * (RADIO_MAX + 1));
  await setRadioFrequency(value, interaction.member || interaction.user);
  await updateRadioPanelMessage(interaction.client);
  log(`[RADIO] Frequência aleatória definida para ${value} por ${interaction.user.id}.`);

  return safeReply(interaction, {
    content: `📡 Frequência atualizada para **${value}**.`,
  });
}

async function handleRadioManualButton(interaction) {
  if (!canManageRadio(interaction.member)) {
    return safeReply(interaction, {
      content: '🚫 Não tens permissão para alterar a rádio. Apenas Patrao di Zona, Real Gangster, OG, Kingpin e Manda-Chuva podem trocar.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('radio::manual_modal')
    .setTitle('Definir frequência de rádio')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('frequency')
          .setLabel('Frequência')
          .setPlaceholder('Ex: 4791')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4)
      )
    );

  return safeShowModal(interaction, modal);
}

async function handleRadioManualModal(interaction) {
  if (!canManageRadio(interaction.member)) {
    return safeReply(interaction, {
      content: '🚫 Não tens permissão para alterar a rádio.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const raw = getModalField(interaction, 'frequency').trim();
  if (!/^\d{1,4}$/.test(raw)) {
    return safeReply(interaction, {
      content: '⚠️ A frequência tem de ser um número inteiro entre 0 e 4999.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const value = Number.parseInt(raw, 10);
  if (value < RADIO_MIN || value > RADIO_MAX) {
    return safeReply(interaction, {
      content: '⚠️ A frequência tem de estar entre 0 e 4999.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await setRadioFrequency(value, interaction.member || interaction.user);
  await updateRadioPanelMessage(interaction.client);
  log(`[RADIO] Frequência manual definida para ${value} por ${interaction.user.id}.`);

  return safeReply(interaction, { content: `📡 Frequência atualizada para **${value}**.` });
}

module.exports = {
  buildRadioPanel,
  handleRadioRandomButton,
  handleRadioManualButton,
  handleRadioManualModal,
  updateRadioPanelMessage,
  setRadioFrequency,
  getRadioState,
  canManageRadio,
};
