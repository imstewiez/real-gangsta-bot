'use strict';
/**
 * Handlers para interações de disponibilidade.
 *
 * customIds usados:
 *   avail::vote_select::<sessionId>      — StringSelectMenu (slot:state)
 *   avail::all::<sessionId>::<state>     — Botão "para todos os slots"
 *   avail::summary::<sessionId>          — Botão resumo (ephemeral)
 *   avail::refresh::<sessionId>          — Botão refresh do embed
 */

const { MessageFlags } = require('discord.js');
const { availabilityRepo } = require('../repositories');
const { recordVote, recordBulkVote, updateSessionMessage, getSummaryText } = require('./availabilityEngine');
const { stateMeta } = require('./availabilityTemplates');
const { safeReply } = require('../shared/interactionHelpers');
const { warn } = require('../logger');

function parseId(customId) {
  return customId.split('::');
}

async function handleVoteSelect(interaction) {
  const [, , sessionIdStr] = parseId(interaction.customId);
  const sessionId = parseInt(sessionIdStr, 10);
  const value = interaction.values[0]; // "<slotId>:<state>"
  if (!value) return safeReply(interaction, { content: 'Sem opção seleccionada.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  const [slotIdStr, state] = value.split(':');
  const slotId = parseInt(slotIdStr, 10);

  const result = await recordVote({
    client: interaction.client,
    sessionId, slotId,
    discordUserId: interaction.user.id,
    voteState: state,
  });

  if (!result.ok) {
    const reasons = {
      session_not_found: 'Sessão não encontrada.',
      session_closed: 'Sessão fechada — votos congelados.',
      invalid_state: 'Estado inválido.',
    };
    return safeReply(interaction, { content: reasons[result.reason] || 'Não foi possível registar o voto.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  // Confirmar ao votante o slot e estado escolhido (precisamos do label).
  const slots = await availabilityRepo.getSlots(sessionId);
  const slot = slots.find(s => s.id === slotId);
  const m = stateMeta(state);
  return safeReply(interaction, {
    content: `${m.emoji} Voto registado: **${slot?.slot_label || slotId}** → **${m.label}**`,
    flags: MessageFlags.Ephemeral,
  }, { dismissible: true });
}

async function handleVoteAll(interaction) {
  const [, , sessionIdStr, state] = parseId(interaction.customId);
  const sessionId = parseInt(sessionIdStr, 10);

  const result = await recordBulkVote({
    client: interaction.client,
    sessionId,
    discordUserId: interaction.user.id,
    voteState: state,
  });

  if (!result.ok) {
    return safeReply(interaction, { content: 'Não foi possível registar.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  const m = stateMeta(state);
  return safeReply(interaction, {
    content: `${m.emoji} ${result.count} slot(s) marcados como **${m.label}**.`,
    flags: MessageFlags.Ephemeral,
  }, { dismissible: true });
}

async function handleSummary(interaction) {
  const [, , sessionIdStr] = parseId(interaction.customId);
  const sessionId = parseInt(sessionIdStr, 10);
  const text = await getSummaryText(sessionId);
  if (!text) return safeReply(interaction, { content: 'Sessão não encontrada.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  return safeReply(interaction, { content: text.slice(0, 1900), flags: MessageFlags.Ephemeral }, { dismissible: true });
}

async function handleRefresh(interaction) {
  const [, , sessionIdStr] = parseId(interaction.customId);
  const sessionId = parseInt(sessionIdStr, 10);
  try {
    await updateSessionMessage(interaction.client, sessionId);
    return safeReply(interaction, { content: '🔁 Atualizado.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  } catch (e) {
    warn(`[AVAIL] refresh falhou: ${e.message}`);
    return safeReply(interaction, { content: 'Não foi possível atualizar.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
}

module.exports = {
  handleVoteSelect,
  handleVoteAll,
  handleSummary,
  handleRefresh,
};
