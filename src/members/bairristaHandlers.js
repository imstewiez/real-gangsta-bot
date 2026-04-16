'use strict';
/**
 * Handlers do ecossistema Bairristas — Meu Ponto, Ranking, Progresso.
 *
 * CustomIds:
 *   morador::meu_ponto       → ficha completa (material + ranking + combate + tier)
 *   morador::ranking         → ranking semanal/mensal com dropdown de período
 *   morador::progresso_tier  → progresso para próximo tier
 *
 * Os antigos morador::totais, morador::my_performance, morador::my_material,
 * morador::my_profit continuam a funcionar via handlers existentes.
 */

const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { bairristaStatsRepo } = require('../repositories');
const { safeReply, safeUpdate, isDuplicate } = require('../shared/interactionHelpers');
const {
  brandEmbed, applyLogo, progressBar, rankBadge, streakBadge,
  sectionDivider, formatDelta,
} = require('../shared/embedBuilders');
const { BAIRRISTAS, EMOJI } = require('../content');
const { getPromotionProgress, formatTierName } = require('./autoPromotionEngine');
const { weekBounds } = require('../util');
const { buttonRow, button } = require('../shared/ui/buttons');

// ═══════════════════════════════════════════════════════════════════════════
// MEU PONTO — ficha completa do Bairrista
// ═══════════════════════════════════════════════════════════════════════════

async function handleMeuPonto(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const profile = await bairristaStatsRepo.getFullProfile(interaction.user.id);
  if (!profile) {
    return safeReply(interaction, {
      embeds: [brandEmbed().setTitle(`${EMOJI.TOPO} Meu Ponto`)
        .setDescription(BAIRRISTAS.MEU_PONTO.NO_DATA)],
    }, { dismissible: true });
  }

  const { member, material, ranking, evolution, streak, saida } = profile;
  const P = BAIRRISTAS.MEU_PONTO;
  const embed = applyLogo(brandEmbed('TOP'))
    .setTitle(P.TITLE(member.display_name || member.nickname || member.username));

  // ── Material ─────────────────────────────────────────────────────────
  const fmtQty = (n) => (n || 0).toLocaleString('pt-PT');
  const fmtVal = (n) => `${(n || 0).toLocaleString('pt-PT', { maximumFractionDigits: 0 })}€`;

  // ── KPI stripe topo — leitura em 3 segundos ──────────────────────────
  const kpiParts = [];
  if (ranking.week) {
    let rk = `${rankBadge(ranking.week.position)} #${ranking.week.position}/${ranking.week.total}`;
    if (evolution?.positionDelta != null) {
      if (evolution.positionDelta > 0) rk += ` ↑${evolution.positionDelta}`;
      else if (evolution.positionDelta < 0) rk += ` ↓${Math.abs(evolution.positionDelta)}`;
    }
    kpiParts.push(rk);
  }
  if (material.week?.totalQty) kpiParts.push(`${EMOJI.MATERIAL} ${fmtQty(material.week.totalQty)}`);
  if (saida && saida.total > 0) {
    kpiParts.push(`${EMOJI.KILL} ${saida.kills}k · ${saida.kdRatio.toFixed(1)} K/D`);
  }
  if (streak?.currentStreak > 0) kpiParts.push(`🔥 ${streak.currentStreak}w`);
  if (kpiParts.length) {
    embed.setDescription(kpiParts.join(' · '));
  }

  const weekLine = material.week
    ? `**${fmtQty(material.week.totalQty)}** (${material.week.deliveries}e · ${material.week.sales}v)`
    : '0';
  const monthLine = material.month
    ? `**${fmtQty(material.month.totalQty)}** (${material.month.deliveries}e · ${material.month.sales}v)`
    : '0';
  const allTimeLine = material.allTime
    ? `**${fmtQty(material.allTime.totalQty)}** (${material.allTime.deliveries}e · ${material.allTime.sales}v)`
    : '0';

  embed.addFields(
    { name: P.MATERIAL_TITLE, value: '\u200b', inline: false },
    { name: P.WEEK_LABEL, value: weekLine, inline: true },
    { name: P.MONTH_LABEL, value: monthLine, inline: true },
    { name: P.ALLTIME_LABEL, value: allTimeLine, inline: true },
  );

  // ── Ranking ──────────────────────────────────────────────────────────
  const rankLines = [];
  if (ranking.week) {
    let weekRankStr = `${rankBadge(ranking.week.position)}/${ranking.week.total}`;
    if (evolution?.positionDelta != null) {
      if (evolution.positionDelta > 0) weekRankStr += ` ↑${evolution.positionDelta}`;
      else if (evolution.positionDelta < 0) weekRankStr += ` ↓${Math.abs(evolution.positionDelta)}`;
      else weekRankStr += ' →';
    }
    rankLines.push(`**${P.WEEK_RANK}:** ${weekRankStr}`);
  }
  if (ranking.month) {
    rankLines.push(`**${P.MONTH_RANK}:** ${rankBadge(ranking.month.position)}/${ranking.month.total}`);
  }
  if (ranking.allTime) {
    rankLines.push(`**${P.ALLTIME_RANK}:** ${rankBadge(ranking.allTime.position)}/${ranking.allTime.total}`);
  }

  if (ranking.week?.above) {
    rankLines.push(`${P.ABOVE}: **${ranking.week.above.displayName}** (${fmtQty(Math.round(ranking.week.above.score))})`);
  }
  if (ranking.week?.below) {
    rankLines.push(`${P.BELOW}: **${ranking.week.below.displayName}** (${fmtQty(Math.round(ranking.week.below.score))})`);
  }

  if (rankLines.length) {
    embed.addFields({ name: P.RANKING_TITLE, value: rankLines.join('\n'), inline: false });
  }

  // ── Combate ──────────────────────────────────────────────────────────
  if (saida && saida.total > 0) {
    embed.addFields(
      { name: P.SAIDA_TITLE, value: '\u200b', inline: false },
      { name: P.SAIDAS, value: `**${saida.total}**`, inline: true },
      { name: P.KILLS, value: `**${saida.kills}**`, inline: true },
      { name: P.DEATHS, value: `**${saida.deaths}**`, inline: true },
      { name: P.KD, value: `**${saida.kdRatio.toFixed(2)}**`, inline: true },
      { name: P.SURVIVAL, value: `**${saida.survivalRate.toFixed(1)}%**`, inline: true },
      { name: P.MVP, value: `**${saida.mvpCount}**`, inline: true },
    );
  }

  // ── Streak ───────────────────────────────────────────────────────────
  if (streak && streak.currentStreak > 0) {
    const badge = streakBadge(streak.currentStreak);
    embed.addFields({
      name: P.STREAK_TITLE,
      value: `${P.CURRENT_STREAK}: **${streak.currentStreak}** ${P.WEEKS} ${badge}\n` +
             `${P.BEST_STREAK}: **${streak.bestStreak}** ${P.WEEKS}`,
      inline: false,
    });
  }

  // ── Progresso de tier ────────────────────────────────────────────────
  const progress = await getPromotionProgress(interaction.user.id).catch(() => null);
  if (progress) {
    if (!progress.maxedOut && progress.threshold) {
      const bar = progressBar(parseFloat(progress.progress), 100, { width: 14 });
      embed.addFields({
        name: `${P.PROGRESSO_TITLE} — ${progress.currentTierName} → ${progress.nextTierName}`,
        value: `${bar} **${progress.progress}%**\n` +
          `**${fmtQty(progress.totalQty)}** / ${fmtQty(progress.threshold)} · falta **${fmtQty(progress.remaining)}**`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: P.PROGRESSO_TITLE,
        value: `**${progress.currentTierName}** — ${BAIRRISTAS.PROGRESS.MAXED}`,
        inline: false,
      });
    }
  }

  // ── Drill-down navegacional — abre vistas detalhadas ephemeras ───────
  const row1 = buttonRow(
    button({ customId: 'perfil::material',    label: 'Material',    style: 'Secondary', emoji: '📦' }),
    button({ customId: 'perfil::pvp',         label: 'PvP & Saídas', style: 'Secondary', emoji: '⚔️' }),
    button({ customId: 'perfil::encomendas',  label: 'Encomendas',  style: 'Secondary', emoji: '📋' }),
    button({ customId: 'perfil::historico',   label: 'Histórico',   style: 'Secondary', emoji: '📜' }),
    button({ customId: 'perfil::progressao',  label: 'Progressão',  style: 'Secondary', emoji: '🏆' }),
  );

  return safeReply(interaction, { embeds: [embed], components: [row1] }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// RANKING — vista semanal/mensal/all-time com dropdown
// ═══════════════════════════════════════════════════════════════════════════

async function handleRanking(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return _showRanking(interaction, 'week');
}

async function handleRankingSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const period = interaction.values[0];
  await interaction.deferUpdate().catch(() => {});
  return _showRanking(interaction, period);
}

async function _showRanking(interaction, period) {
  const { start } = weekBounds();
  const weekStartStr = start.toISOString().split('T')[0];
  const now = new Date();
  const monthStartStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString().split('T')[0];

  const R = BAIRRISTAS.RANKING;
  let rankings, title, header;

  if (period === 'month') {
    rankings = await bairristaStatsRepo.getTopBairristasMonthly(monthStartStr, 15);
    const monthLabel = now.toLocaleString('pt-PT', { month: 'long', year: 'numeric' });
    title = R.TITLE_MONTH(monthLabel);
    header = R.HEADER_MONTH;
  } else if (period === 'alltime') {
    rankings = await bairristaStatsRepo.getTopBairristasAllTime(15);
    title = R.TITLE_ALLTIME;
    header = R.HEADER_ALLTIME;
  } else {
    rankings = await bairristaStatsRepo.getTopBairristas(weekStartStr, 15);
    const { end } = weekBounds();
    const weekLabel = `${weekStartStr} → ${end.toISOString().split('T')[0]}`;
    title = R.TITLE_WEEK(weekLabel);
    header = R.HEADER_WEEK;
  }

  const embed = brandEmbed('TOP').setTitle(title);

  if (!rankings.length) {
    embed.setDescription(R.EMPTY);
  } else {
    const lines = rankings.map((r, i) => {
      const pos = Number(r.pos || i + 1);
      const prefix = rankBadge(pos);
      const score = Math.round(Number(r.hybrid_score || r.weighted_value || 0));
      const isMe = r.discord_id === interaction.user.id ? ' ← **tu**' : '';
      const tierLabel = r.tier ? ` · ${formatTierName(r.tier)}` : '';
      const details = period === 'alltime'
        ? `${r.deliveries || 0}e · ${r.sales || 0}v · ${r.kills_total || 0}k`
        : `${r.deliveries || 0}e · ${r.sales || 0}v · ${r.operations_count || 0}s`;
      return `${prefix} <@${r.discord_id}> — **${score.toLocaleString('pt-PT')}** · ${details}${tierLabel}${isMe}`;
    });

    // Se o utilizador não está no top, mostra a sua posição
    const myIdx = rankings.findIndex(r => r.discord_id === interaction.user.id);
    if (myIdx < 0) {
      let myRank;
      if (period === 'month') {
        myRank = await bairristaStatsRepo.getMonthlyRankingPosition(interaction.user.id, monthStartStr);
      } else if (period === 'alltime') {
        myRank = await bairristaStatsRepo.getAllTimeRankingPosition(interaction.user.id);
      } else {
        myRank = await bairristaStatsRepo.getRankingPosition(interaction.user.id, weekStartStr);
      }
      if (myRank) {
        lines.push('─────');
        lines.push(`**#${myRank.position}.** <@${interaction.user.id}> — **${Math.round(myRank.score).toLocaleString('pt-PT')}** ← **tu**`);
      }
    }

    embed.setDescription(`${header}\n\n${lines.join('\n')}`);
  }

  // Dropdown para trocar período
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('bairrista::ranking_period')
      .setPlaceholder('Escolhe o período')
      .setMinValues(1).setMaxValues(1)
      .addOptions([
        { label: 'Semanal', description: 'Rankings desta semana', value: 'week', emoji: '📅', default: period === 'week' },
        { label: 'Mensal', description: 'Rankings deste mês', value: 'month', emoji: '📊', default: period === 'month' },
        { label: 'Histórico', description: 'Rankings de sempre', value: 'alltime', emoji: '🏆', default: period === 'alltime' },
      ])
  );

  return safeReply(interaction, { embeds: [embed], components: [row] }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESSO — vista detalhada de tier
// ═══════════════════════════════════════════════════════════════════════════

async function handleProgressoTier(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const progress = await getPromotionProgress(interaction.user.id);
  if (!progress) {
    return safeReply(interaction, {
      embeds: [brandEmbed().setTitle(BAIRRISTAS.PROGRESS.TITLE)
        .setDescription('Sem dados de progresso.')],
    }, { dismissible: true });
  }

  const P = BAIRRISTAS.PROGRESS;
  const fmtQty = (n) => (n || 0).toLocaleString('pt-PT');
  const embed = brandEmbed('TOP').setTitle(P.TITLE);

  embed.addFields(
    { name: P.CURRENT_TIER, value: `**${progress.currentTierName}**`, inline: true },
    { name: `${EMOJI.MATERIAL} Material total`, value: `**${fmtQty(progress.totalQty)}** ${P.UNITS}`, inline: true },
  );

  if (!progress.maxedOut && progress.threshold) {
    const bar = progressBar(parseFloat(progress.progress), 100, { width: 16 });
    embed.addFields(
      { name: P.NEXT_TIER, value: `**${progress.nextTierName}**`, inline: true },
      {
        name: `${EMOJI.TOPO} Progresso`,
        value: `${bar} **${progress.progress}%**\n` +
          `**${fmtQty(progress.totalQty)}** / ${fmtQty(progress.threshold)}\n` +
          `${P.REMAINING}: **${fmtQty(progress.remaining)}** ${P.UNITS}`,
        inline: false,
      },
    );

    // Estimativa: ritmo semanal actual → semanas restantes
    const weekStats = await bairristaStatsRepo.getWeeklyMaterialStats(interaction.user.id);
    if (weekStats && weekStats.totalQty > 0 && progress.remaining > 0) {
      const weeksEstimate = Math.ceil(progress.remaining / weekStats.totalQty);
      embed.addFields({
        name: `${EMOJI.INFO} Estimativa`,
        value: `Ao ritmo actual (~${fmtQty(weekStats.totalQty)}/semana), faltam ~**${weeksEstimate}** semanas.`,
        inline: false,
      });
    }
  } else {
    embed.addFields({
      name: `${EMOJI.TOPO} Topo`,
      value: P.MAXED,
      inline: false,
    });
  }

  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = {
  handleMeuPonto,
  handleRanking,
  handleRankingSelect,
  handleProgressoTier,
};
