'use strict';
/**
 * /rebuild — recalcular rankings mensais + all-time.
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { ERRORS, EMOJI } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { computeMonthlyRankings, recomputeAllTimeStats } = require('../rankings/monthlyRankingEngine');

async function handle(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('rebuild rankings'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const t0 = Date.now();
  const m = await computeMonthlyRankings();
  const a = await recomputeAllTimeStats();
  return safeReply(interaction, {
    content: `${EMOJI.REFRESH} Rankings recalculados em ${Date.now() - t0}ms — ${m.count} membros no mês ${m.monthStart}, ${a.count} all-time.`,
  }, { dismissible: true });
}

module.exports = { handle };
