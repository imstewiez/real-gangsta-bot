'use strict';
/**
 * Stats de saídas — UI acessível via botão 📊 "Estatísticas" do painel
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

function fmtMoney(v) {
  const n = Number(v) || 0;
  return `${n.toLocaleString('pt-PT', { maximumFractionDigits: 0 })} €`;
}

const STATS_OPTIONS = [
  { value: 'top_kills',     label: '🎯 Top Killers (saídas)',   description: 'Mais kills acumulados' },
  { value: 'top_kd',        label: '⚖️ Top K/D',                 description: 'Melhor rácio kills/mortes' },
  { value: 'top_profit',    label: '💰 Top Lucro Gerado',        description: 'Membros mais rentáveis em saídas' },
  { value: 'top_mvp',       label: '🏅 Top MVP',                 description: 'Mais vezes MVP' },
  { value: 'top_survival',  label: '🛡️ Top Sobrevivência',       description: 'Maior taxa de sobrevivência' },
  { value: 'top_discipline',label: '📦 Top Disciplina',          description: 'Devolve mais material que recebe' },
  { value: 'spot_net',      label: '📍 Spots — Lucro',           description: 'Onde lucramos mais' },
  { value: 'spot_winrate',  label: '🏆 Spots — Winrate',         description: 'Onde vencemos mais' },
  { value: 'spot_deaths',   label: '💀 Spots — Deaths',          description: 'Onde mais morremos' },
  { value: 'org_kills',     label: '☠️ Org Kills (all-time)',    description: 'Contagem total de kills' },
];

async function handleStatsOpen(interaction) {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::stats_pick')
      .setPlaceholder('Que estatística queres ver?')
      .setMinValues(1).setMaxValues(1)
      .addOptions(STATS_OPTIONS)
  );
  return safeReply(interaction, {
    content: '📊 Estatísticas da organização — escolhe:',
    components: [row],
    flags: MessageFlags.Ephemeral,
  }, { dismissible: true });
}

async function handleStatsPick(interaction) {
  const pick = interaction.values[0];
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const embed = brandEmbed();
  const medals = ['🥇', '🥈', '🥉'];

  try {
    if (pick === 'top_kills') {
      const top = await memberSaidaStatsRepo.listTop('kills_total', 10);
      embed.setTitle('🎯 Top Killers em Saídas');
      embed.setDescription(top.length
        ? top.map((m, i) => `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${m.kills_total}** kills · K/D ${Number(m.kd_ratio).toFixed(2)}`).join('\n')
        : '_Sem dados ainda._');
    }
    else if (pick === 'top_kd') {
      const top = await memberSaidaStatsRepo.listTop('kd_ratio', 10);
      embed.setTitle('⚖️ Top K/D');
      embed.setDescription(top.length
        ? top.map((m, i) => `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${Number(m.kd_ratio).toFixed(2)}** (${m.kills_total}k / ${m.deaths_total}d)`).join('\n')
        : '_Sem dados._');
    }
    else if (pick === 'top_profit') {
      const top = await memberSaidaStatsRepo.listTop('profit_generated', 10);
      embed.setTitle('💰 Top Lucro Gerado');
      embed.setDescription(top.length
        ? top.map((m, i) => `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${fmtMoney(m.profit_generated)}**`).join('\n')
        : '_Sem dados._');
    }
    else if (pick === 'top_mvp') {
      const top = await memberSaidaStatsRepo.listTop('mvp_count', 10);
      embed.setTitle('🏅 Top MVP');
      embed.setDescription(top.length
        ? top.map((m, i) => `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${m.mvp_count}** MVPs · ${m.saidas_total} saídas`).join('\n')
        : '_Sem dados._');
    }
    else if (pick === 'top_survival') {
      const top = await memberSaidaStatsRepo.listTop('survival_rate', 10);
      embed.setTitle('🛡️ Top Sobrevivência');
      embed.setDescription(top.length
        ? top.map((m, i) => `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${Number(m.survival_rate).toFixed(1)}%** (${m.saidas_total} saídas)`).join('\n')
        : '_Sem dados._');
    }
    else if (pick === 'top_discipline') {
      const top = await memberSaidaStatsRepo.listTop('material_return_rate', 10);
      embed.setTitle('📦 Top Disciplina Material');
      embed.setDescription(top.length
        ? top.map((m, i) => `${medals[i] || `**${i + 1}.**`} <@${m.discord_id}> — **${Number(m.material_return_rate).toFixed(1)}%** devolvido`).join('\n')
        : '_Sem dados._');
    }
    else if (pick === 'spot_net') {
      const top = await spotStatsRepo.listTop('total_net_value', 10);
      embed.setTitle('📍 Spots — Lucro Líquido');
      embed.setDescription(top.length
        ? top.map((s, i) => `${medals[i] || `**${i + 1}.**`} **${s.spot}** — ${fmtMoney(s.total_net_value)} · ${s.total_saidas} saídas`).join('\n')
        : '_Sem dados._');
    }
    else if (pick === 'spot_winrate') {
      const top = await spotStatsRepo.listTop('wins', 10);
      embed.setTitle('🏆 Spots — Winrate');
      embed.setDescription(top.length
        ? top.map((s, i) => {
            const total = s.total_saidas || 1;
            const wr = Math.round((s.wins / total) * 100);
            return `${medals[i] || `**${i + 1}.**`} **${s.spot}** — ${wr}% (${s.wins}W/${s.losses}L/${s.draws}D de ${total})`;
          }).join('\n')
        : '_Sem dados._');
    }
    else if (pick === 'spot_deaths') {
      const top = await spotStatsRepo.listTop('our_deaths', 10);
      embed.setTitle('💀 Spots — Onde Mais Morremos');
      embed.setDescription(top.length
        ? top.map((s, i) => `${medals[i] || `**${i + 1}.**`} **${s.spot}** — **${s.our_deaths}** mortes · ${s.total_saidas} saídas`).join('\n')
        : '_Sem dados._');
    }
    else if (pick === 'org_kills') {
      const total = await killRepo.totalOrgKills();
      const week = await killRepo.totalOrgKills(7);
      const top = await killRepo.getLeaderboard(5);
      embed.setTitle('☠️ Org Kills');
      embed.setDescription(
        `Total all-time: **${total}** kills\n` +
        `Últimos 7 dias: **${week}** kills\n\n` +
        `**Top 5 all-time:**\n` +
        (top.length ? top.map((k, i) => `${medals[i] || `**${i + 1}.**`} <@${k.discord_id}> — ${k.kills}`).join('\n') : '_Sem dados._')
      );
    }
    else {
      return safeReply(interaction, { content: 'Opção desconhecida.' }, { dismissible: true });
    }

    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
  }
}

module.exports = { handleStatsOpen, handleStatsPick };
