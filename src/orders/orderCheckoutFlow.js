'use strict';
/**
 * orderCheckoutFlow — confirmação + checkout atómico.
 *
 * Antes: clicar "Finalizar" criava imediatamente as orders.
 * Agora: 2 passos — preview de confirmação → execução atómica.
 *
 * A carrinho só é limpo DEPOIS de todas as orders serem criadas com sucesso.
 */

const { MessageFlags } = require('discord.js');
const { safeReply, safeUpdate } = require('../shared/interactionHelpers');
const { EMOJI } = require('../content');
const orderCart = require('./orderCart');
const {
  buildCheckoutConfirmationEmbed,
  buildCheckoutConfirmationComponents,
  buildCheckoutSuccessEmbed,
} = require('./orderPreviewEmbedBuilder');
const { OrderService } = require('./orderService');

// Instância partilhada do serviço
const orderService = new OrderService();

// ═══════════════════════════════════════════════════════════════════════════
// PASSO 1 — Mostrar ecrã de confirmação
// ═══════════════════════════════════════════════════════════════════════════

async function showConfirmation(interaction) {
  const cart = orderCart.getCart(interaction.user.id);
  if (!cart || !cart.lines.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Carrinho vazio.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const member = await require('../repositories')
    .memberRepo.findByDiscordId(interaction.user.id)
    .catch(() => null);
  const embed = buildCheckoutConfirmationEmbed(cart, { memberName: member?.display_name });
  const components = buildCheckoutConfirmationComponents();

  return safeUpdate(interaction, { embeds: [embed], components }, { messageClass: 'FLOW' });
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSO 2 — Executar checkout atómico
// ═══════════════════════════════════════════════════════════════════════════

async function executeCheckout(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cart = orderCart.getCart(interaction.user.id);
  if (!cart || !cart.lines.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Carrinho vazio.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const member = await require('../repositories').memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      { content: 'Não estás registado no sistema.', flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  // Guarda as linhas antes de limpar (precaução)
  const cartLinesSnapshot = cart.lines.map(l => ({
    ...l,
    ingredients: l.ingredients ? l.ingredients.map(i => ({ ...i })) : [],
  }));

  try {
    const createdOrders = await orderService.checkout({
      discordId: interaction.user.id,
      memberId: member.id,
      notes: cart.globalNotes || '',
    });

    // Só limpa o carrinho após sucesso confirmado
    orderCart.clearCart(interaction.user.id);

    // Notifica chefia via eventBus
    const eventBus = require('../core/eventBus');
    for (let i = 0; i < createdOrders.length; i++) {
      const order = createdOrders[i];
      const line = cartLinesSnapshot[i];
      eventBus
        .emitAsync('order.created', {
          orderId: order.id,
          itemName: line.itemName,
          quantity: line.quantity,
          memberDiscordId: interaction.user.id,
          actorId: interaction.user.id,
          status: 'pending',
          paymentMode: line.mode || 'materials_money',
          totalPrice: line.finalPrice,
          createdAt: order.created_at,
          at: new Date(),
        })
        .catch(() => {});
    }

    const embed = buildCheckoutSuccessEmbed(
      createdOrders,
      { lines: cartLinesSnapshot },
      { memberName: member.display_name }
    );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  } catch (e) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Erro ao finalizar encomenda: ${e.message}`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
}

module.exports = {
  showConfirmation,
  executeCheckout,
};
