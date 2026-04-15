'use strict';
const { computeWeeklyRankings, getCurrentWeekRanking, getWeekSummary } = require('./rankingEngine');
const { rankingEmbed, brandEmbed } = require('../shared/embedBuilders');
const { weekBounds } = require('../util');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { jobRepo } = require('../repositories');

async function alreadyPublishedSince(jobName, sinceDate) {
  const recent = await jobRepo.getRecent(jobName, 50);
  return recent.some(r => r.status === 'completed'
    && r.result && r.result.published === true
    && new Date(r.started_at) >= sinceDate);
}

async function publishWeeklyTop(client) {
  if (!CONFIG.WEEKLY_TOP_CHANNEL_ID) return { skipped: 'no_channel' };

  const now = new Date();
  if (now.getDay() !== CONFIG.WEEKLY_TOP_DAY || now.getHours() !== CONFIG.WEEKLY_TOP_HOUR) {
    return { skipped: 'wrong_time' };
  }

  const { start, end } = weekBounds();
  if (await alreadyPublishedSince('weekly_rankings', start)) {
    return { skipped: 'already_published', weekStart: start.toISOString() };
  }

  try {
    await computeWeeklyRankings();

    const rankings = await getCurrentWeekRanking(10);
    const weekLabel = `${start.toISOString().split('T')[0]} a ${end.toISOString().split('T')[0]}`;

    const embed = rankingEmbed('Top Semanal', rankings, weekLabel);

    const summary = await getWeekSummary();
    if (summary) {
      embed.addFields(
        { name: 'Total Entregas', value: String(summary.total_deliveries || 0), inline: true },
        { name: 'Total Vendas', value: String(summary.total_sales || 0), inline: true },
        { name: 'Total Operações', value: String(summary.total_operations || 0), inline: true },
      );
    }

    const channel = await client.channels.fetch(CONFIG.WEEKLY_TOP_CHANNEL_ID).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [embed] });
      log('[RANKINGS] Top semanal publicado.');
      return { published: true, weekStart: start.toISOString() };
    }
    return { skipped: 'channel_unavailable' };
  } catch (e) {
    warn(`[RANKINGS] Falha ao publicar top semanal: ${e.message}`);
    throw e;
  }
}

async function publishDailySummary(client) {
  if (!CONFIG.DAILY_SUMMARY_CHANNEL_ID) return { skipped: 'no_channel' };

  const now = new Date();
  if (now.getHours() !== CONFIG.DAILY_SUMMARY_HOUR) {
    return { skipped: 'wrong_hour' };
  }

  const today = new Date().toISOString().split('T')[0];
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  if (await alreadyPublishedSince('daily_summary', startOfDay)) {
    return { skipped: 'already_published', date: today };
  }

  try {
    const { operationRepo } = require('../repositories');

    const todayOps = await operationRepo.findByDate(today);
    const { memberRepo } = require('../repositories');
    const counts = await memberRepo.countByRole();

    const embed = brandEmbed()
      .setTitle(`Resumo Diário — ${today}`)
      .addFields(
        { name: 'Moradores Ativos', value: String(counts.morador || 0), inline: true },
        { name: 'Oficiais Ativos', value: String(counts.oficial || 0), inline: true },
        { name: 'Operações Hoje', value: String(todayOps.length), inline: true },
      );

    if (todayOps.length > 0) {
      const opLines = todayOps.map(op => `#${op.id} — ${op.operation_type} (${op.status})`);
      embed.addFields({ name: 'Operações', value: opLines.join('\n') });
    }

    const channel = await client.channels.fetch(CONFIG.DAILY_SUMMARY_CHANNEL_ID).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [embed] });
      log('[SUMMARY] Resumo diário publicado.');
      return { published: true, date: today };
    }
    return { skipped: 'channel_unavailable' };
  } catch (e) {
    warn(`[SUMMARY] Falha ao publicar resumo: ${e.message}`);
    throw e;
  }
}

module.exports = { publishWeeklyTop, publishDailySummary };
