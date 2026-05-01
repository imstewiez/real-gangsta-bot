'use strict';
/**
 * Handlers para interações de disponibilidade.
 *
 * customIds usados:
 *   avail::vote_select::<sessionId>      — StringSelectMenu (range:state)
 *   avail::all::<sessionId>::<state>     — Botão "para todos os slots"
 *   avail::summary::<sessionId>          — Botão resumo (ephemeral)
 *   avail::refresh::<sessionId>          — Botão refresh do embed
 */

const { MessageFlags } = require('discord.js');
const { recordRangeVote, recordBulkVote, updateSessionMessage, getSummaryText } = require('./availabilityEngine');
const { stateMeta } = require('./availabilityTemplates');
const { safeReply } = require('../shared/interactionHelpers');
const { AVAILABILITY, EMOJI, ERRORS } = require('../content');
const { warn } = require('../logger');

function parseId(customId) {
  return customId.split('::');
}

async function handleVoteSelect(interaction) {
  const [, , sessionIdStr] = parseId(interaction.customId);
  const sessionId = parseInt(sessionIdStr, 10);
  const value = interaction.values[0];
  if (!value)
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Sem opção escolhida.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );

  const result = await recordRangeVote({
    client: interaction.client,
    sessionId,
    discordUserId: interaction.user.id,
    value,
  });

  if (!result.ok) {
    return safeReply(
      interaction,
      {
        content: AVAILABILITY.REASON[result.reason] || `${EMOJI.WARN} Não foi possível registar.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  if (result.state === 'limpar') {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.INFO} Marcações removidas (${result.count} slot${result.count === 1 ? '' : 's'}).`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  const m = stateMeta(result.state);
  const rangeName = _rangeLabelFromValue(value);
  return safeReply(
    interaction,
    {
      content: `${m.emoji} Marcado como **${m.label}** — ${rangeName}.`,
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'BANAL' }
  );
}

function _rangeLabelFromValue(value) {
  const [rangeKey] = value.split(':');
  const map = {
    dia_todo: 'dia todo',
    tarde: 'tarde (12–18h)',
    noite: 'noite (18–00h)',
    madrugada: 'madrugada (22–02h)',
    limpar: 'limpar',
  };
  if (map[rangeKey]) return map[rangeKey];
  // slot individual — o rangeKey é o label do slot (ex: "14:00")
  return rangeKey;
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
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Não foi possível registar.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  const m = stateMeta(state);
  return safeReply(
    interaction,
    {
      content: AVAILABILITY.VOTE_BULK_RECORDED(result.count, m.label, m.emoji),
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'BANAL' }
  );
}

async function handleSummary(interaction) {
  const [, , sessionIdStr] = parseId(interaction.customId);
  const sessionId = parseInt(sessionIdStr, 10);
  const text = await getSummaryText(sessionId);
  if (!text)
    return safeReply(
      interaction,
      { content: ERRORS.SESSION_NOT_FOUND(), flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  return safeReply(
    interaction,
    { content: text.slice(0, 1900), flags: MessageFlags.Ephemeral },
    { messageClass: 'BANAL' }
  );
}

async function handleRefresh(interaction) {
  const [, , sessionIdStr] = parseId(interaction.customId);
  const sessionId = parseInt(sessionIdStr, 10);
  try {
    await updateSessionMessage(interaction.client, sessionId);
    return safeReply(
      interaction,
      { content: `${EMOJI.REFRESH} Actualizado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  } catch (e) {
    warn(`[AVAIL] refresh falhou: ${e.message}`);
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Não foi possível actualizar.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
}

module.exports = {
  handleVoteSelect,
  handleVoteAll,
  handleSummary,
  handleRefresh,
};
