'use strict';
/**
 * Gestão de encomendas para Chefia/OG+.
 *
 * Fluxo:
 *   1. User clica "Gerir Encomendas" no painel chefia.
 *   2. Aparece embed com lista + select menu de acções rápidas.
 *   3. Cada acção muda o estado da encomenda e notifica o bairrista.
 *
 * Estados:
 *   pending → in_progress → ready → fulfilled
 *   pending → denied|cancelled
 */

const {
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { ordersRepo } = require('../repositories');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { formatMoney } = require('../shared/formatMoney');
const { EMOJI } = require('../content');
const { sendDM } = require('../shared/dm');

const STATUS_EMOJI = {
  pending: '⏳',
  in_progress: '🔧',
  ready: '📦',
  fulfilled: '✅',
  denied: '⛔',
  cancelled: '🚫',
};

const STATUS_LABEL = {
  pending: 'Pendente',
  in_progress: 'Em Processo',
  ready: 'Pronta',
  fulfilled: 'Entregue',
  denied: 'Recusada',
  cancelled: 'Cancelada',
};

const ACTION_META = {
  approved: { emoji: '✅', label: 'Aprovada' },
  in_progress: { emoji: '🔧', label: 'Em Processo' },
  ready: { emoji: '📦', label: 'Pronta' },
  fulfilled: { emoji: '✅', label: 'Entregue' },
  denied: { emoji: '⛔', label: 'Recusada' },
};

function _fmtIngredients(json) {
  if (!json) return '';
  try {
    const list = JSON.parse(json);
    if (!Array.isArray(list) || !list.length) return '';
    return list.map(i => `${i.qty}× ${i.name}`).join(', ');
  } catch {
    return '';
  }
}

async function _notifyMemberOrderStatus(client, order, statusLabel, color, actorId, notes = null) {
  if (!order.member_discord_id) return;
  try {
    const user = await client.users.fetch(order.member_discord_id).catch(() => null);
    if (!user) return;
    const embed = brandEmbed('HOUSE')
      .setColor(color)
      .setTitle(`${STATUS_EMOJI[order.status] || '•'} Encomenda ${statusLabel}`)
      .setDescription(`**${order.quantity}× ${order.item_name}**`)
      .addFields(
        { name: 'Estado', value: statusLabel, inline: true },
        { name: 'Por', value: `<@${actorId}>`, inline: true }
      );
    if (notes) embed.addFields({ name: 'Motivo', value: String(notes).slice(0, 500), inline: false });
    await sendDM(user, { embeds: [embed] });
  } catch {
    // best-effort
  }
}

async function handleGerirEncomendas(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rows = await ordersRepo.findByStatus('pending', { limit: 50 });
  const inProgress = await ordersRepo.findByStatus('in_progress', { limit: 50 });
  const ready = await ordersRepo.findByStatus('ready', { limit: 50 });
  const all = [...rows, ...inProgress, ...ready];

  if (!all.length) {
    const embed = brandEmbed('HOUSE').setTitle('📦 Gerir Encomendas').setDescription('_Nenhuma encomenda activa._');
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
  }

  const lines = all.map(o => {
    const em = STATUS_EMOJI[o.status] || '•';
    const lbl = STATUS_LABEL[o.status] || o.status;
    const price = o.total_price ? ` · **${formatMoney(o.total_price)}**` : '';
    const mats = _fmtIngredients(o.ingredients_json);
    const matLine = mats ? `\n    📋 ${mats}` : '';
    return `${em} **#${o.id}** — ${o.quantity}× ${o.item_name} · ${o.member_name}${price} · _${lbl}_${matLine}`;
  });

  const embed = brandEmbed('MOVEMENT')
    .setTitle(`📦 Gerir Encomendas — ${all.length} activa(s)`)
    .setDescription(lines.join('\n'));

  // Build select options: max 25 (Discord limit). Each order gets up to 3 actions.
  // Prioritize pending first, then in_progress, then ready.
  const opts = [];
  for (const o of all.slice(0, 8)) {
    const actions = _actionsFor(o.status);
    for (const act of actions) {
      const meta = ACTION_META[act];
      opts.push({
        label: `${meta.emoji} #${o.id} — ${o.item_name}`,
        description: `${meta.label} (${o.member_name})`,
        value: `${o.id}:${act}`,
        emoji: meta.emoji,
      });
    }
  }

  // Refresh option
  opts.push({
    label: '🔄 Atualizar lista',
    description: 'Recarregar encomendas activas',
    value: 'refresh:refresh',
    emoji: '🔄',
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId('order::manage_action')
    .setPlaceholder('Escolhe uma acção...')
    .addOptions(opts);

  const row = new ActionRowBuilder().addComponents(select);
  return safeReply(interaction, { embeds: [embed], components: [row] }, { messageClass: 'COCKPIT' });
}

function _actionsFor(status) {
  switch (status) {
    case 'pending':
      return ['in_progress', 'fulfilled', 'denied'];
    case 'in_progress':
      return ['ready', 'fulfilled', 'denied'];
    case 'ready':
      return ['fulfilled', 'denied'];
    default:
      return [];
  }
}

async function handleOrderManageSelect(interaction) {
  const value = interaction.values[0];
  if (value === 'refresh:refresh') {
    return handleGerirEncomendas(interaction);
  }

  const [orderIdStr, action] = value.split(':');
  const orderId = parseInt(orderIdStr, 10);
  if (!orderId || !action) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Acção inválida.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const order = await ordersRepo.updateStatus(orderId, {
      status: action,
      actorDiscordId: interaction.user.id,
    });

    const meta = ACTION_META[action] || { emoji: '✅', label: action };

    // Notify the member via DM if possible
    try {
      const member = await interaction.client.users.fetch(order.member_discord_id);
      if (member) {
        const dmEmbed = brandEmbed('MOVEMENT')
          .setTitle('📦 Encomenda Actualizada')
          .setDescription(
            `A tua encomenda **#${order.id}** — ${order.quantity}× ${order.item_name} foi actualizada.\n` +
              `Novo estado: **${meta.emoji} ${meta.label}**`
          );
        await member.send({ embeds: [dmEmbed] }).catch(() => {});
      }
    } catch {
      // DM failed, non-critical
    }

    return safeReply(
      interaction,
      {
        content: `${meta.emoji} Encomenda **#${order.id}** — ${order.quantity}× ${order.item_name} → **${meta.label}**.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  } catch (e) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Erro: ${e.message}`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
}

async function handleOrderAceitarButton(interaction) {
  const orderId = parseInt(interaction.customId.split('::')[2], 10);
  if (!orderId) return safeReply(interaction, { content: `${EMOJI.WARN} ID inválido.` }, { messageClass: 'BANAL' });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const order = await ordersRepo.updateStatus(orderId, {
      status: 'in_progress',
      actorDiscordId: interaction.user.id,
    });

    // Update the original channel message to reflect new status
    try {
      if (interaction.message) {
        const updatedEmbed = brandEmbed('MOVEMENT')
          .setTitle('🔧 Encomenda em Processo')
          .setDescription(`**${order.quantity}× ${order.item_name}**\nAceite por <@${interaction.user.id}>`);
        await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
      }
    } catch {
      // Non-critical
    }

    await _notifyMemberOrderStatus(interaction.client, order, 'Em Processo', 0x3b82f6, interaction.user.id);

    return safeReply(
      interaction,
      {
        content: `🔧 Encomenda **#${order.id}** — ${order.quantity}× ${order.item_name} → **Em Processo**.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  } catch (e) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Erro: ${e.message}`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
}

async function handleOrderEntregueButton(interaction) {
  const orderId = parseInt(interaction.customId.split('::')[2], 10);
  if (!orderId) return safeReply(interaction, { content: `${EMOJI.WARN} ID inválido.` }, { messageClass: 'BANAL' });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const order = await ordersRepo.updateStatus(orderId, { status: 'fulfilled', actorDiscordId: interaction.user.id });

    // Update the original channel message
    try {
      if (interaction.message) {
        const updatedEmbed = brandEmbed('MOVEMENT')
          .setTitle('✅ Encomenda Entregue')
          .setDescription(`**${order.quantity}× ${order.item_name}**\nEntregue por <@${interaction.user.id}>`);
        await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
      }
    } catch {
      // Non-critical
    }

    await _notifyMemberOrderStatus(interaction.client, order, 'Entregue', 0x22c55e, interaction.user.id);

    return safeReply(
      interaction,
      {
        content: `✅ Encomenda **#${order.id}** — ${order.quantity}× ${order.item_name} → **Entregue**.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  } catch (e) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Erro: ${e.message}`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
}

async function handleOrderRecusarButton(interaction) {
  const orderId = parseInt(interaction.customId.split('::')[2], 10);
  if (!orderId) return safeReply(interaction, { content: `${EMOJI.WARN} ID inválido.` }, { messageClass: 'BANAL' });

  const modal = new ModalBuilder()
    .setCustomId(`order::modal_recusar::${orderId}`)
    .setTitle('Recusar Encomenda')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('motivo')
          .setLabel('Motivo da recusa')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Material indisponível, preço incorreto, etc.')
          .setRequired(true)
          .setMaxLength(500)
      )
    );
  return interaction.showModal(modal);
}

async function handleOrderRecusarModal(interaction) {
  const orderId = parseInt(interaction.customId.split('::')[2], 10);
  const motivo = interaction.fields.getTextInputValue('motivo');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const order = await ordersRepo.updateStatus(orderId, {
      status: 'denied',
      actorDiscordId: interaction.user.id,
      notes: motivo,
    });

    // Update the original channel message
    try {
      if (interaction.message) {
        const updatedEmbed = brandEmbed('MOVEMENT')
          .setTitle('⛔ Encomenda Recusada')
          .setDescription(
            `**${order.quantity}× ${order.item_name}**\nRecusada por <@${interaction.user.id}>\n**Motivo:** ${motivo}`
          );
        await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
      }
    } catch {
      // Non-critical
    }

    await _notifyMemberOrderStatus(interaction.client, order, 'Recusada', 0xef4444, interaction.user.id, motivo);

    return safeReply(
      interaction,
      {
        content: `⛔ Encomenda **#${order.id}** — ${order.quantity}× ${order.item_name} → **Recusada**\nMotivo: ${motivo}`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  } catch (e) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Erro: ${e.message}`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
}

module.exports = {
  handleGerirEncomendas,
  handleOrderManageSelect,
  handleOrderAceitarButton,
  handleOrderEntregueButton,
  handleOrderRecusarButton,
  handleOrderRecusarModal,
};
