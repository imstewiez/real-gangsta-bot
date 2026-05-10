'use strict';
const { MessageFlags } = require('discord.js');
const { memberRepo, inventoryRepo } = require('../repositories');
const { safeReply } = require('../shared/interactionHelpers');
const { replySafe } = require('../shared/safeEmbed');
const { memberProfileEmbed, brandEmbed, progressBar, rankBadge } = require('../shared/embedBuilders');
const { EMOJI, RANKINGS } = require('../content');
const { formatPtDate } = require('../shared/formatPtDate');
const { fmtMovementType } = require('../shared/labels');
const { NotFoundError } = require('../shared/errors');

async function handleMemberCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const targetUser = interaction.options.getUser('membro') || interaction.user;
  const member = await memberRepo.findByDiscordId(targetUser.id);

  if (!member) {
    throw new NotFoundError('Esse nome não está na casa.', { code: 'MEMBER_NOT_FOUND' });
  }

  const embed = memberProfileEmbed(member);

  const totals = await inventoryRepo.getMemberTotals(member.id);
  const totalEntregas = totals.entrega_bairrista || 0;
  const totalVendas = totals.venda_bairrista || 0;
  const totalOficial = totals.entrega_oficial || 0;
  if (totalEntregas || totalVendas || totalOficial) {
    embed.addFields({
      name: 'Material',
      value: [
        totalEntregas ? `${EMOJI.MATERIAL} Entregas: **${totalEntregas}**` : null,
        totalVendas ? `${EMOJI.LUCRO} Vendas: **${totalVendas}**` : null,
        totalOficial ? `${EMOJI.MATERIAL} Oficial: **${totalOficial}**` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      inline: false,
    });
  }

  return replySafe(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { messageClass: 'BANAL' });
}

async function handleMemberHistoryButton(interaction) {
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    throw new NotFoundError('Esse nome não está na casa.', { code: 'MEMBER_NOT_FOUND' });
  }

  const movements = await inventoryRepo.getMemberMovements(member.id, 20);
  if (!movements.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.AUDIT} Sem histórico ainda — mete mão à rua.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const lines = movements.map(m => {
    const date = formatPtDate(m.created_at);
    return `${fmtMovementType(m.movement_type)} \`${date}\` **${m.quantity}×** ${m.item_name}`;
  });

  const embed = brandEmbed('MOVEMENT')
    .setTitle(`${EMOJI.AUDIT} O teu histórico`)
    .setDescription(lines.join('\n').slice(0, 3900));

  return replySafe(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { messageClass: 'BANAL' });
}

async function handleMemberTotalsButton(interaction) {
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    throw new NotFoundError('Esse nome não está na casa.', { code: 'MEMBER_NOT_FOUND' });
  }

  const totals = await inventoryRepo.getMemberTotals(member.id);
  const agg = {
    entregas: totals.entrega_bairrista || 0,
    vendas: totals.venda_bairrista || 0,
    oficial: totals.entrega_oficial || 0,
    devolvido: totals.devolucao_saida || 0,
  };

  const embed = brandEmbed('MOVEMENT')
    .setTitle(`${EMOJI.TOPO} Os teus totais`)
    .addFields(
      { name: `${EMOJI.MATERIAL} Entregas`, value: `**${agg.entregas.toLocaleString('pt-PT')}**`, inline: true },
      { name: `${EMOJI.LUCRO} Vendas`, value: `**${agg.vendas.toLocaleString('pt-PT')}**`, inline: true },
      { name: `${EMOJI.MATERIAL} Oficial`, value: `**${agg.oficial.toLocaleString('pt-PT')}**`, inline: true },
      { name: `${EMOJI.DEVOLVER} Devolvido`, value: `**${agg.devolvido.toLocaleString('pt-PT')}**`, inline: true }
    );

  // Progress to next tier — bar visual
  const { getPromotionProgress } = require('./autoPromotionEngine');
  const progress = await getPromotionProgress(interaction.user.id).catch(() => null);
  if (progress) {
    if (!progress.maxedOut) {
      const bar = progressBar(parseFloat(progress.progress), 100, { width: 12 });
      embed.addFields({
        name: `${EMOJI.TOPO} Progresso — ${progress.currentTierName} → ${progress.nextTierName}`,
        value:
          `${bar} **${progress.progress}%**\n` +
          `Meta: **${progress.threshold.toLocaleString('pt-PT')}** · Falta: **${progress.remaining.toLocaleString('pt-PT')}**`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: `${EMOJI.TOPO} Progresso`,
        value: `**${progress.currentTierName}** — tier máximo automático. Promoções acima daqui são manuais.`,
        inline: false,
      });
    }
  }

  return replySafe(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { messageClass: 'BANAL' });
}

async function handleProgressButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) throw new NotFoundError('Esse nome não está na casa.', { code: 'MEMBER_NOT_FOUND' });

  const { getPromotionProgress } = require('./autoPromotionEngine');
  const progress = await getPromotionProgress(interaction.user.id);
  if (!progress)
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Ainda sem dados de progresso.` },
      { messageClass: 'BANAL' }
    );

  const embed = brandEmbed('MOVEMENT')
    .setTitle(`${EMOJI.TOPO} Progresso — ${member.display_name || member.full_name}`)
    .addFields(
      { name: 'Rank actual', value: `**${progress.currentTierName}**`, inline: true },
      { name: 'XP total', value: `**${(progress.totalQty || 0).toLocaleString('pt-PT')}**`, inline: true }
    );

  if (!progress.maxedOut) {
    const bar = progressBar(parseFloat(progress.progress), 100, { width: 14 });
    embed.addFields({
      name: `${EMOJI.SAIDA} Próximo: ${progress.nextTierName}`,
      value:
        `${bar} **${progress.progress}%**\n` +
        `Meta: **${progress.threshold.toLocaleString('pt-PT')}** · Falta: **${progress.remaining.toLocaleString('pt-PT')}**`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: `${EMOJI.TOPO} Topo`,
      value: 'Tier máximo automático atingido. Promoções acima daqui são manuais.',
      inline: false,
    });
  }

  // Posição no ranking semanal
  const { weekBounds } = require('../util');
  const { start } = weekBounds();
  const weekStart = start.toISOString().split('T')[0];
  const { rankingRepo } = require('../repositories');
  const rankings = await rankingRepo.getWeekRanking(weekStart, 50);
  const myRank = rankings.findIndex(r => r.discord_id === interaction.user.id);
  if (myRank >= 0) {
    embed.addFields({
      name: `${EMOJI.TOPO} Topo Semanal`,
      value: `${rankBadge(myRank + 1)} em **${rankings.length}**`,
      inline: true,
    });
  }

  return replySafe(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

async function handleTopSemanalButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { weekBounds } = require('../util');
  const { start, end } = weekBounds();
  const weekStart = start.toISOString().split('T')[0];
  const { rankingRepo } = require('../repositories');
  let rankings = await rankingRepo.getWeekRanking(weekStart, 10);

  // Se ainda não há dados para esta semana, computa em tempo real.
  if (!rankings.length) {
    const { computeWeeklyRankings } = require('../rankings/rankingEngine');
    await computeWeeklyRankings();
    rankings = await rankingRepo.getWeekRanking(weekStart, 10);
  }

  if (!rankings.length)
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Sem dados de ranking esta semana.` },
      { messageClass: 'BANAL' }
    );

  const lines = rankings.map((r, i) => {
    const prefix = rankBadge(i + 1);
    const isMe = r.discord_id === interaction.user.id ? ' ← **tu**' : '';
    return `${prefix} <@${r.discord_id}> — **${Math.round(parseFloat(r.weighted_value)).toLocaleString('pt-PT')}** · ${r.deliveries} entregas · ${r.sales} vendas${isMe}`;
  });

  // Se user não está no top 10, mostra a sua posição
  const myRank = rankings.findIndex(r => r.discord_id === interaction.user.id);
  if (myRank < 0) {
    const allRankings = await rankingRepo.getWeekRanking(weekStart, 100);
    const myPos = allRankings.findIndex(r => r.discord_id === interaction.user.id);
    if (myPos >= 0) {
      lines.push('─────');
      lines.push(
        `**#${myPos + 1}.** <@${interaction.user.id}> — **${Math.round(parseFloat(allRankings[myPos].weighted_value)).toLocaleString('pt-PT')}** ← **tu**`
      );
    }
  }

  const weekLabel = `${start.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]}`;
  const embed = brandEmbed('TOP')
    .setTitle(RANKINGS.TITLE('Topo da Semana', weekLabel))
    .setDescription(lines.join('\n'));

  return replySafe(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

module.exports = {
  handleMemberCommand,
  handleMemberHistoryButton,
  handleMemberTotalsButton,
  handleProgressButton,
  handleTopSemanalButton,
};
