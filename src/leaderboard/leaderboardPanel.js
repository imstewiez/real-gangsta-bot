'use strict';
/**
 * Leaderboard panel — builders do embed live + ephemeral details.
 *
 * Design:
 *   - Main embed: 3 secções (Hoje / Semana / Mês) × 5 categorias. Top 1 de
 *     cada. Tipografia compacta para caber mobile sem scroll exagerado.
 *   - Ícones por categoria (🔥⚡⚔️📦💰) + coroa 👑 no líder overall (maior
 *     actividade do período semanal — proxy razoável de "rei do bairro").
 *   - Footer: "Atualizado há X min" — freshness à vista.
 *   - Empty state: "— nenhum ainda" em vez de campo em branco, por categoria.
 *
 * Components:
 *   - Row 1: 3 botões de details ephemeral (daily / weekly / monthly).
 *   - Row 2: 1 botão "Atualizar agora" (rate-limited 30s por user).
 *
 * Details (ephemeral, on-demand):
 *   - Embed por período com top 5 de cada categoria. Só o user que clicou
 *     vê. Permite "ver mais" sem poluir o canal.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brandEmbed, rankBadge, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');

// Ícones canónicos por categoria — consistentes no embed e nos buttons.
const CATEGORY_ICON = {
  activity: '🔥',
  mvp: '👑',
  kda: '⚔️',
  delivered: '📦',
  sold: '💰',
};

const CATEGORY_LABEL = {
  activity: 'Atividade',
  mvp: 'MVP',
  kda: 'KDA',
  delivered: 'Entregue',
  sold: 'Vendido',
};

const PERIOD_ICON = { daily: '🗓️', weekly: '📅', monthly: '📆' };
const PERIOD_LABEL = { daily: 'Hoje', weekly: 'Esta semana', monthly: 'Este mês' };

// ═══════════════════════════════════════════════════════════════════════════
// LINE FORMATTERS — uma linha por categoria no resumo
// ═══════════════════════════════════════════════════════════════════════════

function _fmtNumber(n) {
  return Number(n || 0).toLocaleString('pt-PT');
}
function _fmtEuro(n) {
  return `${_fmtNumber(Math.round(Number(n) || 0))}€`;
}

function formatLeaderLine(category, leader) {
  const icon = CATEGORY_ICON[category] || '•';
  const label = CATEGORY_LABEL[category] || category;
  if (!leader) {
    return `${icon} **${label}**  ·  _sem actividade ainda_`;
  }
  const who = `<@${leader.discordId}>`;
  let stats = '';
  switch (category) {
    case 'activity':
      stats = `**${_fmtNumber(leader.score)}** pts  _(${leader.saidas}s · ${leader.submissions}e · ${leader.kills}k)_`;
      break;
    case 'mvp':
      stats = `**${_fmtNumber(leader.mvpCount)}** MVP${leader.mvpCount === 1 ? '' : 's'}`;
      break;
    case 'kda':
      stats = `**${leader.kda.toFixed(2)}** KDA  _(${leader.kills}k / ${leader.deaths}d em ${leader.saidas}s)_`;
      break;
    case 'delivered':
      stats =
        leader.totalValue > 0
          ? `**${_fmtNumber(leader.totalQty)}** un.  _(${_fmtEuro(leader.totalValue)})_`
          : `**${_fmtNumber(leader.totalQty)}** un.`;
      break;
    case 'sold':
      stats = `**${_fmtEuro(leader.totalValue)}**  _(${_fmtNumber(leader.totalQty)} un.)_`;
      break;
    default:
      stats = `**${_fmtNumber(leader.score)}**`;
  }
  return `${icon} **${label}**  ·  ${who}  ·  ${stats}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PANEL — embed com 3 períodos × 5 categorias
// ═══════════════════════════════════════════════════════════════════════════

function buildLeaderboardEmbed({ daily, weekly, monthly, refreshedAt }) {
  const embed = brandEmbed('TOP')
    .setColor(COLOR.GOLD)
    .setTitle(`🏆  Leaderboard da Firma  🏆`)
    .setDescription(
      [
        `_Top 1 em cada categoria, por período._`,
        `_Atualizado <t:${Math.floor(refreshedAt.getTime() / 1000)}:R>._`,
      ].join('\n')
    );

  for (const period of [daily, weekly, monthly]) {
    const pIcon = PERIOD_ICON[period.period] || '•';
    const header = `${pIcon} ${PERIOD_LABEL[period.period]} · _${period.label}_`;
    const categories = period.categories;
    const lines = [
      formatLeaderLine('activity', categories.activity.leader),
      formatLeaderLine('mvp', categories.mvp.leader),
      formatLeaderLine('kda', categories.kda.leader),
      formatLeaderLine('delivered', categories.delivered.leader),
      formatLeaderLine('sold', categories.sold.leader),
    ];
    embed.addFields({ name: header, value: lines.join('\n'), inline: false });
  }

  embed.setFooter({
    text: `Firma RedWood · leaderboard · clica num período para ver top 5 de cada categoria`,
  });
  return embed;
}

function buildLeaderboardComponents() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('lb::details::daily')
      .setLabel('Hoje — top 5')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(PERIOD_ICON.daily),
    new ButtonBuilder()
      .setCustomId('lb::details::weekly')
      .setLabel('Semana — top 5')
      .setStyle(ButtonStyle.Primary)
      .setEmoji(PERIOD_ICON.weekly),
    new ButtonBuilder()
      .setCustomId('lb::details::monthly')
      .setLabel('Mês — top 5')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(PERIOD_ICON.monthly)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('lb::refresh')
      .setLabel('Atualizar agora')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄')
  );
  return [row1, row2];
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAILS (ephemeral) — top 5 por categoria num período
// ═══════════════════════════════════════════════════════════════════════════

function _formatTop5ForCategory(category, top) {
  if (!top.length) return '_— sem actividade ainda —_';
  return top
    .map((row, i) => {
      const badge = rankBadge(i + 1);
      const who = `<@${row.discordId}>`;
      let stats = '';
      switch (category) {
        case 'activity':
          stats = `**${_fmtNumber(row.score)}** (${row.saidas}s · ${row.submissions}e · ${row.kills}k)`;
          break;
        case 'mvp':
          stats = `**${_fmtNumber(row.mvpCount)}** MVP${row.mvpCount === 1 ? '' : 's'}`;
          break;
        case 'kda':
          stats = `**${row.kda.toFixed(2)}** (${row.kills}k/${row.deaths}d · ${row.saidas}s)`;
          break;
        case 'delivered':
          stats = `**${_fmtNumber(row.totalQty)}** un.${row.totalValue > 0 ? ` · ${_fmtEuro(row.totalValue)}` : ''}`;
          break;
        case 'sold':
          stats = `**${_fmtEuro(row.totalValue)}** · ${_fmtNumber(row.totalQty)} un.`;
          break;
      }
      return `${badge} ${who} — ${stats}`;
    })
    .join('\n');
}

function buildDetailsEmbed(periodData) {
  const { period, label, categories } = periodData;
  const pIcon = PERIOD_ICON[period] || '•';
  const embed = brandEmbed('TOP')
    .setColor(COLOR.INFO)
    .setTitle(`${pIcon} Top 5 — ${PERIOD_LABEL[period]}`)
    .setDescription(`_${label}_`);

  for (const cat of ['activity', 'mvp', 'kda', 'delivered', 'sold']) {
    const icon = CATEGORY_ICON[cat];
    const label = CATEGORY_LABEL[cat];
    const value = _formatTop5ForCategory(cat, categories[cat].top);
    embed.addFields({ name: `${icon} ${label}`, value, inline: false });
  }

  embed.setFooter({ text: `Firma RedWood · details leaderboard` });
  return embed;
}

module.exports = {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  PERIOD_ICON,
  PERIOD_LABEL,
  formatLeaderLine,
  buildLeaderboardEmbed,
  buildLeaderboardComponents,
  buildDetailsEmbed,
};
