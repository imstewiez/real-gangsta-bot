'use strict';
/**
 * Handlers do fluxo de encomendas estilo carrinho.
 *
 * Fluxo:
 *   1. bairrista::encomendar → inicia/refresh carrinho
 *   2. ordercart::add → mostra categorias filtradas
 *   3. ordercat::<userId> → mostra itens da categoria
 *   4. orderitem::<userId>::<itemId> → mostra preview c/ preços s/ Mat / c/ Mat
 *   5. ordermode::<mode>::<itemId> → guarda modo e abre modal de quantidade
 *   6. inv::modal_order_qty → adiciona ao carrinho
 *   7. Carrinho: add | remove | clear | checkout
 *   8. Checkout → cria orders na DB + notifica chefia
 */

const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { safeReply, safeUpdate, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { formatMoney } = require('../shared/formatMoney');
const { memberRepo } = require('../repositories');
const { inventoryRepo } = require('../repositories');
const { ordersRepo } = require('../repositories');
const { calculateOrderPricing } = require('./orderPricingEngine');
const orderCart = require('./orderCart');
const orderCatalog = require('./orderCatalog');
const { createSessionStore } = require('../shared/sessionStore');

const { SANITY_MAX_QTY } = require('../shared/constants');

// Session para guardar item em seleção antes do modal
const pendingSelections = createSessionStore('orderPending', { ttlMs: 10 * 60 * 1000 });

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY POINT — inicia carrinho
// ═══════════════════════════════════════════════════════════════════════════

async function handleEncomendasButton(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(interaction, { content: 'Não estás registado no sistema.' }, { messageClass: 'BANAL' });
  }

  let cart = orderCart.getCart(interaction.user.id);
  if (!cart) cart = orderCart.createCart(interaction.user.id);

  const embed = orderCart.buildCartEmbed(cart, { memberName: member.display_name });
  const components = orderCart.buildCartComponents(cart);
  return safeReply(interaction, { embeds: [embed], components }, { messageClass: 'COCKPIT' });
}

// ═══════════════════════════════════════════════════════════════════════════
// ADICIONAR ITEM — categorias
// ═══════════════════════════════════════════════════════════════════════════

async function handleOrderCartAdd(interaction) {
  if (isDuplicate(interaction.id)) return;

  const cart = orderCart.getCart(interaction.user.id);
  if (!cart) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Carrinho expirado. Volta a clicar em Encomendar.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const rows = await orderCatalog.buildOrderCategorySelect(
    `ordercat::${interaction.user.id}`,
    'Seleciona a categoria',
    { searchKey: `ordercat::${interaction.user.id}`, modalTitle: 'Pesquisar categoria' }
  );

  const embed = brandEmbed('HOUSE')
    .setTitle(`${EMOJI.ENCOMENDA} Nova Encomenda`)
    .setDescription(
      'Escolhe a categoria do item que queres encomendar.\n\nSó aparecem os artigos disponíveis no preçário.'
    );

  return safeUpdate(interaction, { embeds: [embed], components: rows });
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECIONAR CATEGORIA → mostra itens
// ═══════════════════════════════════════════════════════════════════════════

async function handleOrderCategorySelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const category = interaction.values[0];
  if (category === 'none') return;

  const rows = await orderCatalog.buildOrderItemSelect(
    `orderitem::${interaction.user.id}`,
    'Escolhe o item',
    category,
    { searchKey: `orderitem::${interaction.user.id}`, modalTitle: 'Pesquisar item' }
  );

  // Botão para voltar ao carrinho
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ordercart::back')
        .setLabel('🔙 Voltar ao Carrinho')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  const catMeta = orderCatalog.ORDER_CATEGORIES.find(c => c.key === category);
  const embed = brandEmbed('HOUSE')
    .setTitle(`${EMOJI.ENCOMENDA} ${catMeta?.label || category}`)
    .setDescription('Escolhe o artigo que queres encomendar.');

  return safeUpdate(interaction, { embeds: [embed], components: rows });
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECIONAR ITEM → mostra preview com preços
// ═══════════════════════════════════════════════════════════════════════════

async function handleOrderItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0], 10);
  if (!itemId || itemId === 'none') return;

  const item = await inventoryRepo.getItemById(itemId);
  if (!item) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Item não encontrado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      { content: 'Não estás registado no sistema.', flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  // Calcula preço para 1 unidade (preço base + materiais obrigatórios)
  const pricing = await calculateOrderPricing({
    itemId,
    quantity: 1,
    memberRole: member.role,
    memberTier: member.tier,
  });

  // Guarda na sessão para o handler de quantidade usar
  pendingSelections.set(interaction.user.id, {
    itemId,
    itemName: item.name,
    category: item.category,
    pricing,
    memberRole: member.role,
    memberTier: member.tier,
  });

  const embed = brandEmbed('HOUSE').setTitle(`📦 ${item.name}`).setColor(COLOR.PRIMARY);

  const descLines = [];
  descLines.push(`**💰 Preço:** ${formatMoney(pricing.finalPrice)} por unidade`);

  if (pricing.hasRecipe) {
    descLines.push('', '🛠️ **Materiais obrigatórios por unidade:**');
    for (const ing of pricing.ingredients) {
      descLines.push(`  • ${ing.name}: **${ing.qty}×**`);
    }
  }

  descLines.push('', `💳 Multiplicador: **${(pricing.multiplier * 100).toFixed(1)}%** (${member.role})`);
  embed.setDescription(descLines.join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ordermode::materials_money::${itemId}`)
      .setLabel('📦 Encomendar')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ordercart::add').setLabel('🔙 Voltar').setStyle(ButtonStyle.Secondary)
  );

  await safeUpdate(interaction, { embeds: [embed], components: [row] });
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCOLHER MODO → abre modal de quantidade
// ═══════════════════════════════════════════════════════════════════════════

async function handleOrderModeSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const parts = interaction.customId.split('::');
  const mode = parts[2];
  const itemId = parseInt(parts[3], 10);

  const pending = pendingSelections.get(interaction.user.id);
  if (!pending || pending.itemId !== itemId) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Sessão expirada. Volta a começar.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  pending.mode = 'materials_money';
  pendingSelections.set(interaction.user.id, pending);

  const modal = new ModalBuilder()
    .setCustomId('inv::modal_order_qty')
    .setTitle(`Encomendar ${pending.itemName}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(`Quantidade (preço: ${formatMoney(pending.pricing.finalPrice)}/un)`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setPlaceholder('Ex: 1')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel('Notas (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(300)
      )
    );

  await safeShowModal(interaction, modal);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL QUANTIDADE → adiciona ao carrinho
// ═══════════════════════════════════════════════════════════════════════════

async function handleOrderQtyModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pending = pendingSelections.get(interaction.user.id);
  if (!pending || !pending.mode) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Sessão expirada.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes') || '';
  const quantity = parseInt(quantityStr, 10);

  if (isNaN(quantity) || quantity <= 0 || quantity > SANITY_MAX_QTY) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Quantidade inválida.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      { content: 'Não estás registado.', flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  // Recalcula pricing para a quantidade escolhida
  const pricing = await calculateOrderPricing({
    itemId: pending.itemId,
    quantity,
    memberRole: member.role,
    memberTier: member.tier,
  });

  let cart = orderCart.getCart(interaction.user.id);
  if (!cart) cart = orderCart.createCart(interaction.user.id);

  orderCart.addLine(cart, {
    itemId: pending.itemId,
    itemName: pending.itemName,
    category: pending.category,
    quantity,
    mode: 'materials_money',
    unitPrice: pricing.unitPrice,
    finalPrice: pricing.finalPrice,
    ingredients: pricing.ingredients.map(i => ({ name: i.name, qty: i.qty })),
  });

  orderCart.saveCart(interaction.user.id, cart);
  pendingSelections.delete(interaction.user.id);

  // Volta ao carrinho
  const embed = orderCart.buildCartEmbed(cart, { memberName: member.display_name });
  const components = orderCart.buildCartComponents(cart);

  if (notes) {
    cart.globalNotes = (cart.globalNotes || '') + `\n${pending.itemName}: ${notes}`;
    orderCart.saveCart(interaction.user.id, cart);
  }

  return safeReply(interaction, { embeds: [embed], components }, { messageClass: 'COCKPIT' });
}

// ═══════════════════════════════════════════════════════════════════════════
// CARRINHO — remover / limpar / checkout
// ═══════════════════════════════════════════════════════════════════════════

async function handleOrderCartRemove(interaction) {
  if (isDuplicate(interaction.id)) return;
  const index = parseInt(interaction.values[0], 10);

  const cart = orderCart.getCart(interaction.user.id);
  if (!cart) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Carrinho expirado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  orderCart.removeLine(cart, index);
  orderCart.saveCart(interaction.user.id, cart);

  const member = await memberRepo.findByDiscordId(interaction.user.id).catch(() => null);
  const embed = orderCart.buildCartEmbed(cart, { memberName: member?.display_name });
  const components = orderCart.buildCartComponents(cart);
  return safeUpdate(interaction, { embeds: [embed], components });
}

async function handleOrderCartClear(interaction) {
  if (isDuplicate(interaction.id)) return;
  orderCart.clearCart(interaction.user.id);

  const cart = orderCart.createCart(interaction.user.id);
  const member = await memberRepo.findByDiscordId(interaction.user.id).catch(() => null);
  const embed = orderCart.buildCartEmbed(cart, { memberName: member?.display_name });
  const components = orderCart.buildCartComponents(cart);
  return safeUpdate(interaction, { embeds: [embed], components });
}

async function handleOrderCartBack(interaction) {
  if (isDuplicate(interaction.id)) return;

  const cart = orderCart.getCart(interaction.user.id);
  if (!cart) {
    return safeUpdate(
      interaction,
      { content: `${EMOJI.WARN} Carrinho expirado. Volta a clicar em Encomendar.` },
      { messageClass: 'BANAL' }
    );
  }

  const member = await memberRepo.findByDiscordId(interaction.user.id).catch(() => null);
  const embed = orderCart.buildCartEmbed(cart, { memberName: member?.display_name });
  const components = orderCart.buildCartComponents(cart);
  return safeUpdate(interaction, { embeds: [embed], components });
}

async function handleOrderCartCheckout(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cart = orderCart.getCart(interaction.user.id);
  if (!cart || !cart.lines.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Carrinho vazio.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      { content: 'Não estás registado.', flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const createdOrders = [];
  for (const line of cart.lines) {
    const order = await ordersRepo.create({
      memberId: member.id,
      itemId: line.itemId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      totalPrice: line.finalPrice,
      notes: cart.globalNotes || '',
      paymentMode: 'materials_money',
      materialCost: null,
      moneyCost: line.finalPrice,
    });
    createdOrders.push(order);
  }

  orderCart.clearCart(interaction.user.id);

  // Notifica chefia
  const eventBus = require('../core/eventBus');
  for (let i = 0; i < createdOrders.length; i++) {
    const order = createdOrders[i];
    const line = cart.lines[i];
    eventBus
      .emitAsync('order.created', {
        orderId: order.id,
        itemName: line.itemName,
        quantity: line.quantity,
        memberDiscordId: interaction.user.id,
        actorId: interaction.user.id,
        status: 'pending',
        paymentMode: line.mode,
        totalPrice: line.finalPrice,
        createdAt: order.created_at,
        at: new Date(),
      })
      .catch(() => {});
  }

  // Embed de sucesso
  const { totalPrice } = orderCart.totals({ lines: cart.lines });
  const lines = createdOrders.map((o, i) => `**#${o.id}** · ${cart.lines[i].quantity}× ${cart.lines[i].itemName}`);

  const embed = brandEmbed('HOUSE')
    .setTitle(`${EMOJI.OK} Encomendas Registadas`)
    .setColor(COLOR.SUCCESS)
    .setDescription(`${lines.join('\n')}\n\n**Total:** ${formatMoney(totalPrice)}\n\nA chefia será notificada.`);

  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
}

module.exports = {
  handleEncomendasButton,
  handleOrderCartAdd,
  handleOrderCategorySelect,
  handleOrderItemSelect,
  handleOrderModeSelect,
  handleOrderQtyModal,
  handleOrderCartRemove,
  handleOrderCartClear,
  handleOrderCartBack,
  handleOrderCartCheckout,
};
