'use strict';
/**
 * Handlers do ecossistema Bairristas — Movimento no Bairro, Ranking.
 *
 * CustomIds:
 *   bairrista::movimento  → cockpit Movimento no Bairro (KPIs + loading bar
 *                         de tier + drill-downs)
 *   bairrista::ranking    → ranking semanal/mensal com dropdown de período
 *
 * Detalhes (Material, PvP, Encomendas, Histórico, Progressão) vivem em
 * src/perfil/* e são acedidos via botões drill-down de "Movimento".
 */

const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { bairristaStatsRepo } = require('../repositories');
const { safeReply, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed, applyLogo, progressBar, rankBadge, streakBadge } = require('../shared/embedBuilders');
const { BAIRRISTAS, EMOJI } = require('../content');
const { getPromotionProgress, formatTierName } = require('./autoPromotionEngine');
const { weekBounds } = require('../util');
const { buttonRow, button } = require('../shared/ui/buttons');
const { formatPtDateOnly } = require('../shared/formatPtDate');

// ═══════════════════════════════════════════════════════════════════════════
// MOVIMENTO NO BAIRRO — cockpit pessoal do Bairrista
// ═══════════════════════════════════════════════════════════════════════════

async function handleMovimento(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const profile = await bairristaStatsRepo.getFullProfile(interaction.user.id);
  if (!profile) {
    return safeReply(
      interaction,
      {
        embeds: [
          brandEmbed().setTitle(`${EMOJI.FIRMA} Movimento no Bairro`).setDescription(BAIRRISTAS.MOVIMENTO.NO_DATA),
        ],
      },
      { messageClass: 'WARN' }
    );
  }

  const { member, material, ranking, evolution, streak, saida } = profile;
  const M = BAIRRISTAS.MOVIMENTO;
  const embed = applyLogo(brandEmbed('TOP')).setTitle(
    M.TITLE(member.display_name || member.nickname || member.username)
  );

  const fmtQty = n => (n || 0).toLocaleString('pt-PT');

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
  if (streak?.currentStreak > 0) kpiParts.push(`${EMOJI.STREAK} ${streak.currentStreak}w`);
  if (kpiParts.length) embed.setDescription(kpiParts.join(' · '));

  // ── Loading bar destacada — topo do embed ────────────────────────────
  // Posicionada ANTES do resto para ser a primeira coisa que o user vê.
  const progress = await getPromotionProgress(interaction.user.id).catch(() => null);
  if (progress) {
    if (!progress.maxedOut && progress.threshold) {
      const bar = progressBar(parseFloat(progress.progress), 100, { width: 22 });
      embed.addFields({
        name: `${EMOJI.PROGRESSO} Subida — ${progress.currentTierName} → ${progress.nextTierName}`,
        value:
          `${bar} **${progress.progress}%**\n` +
          `${EMOJI.MATERIAL} **${fmtQty(progress.totalQty)}** / ${fmtQty(progress.threshold)} · ` +
          `falta **${fmtQty(progress.remaining)}** para subir`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: `${EMOJI.TOPO} Topo — ${progress.currentTierName}`,
        value: BAIRRISTAS.PROGRESS.MAXED,
        inline: false,
      });
    }
  }

  // ── Material por período ─────────────────────────────────────────────
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
    { name: M.MATERIAL_TITLE, value: '\u200b', inline: false },
    { name: M.WEEK_LABEL, value: weekLine, inline: true },
    { name: M.MONTH_LABEL, value: monthLine, inline: true },
    { name: M.ALLTIME_LABEL, value: allTimeLine, inline: true }
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
    rankLines.push(`**${M.WEEK_RANK}:** ${weekRankStr}`);
  }
  if (ranking.month) {
    rankLines.push(`**${M.MONTH_RANK}:** ${rankBadge(ranking.month.position)}/${ranking.month.total}`);
  }
  if (ranking.allTime) {
    rankLines.push(`**${M.ALLTIME_RANK}:** ${rankBadge(ranking.allTime.position)}/${ranking.allTime.total}`);
  }
  if (ranking.week?.above) {
    rankLines.push(
      `${M.ABOVE}: **${ranking.week.above.displayName}** (${fmtQty(Math.round(ranking.week.above.score))})`
    );
  }
  if (ranking.week?.below) {
    rankLines.push(
      `${M.BELOW}: **${ranking.week.below.displayName}** (${fmtQty(Math.round(ranking.week.below.score))})`
    );
  }
  if (rankLines.length) {
    embed.addFields({ name: M.RANKING_TITLE, value: rankLines.join('\n'), inline: false });
  }

  // ── Combate ──────────────────────────────────────────────────────────
  if (saida && saida.total > 0) {
    const winRate = saida.wins > 0 ? ((saida.wins / saida.total) * 100).toFixed(0) : '0';
    const combatFields = [
      { name: M.SAIDA_TITLE, value: '\u200b', inline: false },
      { name: M.SAIDAS, value: `**${saida.total}**`, inline: true },
      { name: M.KILLS, value: `**${saida.kills}**`, inline: true },
      { name: M.KD, value: `**${saida.kdRatio.toFixed(2)}**`, inline: true },
      {
        name: `${EMOJI.VITORIA} Win rate`,
        value: `**${winRate}%** (${saida.wins}V/${saida.losses || 0}D)`,
        inline: true,
      },
      { name: M.SURVIVAL, value: `**${saida.survivalRate.toFixed(1)}%**`, inline: true },
      { name: M.MVP, value: `**${saida.mvpCount}**`, inline: true },
    ];
    if (saida.materialReturnRate != null && saida.materialReturnRate > 0) {
      combatFields.push({
        name: `${EMOJI.DEVOLVER} Devolução`,
        value: `**${saida.materialReturnRate.toFixed(0)}%**`,
        inline: true,
      });
    }
    embed.addFields(combatFields);
  }

  // ── Streak ───────────────────────────────────────────────────────────
  if (streak && streak.currentStreak > 0) {
    const badge = streakBadge(streak.currentStreak);
    embed.addFields({
      name: M.STREAK_TITLE,
      value:
        `${M.CURRENT_STREAK}: **${streak.currentStreak}** ${M.WEEKS} ${badge}\n` +
        `${M.BEST_STREAK}: **${streak.bestStreak}** ${M.WEEKS}`,
      inline: false,
    });
  }

  // ── Drill-down navegacional — abre vistas detalhadas ephemeras ───────
  const row1 = buttonRow(
    button({ customId: 'perfil::material', label: 'Material', style: 'Secondary', emoji: EMOJI.MATERIAL }),
    button({ customId: 'perfil::pvp', label: 'PvP & Saídas', style: 'Secondary', emoji: EMOJI.COMBATE }),
    button({ customId: 'perfil::encomendas', label: 'Encomendas', style: 'Secondary', emoji: EMOJI.ENCOMENDA }),
    button({ customId: 'perfil::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.HISTORICO }),
    button({ customId: 'perfil::progressao', label: 'Progressão', style: 'Secondary', emoji: EMOJI.PROGRESSO })
  );

  return safeReply(interaction, { embeds: [embed], components: [row1] }, { messageClass: 'COCKPIT' });
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
  const monthStartStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0];

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
    // Se ainda não há dados para esta semana, computa em tempo real.
    if (!rankings.length) {
      const { computeWeeklyRankings } = require('../rankings/rankingEngine');
      await computeWeeklyRankings();
      rankings = await bairristaStatsRepo.getTopBairristas(weekStartStr, 15);
    }
    const { end } = weekBounds();
    const weekLabel = `${formatPtDateOnly(start)} → ${formatPtDateOnly(end)}`;
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
      const details =
        period === 'alltime'
          ? `${r.deliveries || 0}e · ${r.sales || 0}v · ${r.kills_total || 0}k`
          : `${r.deliveries || 0}e · ${r.sales || 0}v · ${r.operations_count || 0}s`;
      return `${prefix} <@${r.discord_id}> — **${score.toLocaleString('pt-PT')}** · ${details}${tierLabel}${isMe}`;
    });

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
        lines.push(
          `**#${myRank.position}.** <@${interaction.user.id}> — **${Math.round(myRank.score).toLocaleString('pt-PT')}** ← **tu**`
        );
      }
    }

    embed.setDescription(`${header}\n\n${lines.join('\n')}`);
  }

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('bairrista::ranking_period')
      .setPlaceholder('Escolhe o período')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions([
        {
          label: 'Semanal',
          description: 'Rankings desta semana',
          value: 'week',
          emoji: '📅',
          default: period === 'week',
        },
        {
          label: 'Mensal',
          description: 'Rankings deste mês',
          value: 'month',
          emoji: '📊',
          default: period === 'month',
        },
        {
          label: 'Histórico',
          description: 'Rankings de sempre',
          value: 'alltime',
          emoji: '🏆',
          default: period === 'alltime',
        },
      ])
  );

  return safeReply(interaction, { embeds: [embed], components: [row] }, { messageClass: 'COCKPIT' });
}

module.exports = {
  handleMovimento,
  handleRanking,
  handleRankingSelect,
};
