'use strict';
const { MessageFlags, EmbedBuilder } = require('discord.js');
const { memberRepo, inventoryRepo } = require('../repositories');
const { safeReply } = require('../shared/interactionHelpers');
const { memberProfileEmbed, brandEmbed } = require('../shared/embedBuilders');
const { isChefia, isChefeMoradores } = require('../permissions/permissionEngine');
const { mentionUser } = require('../util');

async function handleMemberCommand(interaction) {
  const targetUser = interaction.options.getUser('membro') || interaction.user;
  const member = await memberRepo.findByDiscordId(targetUser.id);

  if (!member) {
    return safeReply(interaction, { content: 'Membro não encontrado.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const embed = memberProfileEmbed(member);

  const totals = await inventoryRepo.getMemberTotals(member.id);
  if (Object.keys(totals).length > 0) {
    const lines = [];
    if (totals.entrega_morador) lines.push(`Entregas: **${totals.entrega_morador}**`);
    if (totals.venda_morador) lines.push(`Vendas: **${totals.venda_morador}**`);
    if (totals.entrega_oficial) lines.push(`Entregas (oficial): **${totals.entrega_oficial}**`);
    embed.addFields({ name: 'Totais de Material', value: lines.join('\n') || '\u2014' });
  }

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { dismissible: true });
}

async function handleMemberHistoryButton(interaction) {
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(interaction, { content: 'Não estás registado no sistema.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const movements = await inventoryRepo.getMemberMovements(member.id, 20);
  if (!movements.length) {
    return safeReply(interaction, { content: 'Sem registos no teu histórico.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const typeLabels = {
    entrega_morador: 'Entrega', venda_morador: 'Venda',
    entrega_oficial: 'Entrega (oficial)', devolucao_operacao: 'Devolução',
  };

  const lines = movements.map(m => {
    const date = m.created_at?.toISOString?.()?.split('T')[0] || '';
    const label = typeLabels[m.movement_type] || m.movement_type;
    return `\`${date}\` ${label}: **${m.quantity}x** ${m.item_name}`;
  });

  const embed = brandEmbed()
    .setTitle('Teu Histórico')
    .setDescription(lines.join('\n'));

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { dismissible: true });
}

async function handleMemberTotalsButton(interaction) {
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(interaction, { content: 'Não estás registado no sistema.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const totals = await inventoryRepo.getMemberTotals(member.id);
  const lines = [];
  const labels = {
    entrega_morador: 'Entregas', venda_morador: 'Vendas',
    entrega_oficial: 'Entregas (oficial)', devolucao_operacao: 'Devoluções',
  };

  for (const [type, label] of Object.entries(labels)) {
    lines.push(`${label}: **${totals[type] || 0}**`);
  }

  // Progresso de promoção
  const { getPromotionProgress, formatTierName } = require('./autoPromotionEngine');
  const progress = await getPromotionProgress(interaction.user.id).catch(() => null);
  if (progress) {
    lines.push('');
    lines.push(`\u2500\u2500 **Progresso** \u2500\u2500`);
    lines.push(`Rank atual: **${progress.currentTierName}**`);
    lines.push(`Material total: **${progress.totalValue.toLocaleString('pt-PT')}\u20AC**`);
    if (!progress.maxedOut) {
      const filled = Math.round(parseFloat(progress.progress) / 10);
      const empty = 10 - filled;
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
      lines.push(`Próximo: **${progress.nextTierName}** (${progress.threshold.toLocaleString('pt-PT')}\u20AC)`);
      lines.push(`${bar} **${progress.progress}%**`);
      lines.push(`Falta: **${progress.remaining.toLocaleString('pt-PT')}\u20AC**`);
    } else {
      lines.push('Nível máximo automático atingido!');
    }
  }

  const embed = brandEmbed()
    .setTitle('Teus Totais')
    .setDescription(lines.join('\n'));

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { dismissible: true });
}

async function handleProgressButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) return safeReply(interaction, { content: 'Não estás registado no sistema.' }, { dismissible: true });

  const { getPromotionProgress, formatTierName } = require('./autoPromotionEngine');
  const progress = await getPromotionProgress(interaction.user.id);
  if (!progress) return safeReply(interaction, { content: 'Sem dados de progresso.' }, { dismissible: true });

  const lines = [];
  lines.push(`\uD83C\uDFAD **Rank:** ${progress.currentTierName}`);
  lines.push(`\uD83D\uDC8E **Material Total:** ${progress.totalValue.toLocaleString('pt-PT')}\u20AC`);
  lines.push('');

  if (!progress.maxedOut) {
    const filled = Math.round(parseFloat(progress.progress) / 10);
    const empty = 10 - filled;
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
    lines.push(`\uD83C\uDFAF **Próximo Rank:** ${progress.nextTierName}`);
    lines.push(`${bar} **${progress.progress}%**`);
    lines.push(`Meta: **${progress.threshold.toLocaleString('pt-PT')}\u20AC** \u2014 Falta: **${progress.remaining.toLocaleString('pt-PT')}\u20AC**`);
  } else {
    lines.push('\u2705 **Nível máximo automático atingido!**');
    lines.push('Promoções acima deste rank são manuais pela chefia.');
  }

  // Position in weekly ranking
  const { weekBounds } = require('../util');
  const { start } = weekBounds();
  const weekStart = start.toISOString().split('T')[0];
  const { rankingRepo } = require('../repositories');
  const rankings = await rankingRepo.getWeekRanking(weekStart, 50);
  const myRank = rankings.findIndex(r => r.discord_id === interaction.user.id);
  if (myRank >= 0) {
    lines.push('');
    lines.push(`\uD83C\uDFC6 **Posição no Top Semanal:** #${myRank + 1} de ${rankings.length}`);
  }

  const embed = brandEmbed()
    .setTitle(`\uD83D\uDCCA Progresso \u2014 ${member.display_name || member.full_name}`)
    .setDescription(lines.join('\n'));

  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

async function handleTopSemanalButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { weekBounds } = require('../util');
  const { start, end } = weekBounds();
  const weekStart = start.toISOString().split('T')[0];
  const { rankingRepo } = require('../repositories');
  const rankings = await rankingRepo.getWeekRanking(weekStart, 10);

  if (!rankings.length) return safeReply(interaction, { content: 'Sem dados de ranking esta semana.' }, { dismissible: true });

  const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
  const lines = rankings.map((r, i) => {
    const prefix = medals[i] || `**${i + 1}.**`;
    const isMe = r.discord_id === interaction.user.id ? ' \u2190 **TU**' : '';
    return `${prefix} <@${r.discord_id}> \u2014 **${parseFloat(r.weighted_value).toLocaleString('pt-PT')}\u20AC** (${r.deliveries} entregas, ${r.sales} vendas)${isMe}`;
  });

  // Check if user is in top 10
  const myRank = rankings.findIndex(r => r.discord_id === interaction.user.id);
  if (myRank < 0) {
    const allRankings = await rankingRepo.getWeekRanking(weekStart, 100);
    const myPos = allRankings.findIndex(r => r.discord_id === interaction.user.id);
    if (myPos >= 0) {
      lines.push('');
      lines.push(`\u2500\u2500\u2500`);
      lines.push(`**${myPos + 1}.** <@${interaction.user.id}> \u2014 **${parseFloat(allRankings[myPos].weighted_value).toLocaleString('pt-PT')}\u20AC** \u2190 **TU**`);
    }
  }

  const weekLabel = `${start.toISOString().split('T')[0]} a ${end.toISOString().split('T')[0]}`;
  const embed = brandEmbed()
    .setTitle(`\uD83C\uDFC6 Top Semanal \u2014 ${weekLabel}`)
    .setDescription(lines.join('\n'));

  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = {
  handleMemberCommand, handleMemberHistoryButton, handleMemberTotalsButton,
  handleProgressButton, handleTopSemanalButton,
};
