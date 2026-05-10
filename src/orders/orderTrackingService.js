'use strict';
/**
 * orderTrackingService — painel de histórico de encomendas do utilizador.
 *
 * Permite:
 *   - Ver encomendas pendentes / em processo / prontas / entregues / canceladas
 *   - Drill-down numa encomenda específica com histórico de estados
 */

const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { ordersRepo } = require('../repositories');
const { safeReply, safeUpdate } = require('../shared/interactionHelpers');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { formatMoney } = require('../shared/formatMoney');
const { memberRepo } = require('../repositories');

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

const TRACKING_PAGE_SIZE = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

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

function _buildTrackingEmbed(orders, { page = 0, totalPages = 1, statusFilter = null } = {}) {
  const embed = brandEmbed('HOUSE').setTitle(`${EMOJI.HISTORICO} Histórico de Encomendas`).setColor(COLOR.INFO);

  if (!orders.length) {
    embed.setDescription('_Nenhuma encomenda encontrada._');
    return embed;
  }

  const lines = orders.map(o => {
    const em = STATUS_EMOJI[o.status] || '•';
    const lbl = STATUS_LABEL[o.status] || o.status;
    return `${em} **#${o.id}** · ${o.quantity}× ${o.item_name} · **${formatMoney(o.total_price)}** · _${lbl}_`;
  });

  const filterText = statusFilter ? ` · Filtro: ${STATUS_LABEL[statusFilter] || statusFilter}` : '';
  embed.setDescription(lines.join('\n'));
  embed.setFooter({ text: `Página ${page + 1}/${totalPages}${filterText}` });

  return embed;
}

function _buildTrackingComponents(orders, { page = 0, totalPages = 1, memberDiscordId, statusFilter = null } = {}) {
  const rows = [];

  // Select para drill-down (até 25 encomendas)
  if (orders.length) {
    const options = orders.slice(0, 25).map(o => ({
      label: `#${o.id} · ${o.item_name}`.slice(0, 100),
      description: `${STATUS_LABEL[o.status] || o.status} · ${formatMoney(o.total_price)}`.slice(0, 100),
      value: String(o.id),
    }));

    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ordertrack::detail::${memberDiscordId}`)
          .setPlaceholder('👁️ Ver detalhes de uma encomenda…')
          .addOptions(options)
      )
    );
  }

  // Botões de paginação + filtros rápidos
  const prevBtn = new ButtonBuilder()
    .setCustomId(`ordertrack::page::${memberDiscordId}::${page - 1}::${statusFilter || 'all'}`)
    .setLabel('◀️ Anterior')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`ordertrack::page::${memberDiscordId}::${page + 1}::${statusFilter || 'all'}`)
    .setLabel('Próxima ▶️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  const pendingBtn = new ButtonBuilder()
    .setCustomId(`ordertrack::filter::${memberDiscordId}::pending`)
    .setLabel('⏳ Pendentes')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(statusFilter === 'pending');

  const allBtn = new ButtonBuilder()
    .setCustomId(`ordertrack::filter::${memberDiscordId}::all`)
    .setLabel('📋 Todas')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!statusFilter);

  rows.push(new ActionRowBuilder().addComponents(prevBtn, nextBtn, pendingBtn, allBtn));

  return rows;
}

// ── Public API ─────────────────────────────────────────────────────────────

async function showTrackingPanel(interaction, opts = {}) {
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      { content: 'Não estás registado no sistema.', flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const { page = 0, statusFilter = null } = opts;
  const allOrders = await ordersRepo.findByMember(member.id, { limit: 100, status: statusFilter });

  const totalPages = Math.max(1, Math.ceil(allOrders.length / TRACKING_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageOrders = allOrders.slice(safePage * TRACKING_PAGE_SIZE, (safePage + 1) * TRACKING_PAGE_SIZE);

  const embed = _buildTrackingEmbed(pageOrders, { page: safePage, totalPages, statusFilter });
  const components = _buildTrackingComponents(pageOrders, {
    page: safePage,
    totalPages,
    memberDiscordId: interaction.user.id,
    statusFilter,
  });

  if (interaction.deferred || interaction.replied) {
    return safeReply(interaction, { embeds: [embed], components }, { messageClass: 'COCKPIT' });
  }
  return safeUpdate(interaction, { embeds: [embed], components }, { messageClass: 'COCKPIT' });
}

async function showOrderDetail(interaction, orderId) {
  if (!orderId && interaction.values?.length) {
    orderId = parseInt(interaction.values[0], 10);
  }

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      { content: 'Não estás registado no sistema.', flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const order = await ordersRepo.findById(orderId);
  if (!order || order.member_id !== member.id) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Encomenda não encontrada.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const history = await ordersRepo.getStatusHistory(orderId);
  const em = STATUS_EMOJI[order.status] || '•';
  const lbl = STATUS_LABEL[order.status] || order.status;

  const embed = brandEmbed('HOUSE')
    .setTitle(`${EMOJI.ENCOMENDA} Encomenda #${order.id}`)
    .setColor(
      order.status === 'fulfilled'
        ? COLOR.SUCCESS
        : order.status === 'cancelled' || order.status === 'denied'
          ? COLOR.MUTED
          : COLOR.INFO
    );

  embed.addFields(
    { name: 'Item', value: `${order.quantity}× ${order.item_name}`, inline: false },
    { name: 'Estado', value: `${em} ${lbl}`, inline: true },
    { name: 'Total', value: formatMoney(order.total_price), inline: true },
    { name: 'Data', value: new Date(order.created_at).toLocaleDateString('pt-PT'), inline: true }
  );

  if (order.notes) {
    embed.addFields({ name: '📝 Notas', value: order.notes.slice(0, 1024), inline: false });
  }

  const mats = _fmtIngredients(order.ingredients_json);
  if (mats) {
    embed.addFields({ name: `${EMOJI.CRAFT} Materiais`, value: mats.slice(0, 1024), inline: false });
  }

  if (history.length) {
    const histLines = history.slice(0, 10).map(h => {
      const oldLbl = STATUS_LABEL[h.old_status] || h.old_status;
      const newLbl = STATUS_LABEL[h.new_status] || h.new_status;
      const date = new Date(h.created_at).toLocaleDateString('pt-PT');
      return `• ${oldLbl} → ${newLbl} · ${date}`;
    });
    embed.addFields({ name: '📜 Histórico', value: histLines.join('\n').slice(0, 1024), inline: false });
  }

  const backBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ordertrack::back::${interaction.user.id}`)
      .setLabel('🔙 Voltar ao Histórico')
      .setStyle(ButtonStyle.Secondary)
  );

  return safeUpdate(interaction, { embeds: [embed], components: [backBtn] }, { messageClass: 'FLOW' });
}

module.exports = {
  showTrackingPanel,
  showOrderDetail,
  STATUS_EMOJI,
  STATUS_LABEL,
};
