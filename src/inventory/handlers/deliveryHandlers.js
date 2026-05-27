'use strict';
const { MessageFlags } = require('discord.js');
const { safeReply } = require('../../shared/interactionHelpers');
const { brandEmbed, COLOR } = require('../../shared/embedBuilders');
const { canOpenSession, isPatraoDiZona } = require('../../permissions/permissionEngine');
const { EMOJI } = require('../../content');

async function handleDeliveryApproverSelect(interaction) {
  await interaction.deferUpdate().catch(() => {});

  const approverId = interaction.values[0];
  const bairristaCart = require('../bairristaCart');
  const cart = await bairristaCart.getCart(interaction.user.id);
  if (!cart || cart.tipo !== 'entrega') {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Carrinho expirado.`, embeds: [], components: [] },
      { messageClass: 'BANAL' }
    );
  }

  let approverMember = null;
  try {
    approverMember = await interaction.guild.members.fetch(approverId);
  } catch {
    approverMember = null;
  }
  if (!approverMember || !canOpenSession(approverMember)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Tens de escolher um OG ou alguém acima na hierarquia.`,
        embeds: [],
        components: bairristaCart.buildDeliveryApproverComponents(),
      },
      { messageClass: 'WARN' }
    );
  }

  const linesSnapshot = cart.lines.map(l => ({
    itemId: l.itemId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));
  const globalNotesSnapshot = cart.globalNotes;

  const { createDeliveryRequest } = require('../inventoryEngine');
  let result;
  try {
    result = await createDeliveryRequest({
      discordId: interaction.user.id,
      approverDiscordId: approverId,
      lines: linesSnapshot,
      globalNotes: globalNotesSnapshot,
      createdBy: interaction.user.id,
    });
  } catch (e) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} ${e.message}`, embeds: [], components: [] },
      { messageClass: 'ERROR' }
    );
  }

  await bairristaCart.clearCart(interaction.user.id);
  const parentStore = require('../../shared/parentInteractionStore');
  parentStore.clearParent(interaction.user.id);

  try {
    const requestEmbed = bairristaCart.buildDeliveryRequestEmbed({
      requestId: result.request.id,
      memberName: result.member.display_name,
      memberDiscordId: result.member.discord_id,
      lines: result.lines,
      totalQty: result.totalQty,
      totalValue: result.totalValue,
      notes: globalNotesSnapshot,
      tipo: cart.tipo,
    });
    const decisionComponents = bairristaCart.buildDeliveryDecisionComponents(result.request.id);

    let delivered = 'canal';
    const { resolveChannel } = require('../../shared/channels');
    const staffChannel = await resolveChannel(interaction.client, 'INVENTORY_EVENTS');
    if (staffChannel) {
      await staffChannel.send({
        content: `<@${approverId}> tens uma entrega para confirmar.`,
        embeds: [requestEmbed],
        components: decisionComponents,
      });
    } else {
      delivered = 'DM';
      try {
        await approverMember.send({ embeds: [requestEmbed], components: decisionComponents });
      } catch {
        delivered = 'local';
        await interaction.channel
          ?.send({
            content: `<@${approverId}> tens uma entrega para confirmar.`,
            embeds: [requestEmbed],
            components: decisionComponents,
          })
          .catch(() => {
            delivered = 'pendente';
          });
      }
    }

    const msg =
      delivered === 'pendente'
        ? 'Pedido criado, mas não consegui notificar o OG+. Pede-lhe para abrir a mensagem de confirmação se tiver sido entregue noutro canal.'
        : `Pedido enviado para <@${approverId}> (${delivered}). O stock só muda quando a entrega for aceite.`;

    return safeReply(
      interaction,
      { content: `${EMOJI.OK} ${msg}`, embeds: [], components: [] },
      { messageClass: 'BANAL', ttlMs: 15_000 }
    );
  } catch (e) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Pedido criado, mas falhou a notifica\u00e7\u00e3o do OG+: ${e.message}`,
        embeds: [],
        components: [],
      },
      { messageClass: 'ERROR', ttlMs: 15_000 }
    );
  }
}

async function handleDeliveryDecision(interaction) {
  // V12: só Patrão/OG/Kingpin/Manda-Chuva podem aprovar
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Só Patrão di Zona, OG, Kingpin ou Manda-Chuva podem aprovar entregas/vendas.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  await interaction.deferUpdate().catch(() => {});

  const [, action, requestId] = interaction.customId.split('::');
  const approve = action === 'approve';
  const { decideDeliveryRequest } = require('../inventoryEngine');
  const result = await decideDeliveryRequest({
    requestId,
    decisionBy: interaction.user.id,
    approve,
  });

  if (!result.ok) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} ${result.reason}`, embeds: [], components: [] },
      { messageClass: 'WARN', ttlMs: 15_000 }
    );
  }

  // Notificar o bairrista do resultado
  try {
    const bairristaUser = await interaction.client.users.fetch(result.member.discord_id).catch(() => null);
    if (bairristaUser) {
      const isVenda = result.request?.tipo === 'venda';
      if (approve) {
        const embed = brandEmbed('MOVEMENT')
          .setColor(isVenda ? COLOR.GOLD : COLOR.SUCCESS)
          .setTitle(isVenda ? '💰 Venda Confirmada' : '✅ Entrega Confirmada')
          .setDescription(`Aprovada por <@${interaction.user.id}>`);

        // List items as fields
        for (const l of result.lines || []) {
          embed.addFields(
            { name: '📦 Item', value: `**${l.itemName}**`, inline: true },
            { name: '🔢 Qtd', value: `**${l.quantity.toLocaleString('pt-PT')}** unidades`, inline: true }
          );
        }
        embed.addFields({
          name: '📊 Total confirmado',
          value: `**${result.totalQty.toLocaleString('pt-PT')}** unidades`,
          inline: false,
        });
        embed.setFooter({ text: 'Obrigado pela contribuição! 🙏' });
        await bairristaUser.send({ embeds: [embed] }).catch(() => {});
      } else {
        const embed = brandEmbed('MOVEMENT')
          .setColor(COLOR.DANGER)
          .setTitle(isVenda ? '❌ Venda Rejeitada' : '❌ Entrega Rejeitada')
          .setDescription(`Rejeitada por <@${interaction.user.id}>`);

        const decisionReason = result.request?.decision_reason;
        if (decisionReason) {
          embed.addFields({ name: '📝 Motivo', value: String(decisionReason).slice(0, 500), inline: false });
        }
        embed.addFields({
          name: '⚠️ Info',
          value: '_Nada foi alterado no stock._',
          inline: false,
        });
        embed.setFooter({ text: 'Podes submeter novamente se necessário.' });
        await bairristaUser.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch (_) {
    // Best-effort DM
  }

  if (!approve) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.OK} ${result.request?.tipo === 'venda' ? 'Venda' : 'Entrega'} recusada. Nada foi alterado no stock.`,
        embeds: [],
        components: [],
      },
      { messageClass: 'BANAL', ttlMs: 15_000 }
    );
  }

  const { checkAndPromote } = require('../../members/autoPromotionEngine');
  await checkAndPromote(result.member.discord_id, interaction.guild, interaction.client).catch(() => null);

  return safeReply(
    interaction,
    {
      content:
        `${EMOJI.OK} ${result.request?.tipo === 'venda' ? 'Venda' : 'Entrega'} aceite. ` +
        `${result.totalQty.toLocaleString('pt-PT')} unidade(s) foram confirmadas no stock para <@${result.member.discord_id}>.`,
      embeds: [],
      components: [],
    },
    { messageClass: 'BANAL', ttlMs: 15_000 }
  );
}

module.exports = {
  handleDeliveryApproverSelect,
  handleDeliveryDecision,
};
