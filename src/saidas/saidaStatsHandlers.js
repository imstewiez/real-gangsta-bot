'use strict';
/**
 * Stats de saídas — UI acessível via botão "Estatísticas" do painel
 * Chefia. Abre select com tipos de ranking/estatística. Sem slashes.
 *
 * CustomIds:
 *   chefia::stats_open            → abre select
 *   saida::stats_pick             → processa escolha e devolve embed
 */

const { ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { killRepo, spotStatsRepo, memberSaidaStatsRepo } = require('../repositories');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { STATS, EMOJI } = require('../content');

function fmtMoney(v) {
  const n = Number(v) || 0;
  return `${Math.round(n).toLocaleString('pt-PT')}€`;
}

async function handleStatsOpen(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::stats_pick')
      .setPlaceholder(STATS.SELECT_PLACEHOLDER)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(STATS.OPTIONS)
  );
  return safeReply(
    interaction,
    {
      content: STATS.OPEN_PROMPT,
      components: [row],
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'BANAL' }
  );
}

async function handleStatsPick(interaction) {
  const pick = interaction.values[0];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const embed = brandEmbed('TOP');
  const medals = [EMOJI.MEDAL_1, EMOJI.MEDAL_2, EMOJI.MEDAL_3];

  const setTitle = () => embed.setTitle(STATS.TITLES[pick] || pick);
  const emptyOr = (arr, fn) => (arr.length ? arr.map(fn).join('\n') : STATS.EMPTY);

  try {
    if (pick === 'top_kills') {
      const top = await memberSaidaStatsRepo.listTop('kills_total', 10);
      setTitle();
      embed.setDescription(
        emptyOr(
          top,
          (m, i) =>
            `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${m.kills_total}** kills · K/D ${Number(m.kd_ratio).toFixed(2)}`
        )
      );
    } else if (pick === 'top_kd') {
      const top = await memberSaidaStatsRepo.listTop('kd_ratio', 10);
      setTitle();
      embed.setDescription(
        emptyOr(
          top,
          (m, i) =>
            `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${Number(m.kd_ratio).toFixed(2)}** (${m.kills_total}k / ${m.deaths_total}d)`
        )
      );
    } else if (pick === 'top_profit') {
      const top = await memberSaidaStatsRepo.listTop('profit_generated', 10);
      setTitle();
      embed.setDescription(
        emptyOr(
          top,
          (m, i) => `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${fmtMoney(m.profit_generated)}**`
        )
      );
    } else if (pick === 'top_mvp') {
      const top = await memberSaidaStatsRepo.listTop('mvp_count', 10);
      setTitle();
      embed.setDescription(
        emptyOr(
          top,
          (m, i) =>
            `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${m.mvp_count}** MVPs · ${m.saidas_total} saídas`
        )
      );
    } else if (pick === 'top_survival') {
      const top = await memberSaidaStatsRepo.listTop('survival_rate', 10);
      setTitle();
      embed.setDescription(
        emptyOr(
          top,
          (m, i) =>
            `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${Number(m.survival_rate).toFixed(1)}%** (${m.saidas_total} saídas)`
        )
      );
    } else if (pick === 'top_discipline') {
      const top = await memberSaidaStatsRepo.listTop('material_return_rate', 10);
      setTitle();
      embed.setDescription(
        emptyOr(
          top,
          (m, i) =>
            `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${Number(m.material_return_rate).toFixed(1)}%** devolvido`
        )
      );
    } else if (pick === 'spot_net') {
      const top = await spotStatsRepo.listTop('total_net_value', 10);
      setTitle();
      embed.setDescription(
        emptyOr(
          top,
          (s, i) =>
            `${medals[i] || `**${i + 1}.**`} **${s.spot}** — ${fmtMoney(s.total_net_value)} · ${s.total_saidas} saídas`
        )
      );
    } else if (pick === 'spot_winrate') {
      const top = await spotStatsRepo.listTop('wins', 10);
      setTitle();
      embed.setDescription(
        emptyOr(top, (s, i) => {
          const total = s.total_saidas || 1;
          const wr = Math.round((s.wins / total) * 100);
          return `${medals[i] || `**${i + 1}.**`} **${s.spot}** — ${wr}% (${s.wins}W/${s.losses}L/${s.draws}D de ${total})`;
        })
      );
    } else if (pick === 'spot_deaths') {
      const top = await spotStatsRepo.listTop('our_deaths', 10);
      setTitle();
      embed.setDescription(
        emptyOr(
          top,
          (s, i) =>
            `${medals[i] || `**${i + 1}.**`} **${s.spot}** — **${s.our_deaths}** mortes · ${s.total_saidas} saídas`
        )
      );
    } else if (pick === 'org_kills') {
      const total = await killRepo.totalOrgKills();
      const week = await killRepo.totalOrgKills(7);
      const top = await killRepo.getLeaderboard(5);
      setTitle();
      embed.setDescription(
        `Total all-time: **${total}** kills\n` +
          `Últimos 7 dias: **${week}** kills\n\n` +
          '**Top 5 all-time:**\n' +
          (top.length
            ? top.map((k, i) => `${medals[i] || `**${i + 1}.**`} <@${k.discord_id}> — ${k.kills}`).join('\n')
            : STATS.EMPTY)
      );
    } else {
      return safeReply(interaction, { content: STATS.UNKNOWN_PICK }, { messageClass: 'ERROR' });
    }

    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'ERROR' });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }
}

module.exports = { handleStatsOpen, handleStatsPick };
