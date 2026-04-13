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
    return safeReply(interaction, { content: 'Membro não encontrado.', flags: MessageFlags.Ephemeral });
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

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleMemberHistoryButton(interaction) {
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(interaction, { content: 'Não estás registado no sistema.', flags: MessageFlags.Ephemeral });
  }

  const movements = await inventoryRepo.getMemberMovements(member.id, 20);
  if (!movements.length) {
    return safeReply(interaction, { content: 'Sem registos no teu histórico.', flags: MessageFlags.Ephemeral });
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

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleMemberTotalsButton(interaction) {
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(interaction, { content: 'Não estás registado no sistema.', flags: MessageFlags.Ephemeral });
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

  const embed = brandEmbed()
    .setTitle('Teus Totais')
    .setDescription(lines.join('\n'));

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handleMemberCommand, handleMemberHistoryButton, handleMemberTotalsButton };
