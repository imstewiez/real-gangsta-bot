'use strict';
const { computeWeeklyRankings, getCurrentWeekRanking, getWeekSummary } = require('./rankingEngine');
const { rankingEmbed, brandEmbed } = require('../shared/embedBuilders');
const { weekBounds } = require('../util');
const CONFIG = require('../config');
const { log, warn } = require('../logger');

async function publishWeeklyTop(client) {
  if (!CONFIG.WEEKLY_TOP_CHANNEL_ID) return;

  try {
    await computeWeeklyRankings();

    const rankings = await getCurrentWeekRanking(10);
    const { start, end } = weekBounds();
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
    }
  } catch (e) {
    warn(`[RANKINGS] Falha ao publicar top semanal: ${e.message}`);
  }
}

async function publishDailySummary(client) {
  if (!CONFIG.DAILY_SUMMARY_CHANNEL_ID) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    const { operationRepo, inventoryRepo } = require('../repositories');

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
    }
  } catch (e) {
    warn(`[SUMMARY] Falha ao publicar resumo: ${e.message}`);
  }
}

module.exports = { publishWeeklyTop, publishDailySummary };
