'use strict';
/**
 * Perfil → PvP & Saídas detalhado.
 *
 * Junta combat profile (K/D, survival, MVP, última kill) + top spots do
 * membro + últimas saídas. Leitura "em 3 segundos" no topo.
 */

const { MessageFlags } = require('discord.js');
const { safeReply, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { memberAnalyticsRepo } = require('../repositories');
const { buttonRow, button } = require('../shared/ui/buttons');

const fmt = (n) => (Number(n) || 0).toLocaleString('pt-PT');

async function handle(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const discordId = interaction.user.id;
  const [combat, profit] = await Promise.all([
    memberAnalyticsRepo.getCombatProfile(discordId).catch(() => null),
    memberAnalyticsRepo.getProfitProfile(discordId).catch(() => null),
  ]);

  const embed = brandEmbed('STREET').setTitle(`${EMOJI.KILL} PvP & Saídas`);

  if (!combat || combat.saidasTotal === 0) {
    embed.setDescription('Ainda não tens saídas fechadas.');
  } else {
    // KPI stripe topo
    const kpi = [
      `${EMOJI.SAIDA} **${fmt(combat.saidasTotal)}** saídas`,
      `${EMOJI.KILL} ${fmt(combat.killsTotal)}k · ${fmt(combat.deathsTotal)}m`,
      `K/D **${combat.kdRatio.toFixed(2)}**`,
      `Sobrevivência **${combat.survivalRate.toFixed(0)}%**`,
    ];
    if (combat.mvpCount > 0) kpi.push(`${EMOJI.MVP} ${combat.mvpCount} MVPs`);
    embed.setDescription(kpi.join(' · '));

    // Resultados (wins/losses/draws)
    embed.addFields(
      { name: `${EMOJI.VITORIA} Vitórias`, value: `**${fmt(combat.wins)}**`, inline: true },
      { name: `${EMOJI.DERROTA} Derrotas`, value: `**${fmt(combat.losses)}**`, inline: true },
      { name: `${EMOJI.INFO} Empates`,     value: `**${fmt(combat.draws)}**`, inline: true },
    );

    // Semana + ranking kills
    const weekLine = `Kills desta semana: **${fmt(combat.weekKills)}**`;
    const rankLine = combat.killRank ? `Ranking kills all-time: **#${combat.killRank}**` : null;
    embed.addFields({ name: '⚔️ Ritmo', value: [weekLine, rankLine].filter(Boolean).join('\n'), inline: false });

    // Última kill
    if (combat.lastKill) {
      const when = new Date(combat.lastKill.created_at).toISOString().split('T')[0];
      const faction = combat.lastKill.victim_faction ? ` · ${combat.lastKill.victim_faction}` : '';
      const spot = combat.lastKill.spot ? ` · ${combat.lastKill.spot}` : '';
      embed.addFields({
        name: `${EMOJI.MORTE} Última kill`,
        value: `**${combat.lastKill.victim_name}**${faction}${spot}\n\`${when}\``,
        inline: false,
      });
    }
  }

  // Top spots
  if (profit?.topSpots?.length) {
    const lines = profit.topSpots.map(s => {
      const winRate = s.saidas > 0 ? Math.round((s.wins / s.saidas) * 100) : 0;
      const net = Number(s.net_delta) || 0;
      const netStr = net >= 0 ? `+${fmt(Math.round(net))}` : fmt(Math.round(net));
      return `• **${s.spot}** — ${s.saidas}s · ${winRate}% W · ${s.kills}k · Δ${netStr}`;
    });
    embed.addFields({ name: `${EMOJI.SPOT} Melhores spots`, value: lines.join('\n'), inline: false });
  }

  // Últimas saídas
  if (profit?.recentSaidas?.length) {
    const lines = profit.recentSaidas.map(r => {
      const date = String(r.date).split('T')[0];
      const resEmoji = r.result === 'vitoria' ? EMOJI.VITORIA : r.result === 'derrota' ? EMOJI.DERROTA : EMOJI.INFO;
      const mvp = r.mvp_flag ? ` ${EMOJI.MVP}` : '';
      const death = r.died ? ` ${EMOJI.MORTE}` : '';
      return `\`${date}\` **#${r.id}** ${r.spot || '—'} · ${resEmoji} · ${r.kills || 0}k${death}${mvp}`;
    });
    embed.addFields({ name: `${EMOJI.SAIDA} Últimas saídas`, value: lines.join('\n'), inline: false });
  }

  const navRow = buttonRow(
    button({ customId: 'perfil::voltar', label: 'Voltar ao Perfil', style: 'Secondary', emoji: EMOJI.VOLTAR }),
  );

  return safeReply(interaction, { embeds: [embed], components: [navRow] }, { dismissible: true });
}

module.exports = { handle };
