'use strict';
/**
 * Perfil → Material detalhado.
 *
 * Mostra material por período (semana/mês/histórico), separado em entregas
 * vs vendas, com comparação contra o período anterior e top-items histórico.
 */

const { MessageFlags, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { safeReply, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
// const { formatPtDate } = require('../shared/formatPtDate');
const { bairristaStatsRepo, memberAnalyticsRepo } = require('../repositories');
const { buttonRow, button } = require('../shared/ui/buttons');

const fmt = n => (Number(n) || 0).toLocaleString('pt-PT');
const fmtVal = n => `${(Number(n) || 0).toLocaleString('pt-PT', { maximumFractionDigits: 0 })}€`;

function deltaLine(cur, prev) {
  const c = Number(cur) || 0,
    p = Number(prev) || 0,
    d = c - p;
  if (!p && !c) return '';
  if (d > 0) return ` · ↑ **+${fmt(d)}** vs anterior`;
  if (d < 0) return ` · ↓ **${fmt(d)}** vs anterior`;
  return ' · → sem variação';
}

async function handle(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  return render(interaction, 'week');
}

async function handlePeriodSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});
  return render(interaction, interaction.values[0]);
}

async function render(interaction, period) {
  const discordId = interaction.user.id;
  const [cur, prev, profile] = await Promise.all([
    getStats(discordId, period, 0),
    getStats(discordId, period, 1),
    memberAnalyticsRepo.getMaterialProfile(discordId).catch(() => null),
  ]);

  const label = periodLabel(period);
  const embed = brandEmbed('MOVEMENT').setTitle(`${EMOJI.MATERIAL} Material — ${label}`);

  if (!cur || cur.totalQty === 0) {
    embed.setDescription('Sem movimentos neste período.');
  } else {
    embed.setDescription(
      `**${fmt(cur.totalQty)}** un.` +
        (cur.totalValue ? ` · ${fmtVal(cur.totalValue)}` : '') +
        (period !== 'alltime' ? deltaLine(cur.totalQty, prev?.totalQty) : '')
    );

    embed.addFields(
      {
        name: `${EMOJI.ENTREGA} Entregas`,
        value: `**${fmt(cur.deliveries)}**` + (period !== 'alltime' ? deltaLine(cur.deliveries, prev?.deliveries) : ''),
        inline: true,
      },
      {
        name: `${EMOJI.VENDA} Vendas`,
        value: `**${fmt(cur.sales)}**` + (period !== 'alltime' ? deltaLine(cur.sales, prev?.sales) : ''),
        inline: true,
      },
      { name: '📅 Dias activos', value: `**${fmt(cur.activeDays)}**`, inline: true }
    );
  }

  // Top items histórico (indicativo do perfil total)
  if (profile?.breakdown?.length) {
    const top = profile.breakdown
      .slice(0, 5)
      .map(b => `• **${b.item_name}** — ${fmt(b.quantity)} un.${b.value ? ` · ${fmtVal(b.value)}` : ''}`)
      .join('\n');
    if (top) embed.addFields({ name: `${EMOJI.TOPO} Top items (histórico)`, value: top, inline: false });
  }

  const periodSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('perfil::material_period')
      .setPlaceholder('Escolhe o período')
      .addOptions([
        { label: 'Semana', value: 'week', emoji: '📅', default: period === 'week' },
        { label: 'Mês', value: 'month', emoji: '📊', default: period === 'month' },
        { label: 'Histórico', value: 'alltime', emoji: '🏆', default: period === 'alltime' },
      ])
  );

  const navRow = buttonRow(
    button({ customId: 'perfil::voltar', label: 'Voltar ao Perfil', style: 'Secondary', emoji: EMOJI.VOLTAR })
  );

  return safeReply(
    interaction,
    {
      embeds: [embed],
      components: [periodSelect, navRow],
    },
    { messageClass: 'COCKPIT' }
  );
}

async function getStats(discordId, period, offsetPeriods) {
  if (period === 'alltime') {
    return offsetPeriods === 0 ? bairristaStatsRepo.getAllTimeMaterialStats(discordId) : null;
  }
  const now = new Date();
  if (period === 'month') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offsetPeriods, 15));
    return bairristaStatsRepo.getMonthlyMaterialStats(discordId, d);
  }
  // week
  const d = new Date(now.getTime() - offsetPeriods * 7 * 24 * 60 * 60 * 1000);
  return bairristaStatsRepo.getWeeklyMaterialStats(discordId, d);
}

function periodLabel(period) {
  if (period === 'month') {
    const d = new Date();
    return new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'Europe/Lisbon' }).format(d);
  }
  if (period === 'alltime') return 'Histórico';
  return 'Esta semana';
}

module.exports = { handle, handlePeriodSelect };
