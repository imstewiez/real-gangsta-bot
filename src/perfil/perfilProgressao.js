'use strict';
/**
 * Perfil → Progressão (tier).
 *
 * Reusa `getPromotionProgress` + barra wide e adiciona navegação de
 * "Voltar ao Movimento no Bairro".
 */

const { MessageFlags } = require('discord.js');
const { safeReply, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed, progressBar } = require('../shared/embedBuilders');
const { EMOJI, BAIRRISTAS } = require('../content');
const { getPromotionProgress } = require('../members/autoPromotionEngine');
const { bairristaStatsRepo } = require('../repositories');
const { buttonRow, button } = require('../shared/ui/buttons');

const fmt = (n) => (Number(n) || 0).toLocaleString('pt-PT');

async function handle(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  const discordId = interaction.user.id;
  const progress = await getPromotionProgress(discordId);

  const embed = brandEmbed('TOP').setTitle(`${EMOJI.TOPO} Progressão`);

  if (!progress) {
    embed.setDescription('Sem dados de progresso.');
  } else {
    const P = BAIRRISTAS.PROGRESS;
    embed.addFields(
      { name: P.CURRENT_TIER, value: `**${progress.currentTierName}**`, inline: true },
      { name: `${EMOJI.MATERIAL} Material total`, value: `**${fmt(progress.totalQty)}** ${P.UNITS}`, inline: true },
    );

    if (!progress.maxedOut && progress.threshold) {
      const bar = progressBar(parseFloat(progress.progress), 100, { width: 16 });
      embed.addFields(
        { name: P.NEXT_TIER, value: `**${progress.nextTierName}**`, inline: true },
        {
          name: `${EMOJI.TOPO} Progresso`,
          value: `${bar} **${progress.progress}%**\n` +
            `**${fmt(progress.totalQty)}** / ${fmt(progress.threshold)}\n` +
            `${P.REMAINING}: **${fmt(progress.remaining)}** ${P.UNITS}`,
          inline: false,
        },
      );

      // Estimativa semanal
      const weekStats = await bairristaStatsRepo.getWeeklyMaterialStats(discordId);
      if (weekStats?.totalQty > 0 && progress.remaining > 0) {
        const weeksEstimate = Math.ceil(progress.remaining / weekStats.totalQty);
        embed.addFields({
          name: `${EMOJI.INFO} Estimativa`,
          value: `Ao ritmo actual (~${fmt(weekStats.totalQty)}/semana), faltam ~**${weeksEstimate}** semanas.`,
          inline: false,
        });
      }
    } else {
      embed.addFields({ name: `${EMOJI.TOPO} Topo`, value: P.MAXED, inline: false });
    }
  }

  const navRow = buttonRow(
    button({ customId: 'perfil::voltar', label: 'Voltar ao Perfil', style: 'Secondary', emoji: EMOJI.VOLTAR }),
  );

  return safeReply(interaction, { embeds: [embed], components: [navRow] }, { messageClass: 'COCKPIT' });
}

module.exports = { handle };
