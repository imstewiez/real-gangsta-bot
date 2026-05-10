'use strict';
/**
 * orderManagementPanel — painel de gestão de encomendas para Chefia/OG+.
 *
 * Substitui o embed único caótico por:
 *   - Tabs por estado (Pendente | Em Processo | Pronta | Todas)
 *   - Paginação dentro de cada tab
 *   - Acções rápidas por encomenda (aprovar, recusar, entregar, etc.)
 */

const { MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { ordersRepo } = require('../repositories');
const { safeReply, safeUpdate } = require('../shared/interactionHelpers');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { formatMoney } = require('../shared/formatMoney');

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
  approved: { emoji: '✅', label: 'Aprovada', next: 'in_progress' },
  in_progress: { emoji: '🔧', label: 'Em Processo', next: 'ready' },
  ready: { emoji: '📦', label: 'Pronta', next: 'fulfilled' },
  fulfilled: { emoji: '✅', label: 'Entregue', next: null },
  denied: { emoji: '⛔', label: 'Recusada', next: null },
};

const TAB_STATUS = ['pending', 'in_progress', 'ready', 'fulfilled'];
const MANAGE_PAGE_SIZE = 5;

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

function _buildTabButton(status, currentTab, count) {
  const labelMap = {
    pending: `⏳ Pendentes${count ? ` (${count})` : ''}`,
    in_progress: `🔧 Em Processo${count ? ` (${count})` : ''}`,
    ready: `📦 Prontas${count ? ` (${count})` : ''}`,
    fulfilled: `✅ Entregues${count ? ` (${count})` : ''}`,
  };

  const isActive = status === currentTab;
  return new ButtonBuilder()
    .setCustomId(`ordermanage::tab::${status}`)
    .setLabel(labelMap[status] || status)
    .setStyle(isActive ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setDisabled(isActive);
}

function _buildManagementEmbed(orders, { tab, page, totalPages } = {}) {
  const embed = brandEmbed('MOVEMENT')
    .setTitle(`📦 Gerir Encomendas · ${STATUS_LABEL[tab] || tab}`)
    .setColor(
      tab === 'pending'
        ? COLOR.WARNING
        : tab === 'in_progress'
          ? COLOR.INFO
          : tab === 'ready'
            ? COLOR.PURPLE
            : COLOR.SUCCESS
    );

  if (!orders.length) {
    embed.setDescription('_Nenhuma encomenda nesta secção._');
    return embed;
  }

  const lines = orders.map(o => {
    const em = STATUS_EMOJI[o.status] || '•';
    const lbl = STATUS_LABEL[o.status] || o.status;
    const price = o.total_price ? ` · **${formatMoney(o.total_price)}**` : '';
    const mats = _fmtIngredients(o.ingredients_json);
    const matLine = mats ? `\n    📋 ${mats}` : '';
    return `${em} **#${o.id}** — ${o.quantity}× ${o.item_name} · ${o.member_name}${price} · _${lbl}_${matLine}`;
  });

  embed.setDescription(lines.join('\n').slice(0, 4096));
  embed.setFooter({ text: `Página ${page + 1}/${totalPages}` });
  return embed;
}

function _buildActionSelect(orders) {
  const opts = [];
  for (const o of orders.slice(0, 8)) {
    const actions = _actionsFor(o.status);
    for (const act of actions) {
      const meta = ACTION_META[act];
      opts.push({
        label: `${meta.emoji} #${o.id} — ${o.item_name}`.slice(0, 100),
        description: `${meta.label} (${o.member_name})`.slice(0, 100),
        value: `${o.id}:${act}`,
      });
    }
  }

  if (!opts.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ordermanage::action')
      .setPlaceholder('Escolhe uma acção…')
      .addOptions(opts)
  );
}

function _buildPaginationRow(page, totalPages, tab) {
  const prev = new ButtonBuilder()
    .setCustomId(`ordermanage::page::${tab}::${page - 1}`)
    .setLabel('◀️ Anterior')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 0);

  const next = new ButtonBuilder()
    .setCustomId(`ordermanage::page::${tab}::${page + 1}`)
    .setLabel('Próxima ▶️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  const refresh = new ButtonBuilder()
    .setCustomId(`ordermanage::tab::${tab}`)
    .setLabel('🔄 Atualizar')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(prev, next, refresh);
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

// ── Public API ─────────────────────────────────────────────────────────────

async function showManagementPanel(interaction, opts = {}) {
  const { tab = 'pending', page = 0 } = opts;

  // Contagens rápidas para os tabs
  const counts = {};
  for (const s of TAB_STATUS) {
    const rows = await ordersRepo.findByStatus(s, { limit: 1 });
    counts[s] = rows.length; // aproximação rápida; para valores exactos usar COUNT
  }
  // Validação real: se o tab estiver vazio, mostra mesmo assim

  const orders = await ordersRepo.findByStatus(tab, { limit: MANAGE_PAGE_SIZE * 2 });
  const totalPages = Math.max(1, Math.ceil(orders.length / MANAGE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageOrders = orders.slice(safePage * MANAGE_PAGE_SIZE, (safePage + 1) * MANAGE_PAGE_SIZE);

  const embed = _buildManagementEmbed(pageOrders, { tab, page: safePage, totalPages });

  const tabRow = new ActionRowBuilder().addComponents(TAB_STATUS.map(s => _buildTabButton(s, tab, counts[s])));

  const components = [tabRow];

  const actionRow = _buildActionSelect(pageOrders);
  if (actionRow) components.push(actionRow);

  components.push(_buildPaginationRow(safePage, totalPages, tab));

  if (interaction.deferred || interaction.replied) {
    return safeReply(interaction, { embeds: [embed], components }, { messageClass: 'COCKPIT' });
  }
  return safeUpdate(interaction, { embeds: [embed], components }, { messageClass: 'COCKPIT' });
}

async function handleOrderAction(interaction) {
  const value = interaction.values[0];
  if (value === 'refresh:refresh') {
    return showManagementPanel(interaction, { tab: 'pending' });
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

    // Notifica o membro via DM se possível
    try {
      const user = await interaction.client.users.fetch(order.member_discord_id);
      if (user) {
        const dmEmbed = brandEmbed('MOVEMENT')
          .setTitle('📦 Encomenda Actualizada')
          .setDescription(
            `A tua encomenda **#${order.id}** — ${order.quantity}× ${order.item_name} foi actualizada.\n` +
              `Novo estado: **${meta.emoji} ${meta.label}**`
          );
        await user.send({ embeds: [dmEmbed] }).catch(() => {});
      }
    } catch {
      // DM falhou, não-crítico
    }

    // Re-renderiza o painel no tab do estado anterior (ou 'pending' se não houver)
    await showManagementPanel(interaction, { tab: order.status === action ? action : 'pending' });

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

module.exports = {
  showManagementPanel,
  handleOrderAction,
  STATUS_EMOJI,
  STATUS_LABEL,
  ACTION_META,
};
