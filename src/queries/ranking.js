'use strict';
/**
 * /ranking — rankings dos Bairristas (semanal/mensal/all-time).
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { bairristaStatsRepo } = require('../repositories');
const { weekBounds } = require('../util');
const { formatPtDateOnly } = require('../shared/formatPtDate');

async function handle(interaction) {
  const periodo = interaction.options.getString('periodo') || 'week';
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { start, end } = weekBounds();
  const weekStartStr = start.toISOString().split('T')[0];
  const now = new Date();
  const monthStartStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0];

  let rankings, title;
  if (periodo === 'month') {
    rankings = await bairristaStatsRepo.getTopBairristasMonthly(monthStartStr, 15);
    title = `🏆 Ranking Mensal — ${now.toLocaleString('pt-PT', { month: 'long', year: 'numeric' })}`;
  } else if (periodo === 'alltime') {
    rankings = await bairristaStatsRepo.getTopBairristasAllTime(15);
    title = '🏆 Ranking Histórico — Bairristas';
  } else {
    rankings = await bairristaStatsRepo.getTopBairristas(weekStartStr, 15);
    title = `🏆 Ranking Semanal — ${formatPtDateOnly(start)} → ${formatPtDateOnly(end)}`;
  }

  if (!rankings.length) {
    return safeReply(interaction, { content: 'Sem dados para este período.' }, { messageClass: 'BANAL' });
  }

  const medal = ['🥇', '🥈', '🥉'];
  const lines = rankings.map((r, i) => {
    const pos = Number(r.pos || i + 1);
    const prefix = pos <= 3 ? medal[pos - 1] : `**${pos}.**`;
    const score = Math.round(Number(r.hybrid_score || r.weighted_value || 0));
    const isMe = r.discord_id === interaction.user.id ? ' ← **tu**' : '';
    return `${prefix} <@${r.discord_id}> — **${score.toLocaleString('pt-PT')}** · ${r.deliveries || 0}e · ${r.sales || 0}v${isMe}`;
  });

  const embed = brandEmbed('TOP').setTitle(title).setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

module.exports = { handle };
