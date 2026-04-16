'use strict';
/**
 * Jobs de resumos automáticos para o canal dos Bairristas.
 *
 * - Resumo diário: total do dia, top 3, material mais entregue
 * - Resumo semanal: top 5, total da semana, maior subida, streaks
 * - Resumo mensal: top do mês, total, melhor performer, kills
 *
 * Publicados no canal log-bairristas via bairristaNotifier.
 */

const { bairristaStatsRepo } = require('../repositories');
const { publishSummary } = require('../inventory/bairristaNotifier');
const { brandEmbed, rankBadge, streakBadge } = require('../shared/embedBuilders');
const { BAIRRISTAS, EMOJI } = require('../content');
const { weekBounds } = require('../util');
const { log, warn } = require('../logger');
const CONFIG = require('../config');

// ═══════════════════════════════════════════════════════════════════════════
// RESUMO DIÁRIO
// ═══════════════════════════════════════════════════════════════════════════

async function publishBairristaDailySummary() {
  try {
    const summary = await bairristaStatsRepo.getDailySummary();
    if (!summary || summary.totalQty === 0) return { skipped: 'no_activity' };

    const S = BAIRRISTAS.SUMMARY;
    const embed = brandEmbed('MOVEMENT')
      .setColor(0x2ECC71)
      .setTitle(S.DAILY_TITLE(summary.date));

    embed.addFields({
      name: S.DAILY_TOTAL,
      value: `**${summary.totalQty.toLocaleString('pt-PT')}** unidades · **${summary.totalValue.toLocaleString('pt-PT', { maximumFractionDigits: 0 })}€**`,
      inline: false,
    });

    // Top 3 do dia
    if (summary.members.length) {
      const top3 = summary.members.slice(0, 3);
      const lines = top3.map((m, i) => {
        const prefix = rankBadge(i + 1);
        return `${prefix} <@${m.discord_id}> — **${Number(m.total_qty).toLocaleString('pt-PT')}** (${m.deliveries}e · ${m.sales}v)`;
      });
      embed.addFields({ name: S.DAILY_TOP, value: lines.join('\n'), inline: false });
    }

    if (summary.topItem) {
      embed.addFields({
        name: S.DAILY_TOP_ITEM,
        value: `**${summary.topItem.name}** — ${summary.topItem.qty}×`,
        inline: true,
      });
    }

    await publishSummary(embed);
    log(`[BAIRRISTA-SUMMARY] Resumo diário publicado: ${summary.totalQty} unidades.`);
    return { published: true, date: summary.date, totalQty: summary.totalQty };
  } catch (e) {
    warn(`[BAIRRISTA-SUMMARY] Falha no resumo diário: ${e.message}`);
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESUMO SEMANAL
// ═══════════════════════════════════════════════════════════════════════════

async function publishBairristaWeeklySummary() {
  try {
    const { start, end } = weekBounds();
    const weekStartStr = start.toISOString().split('T')[0];
    const weekLabel = `${weekStartStr} → ${end.toISOString().split('T')[0]}`;

    const top = await bairristaStatsRepo.getTopBairristas(weekStartStr, 5);
    if (!top.length) return { skipped: 'no_data' };

    const S = BAIRRISTAS.SUMMARY;
    const embed = brandEmbed('TOP')
      .setColor(0xF1C40F)
      .setTitle(S.WEEKLY_TITLE(weekLabel));

    const lines = top.map((r, i) => {
      const pos = Number(r.pos || i + 1);
      const prefix = rankBadge(pos);
      const score = Math.round(Number(r.hybrid_score || r.weighted_value || 0));
      return `${prefix} <@${r.discord_id}> — **${score.toLocaleString('pt-PT')}** · ${r.deliveries || 0}e · ${r.sales || 0}v · ${r.operations_count || 0}s`;
    });
    embed.addFields({ name: S.WEEKLY_TOP, value: lines.join('\n'), inline: false });

    // Total da semana
    const { rankingRepo } = require('../repositories');
    const weekSummary = await rankingRepo.getWeekSummary(weekStartStr);
    if (weekSummary) {
      embed.addFields({
        name: S.WEEKLY_TOTAL,
        value: `**${Number(weekSummary.total_deliveries || 0).toLocaleString('pt-PT')}** entregas · **${Number(weekSummary.total_sales || 0).toLocaleString('pt-PT')}** vendas · **${Number(weekSummary.total_kills || 0)}** kills`,
        inline: false,
      });
    }

    await publishSummary(embed);
    log(`[BAIRRISTA-SUMMARY] Resumo semanal publicado.`);
    return { published: true, weekStart: weekStartStr };
  } catch (e) {
    warn(`[BAIRRISTA-SUMMARY] Falha no resumo semanal: ${e.message}`);
    return { error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESUMO MENSAL
// ═══════════════════════════════════════════════════════════════════════════

async function publishBairristaMonthlySummary() {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString().split('T')[0];
    const monthLabel = now.toLocaleString('pt-PT', { month: 'long', year: 'numeric' });

    const top = await bairristaStatsRepo.getTopBairristasMonthly(monthStart, 5);
    if (!top.length) return { skipped: 'no_data' };

    const S = BAIRRISTAS.SUMMARY;
    const embed = brandEmbed('TOP')
      .setColor(0xE67E22)
      .setTitle(S.MONTHLY_TITLE(monthLabel));

    const lines = top.map((r, i) => {
      const pos = Number(r.pos || i + 1);
      const prefix = rankBadge(pos);
      const score = Math.round(Number(r.hybrid_score || r.weighted_value || 0));
      return `${prefix} <@${r.discord_id}> — **${score.toLocaleString('pt-PT')}** · ${r.deliveries || 0}e · ${r.sales || 0}v · ${r.kills_count || 0}k`;
    });
    embed.addFields({ name: S.MONTHLY_TOP, value: lines.join('\n'), inline: false });

    // Total mensal
    if (top.length) {
      const totalDeliveries = top.reduce((s, r) => s + (Number(r.deliveries) || 0), 0);
      const totalSales = top.reduce((s, r) => s + (Number(r.sales) || 0), 0);
      const totalKills = top.reduce((s, r) => s + (Number(r.kills_count) || 0), 0);
      embed.addFields({
        name: S.MONTHLY_TOTAL,
        value: `**${totalDeliveries.toLocaleString('pt-PT')}** entregas · **${totalSales.toLocaleString('pt-PT')}** vendas · **${totalKills}** kills`,
        inline: false,
      });
    }

    // Melhor performer (top 1)
    if (top[0]) {
      embed.addFields({
        name: S.MONTHLY_BEST,
        value: `${EMOJI.MEDAL_1} <@${top[0].discord_id}>`,
        inline: true,
      });
    }

    await publishSummary(embed);
    log(`[BAIRRISTA-SUMMARY] Resumo mensal publicado.`);
    return { published: true, monthStart };
  } catch (e) {
    warn(`[BAIRRISTA-SUMMARY] Falha no resumo mensal: ${e.message}`);
    return { error: e.message };
  }
}

module.exports = {
  publishBairristaDailySummary,
  publishBairristaWeeklySummary,
  publishBairristaMonthlySummary,
};
