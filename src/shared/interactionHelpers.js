'use strict';
const { MessageFlags } = require('discord.js');
const { warn } = require('../logger');
const { processedInteractionIds } = require('./sharedState');

const EPHEMERAL_AUTO_DELETE_MS = 20000;

function scheduleDeleteInteractionReply(interaction, ms = EPHEMERAL_AUTO_DELETE_MS) {
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, ms);
}

function scheduleDeleteMessage(message, ms = EPHEMERAL_AUTO_DELETE_MS) {
  if (!message) return;
  setTimeout(() => {
    message.delete().catch(() => {});
  }, ms);
}

async function safeReply(interaction, payload) {
  const isEphemeral = payload?.flags === 64
    || payload?.flags === MessageFlags.Ephemeral
    || payload?.ephemeral === true;

  const result = interaction.replied
    ? await interaction.followUp(payload).catch(() => null)
    : interaction.deferred
      ? await interaction.editReply(payload).catch(() => null)
      : await interaction.reply(payload).catch(() => null);

  if (isEphemeral && result) scheduleDeleteInteractionReply(interaction, EPHEMERAL_AUTO_DELETE_MS);
  return result;
}

async function safeShowModal(interaction, modal) {
  try {
    await interaction.showModal(modal);
    return true;
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (String(e?.code || '') === '10062' || msg.includes('Unknown interaction')) {
      warn('[MODAL] Interação expirada.');
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'A interação expirou. Tenta novamente.',
          flags: MessageFlags.Ephemeral
        }).catch(() => null);
      }
      return false;
    }
    if (String(e?.code || '') === '40060' || msg.includes('already been acknowledged')) {
      return false;
    }
    throw e;
  }
}

function isDuplicate(interactionId, ttlMs = 15000) {
  const until = processedInteractionIds.get(interactionId) || 0;
  if (Date.now() < until) return true;
  processedInteractionIds.set(interactionId, Date.now() + ttlMs);
  return false;
}

function getModalField(interaction, fieldId) {
  try {
    return interaction.fields.getTextInputValue(fieldId);
  } catch {
    return '';
  }
}

function safeCustomId(parts, separator = '::') {
  const id = parts.join(separator);
  if (id.length > 100) {
    warn(`[CUSTOM_ID] Truncated: ${id.slice(0, 50)}...`);
    return id.slice(0, 100);
  }
  return id;
}

async function safePanelRefresh(message, payload, label = 'PANEL') {
  if (!message) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await message.edit(payload);
      return true;
    } catch (e) {
      const code = String(e?.code || '');
      if (code === '10008' || String(e?.message || '').includes('Unknown Message')) {
        warn(`[${label}] Mensagem do painel já não existe.`);
        return false;
      }
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 500));
      } else {
        warn(`[${label}] Falha ao atualizar painel: ${e?.message}`);
      }
    }
  }
  return false;
}

module.exports = {
  scheduleDeleteInteractionReply,
  scheduleDeleteMessage,
  safeReply,
  safeShowModal,
  isDuplicate,
  getModalField,
  safeCustomId,
  safePanelRefresh,
};
