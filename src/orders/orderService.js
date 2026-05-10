'use strict';
/**
 * OrderService — lógica de negócio central das encomendas.
 *
 * Responsabilidades:
 *   - Validação prévia (pode encomendar?)
 *   - Preview de item com preços
 *   - Adicionar ao carrinho
 *   - Checkout atómico (transacção DB)
 *   - Cancelamento próprio
 *   - Listagem de encomendas do membro
 *
 * Checkout atómico: todas as orders são inseridas numa transacção;
 * só depois de COMMIT é que o carrinho é limpo.
 */

const { queryWithTransaction } = require('../db');
const { ordersRepo } = require('../repositories');
const { memberRepo } = require('../repositories');
const { inventoryRepo } = require('../repositories');
const { calculateOrderPricing } = require('./orderPricingEngine');
const orderCart = require('./orderCart');
const { NotFoundError } = require('../shared/errors');

class OrderService {
  /**
   * Verifica se um membro pode realizar encomendas.
   */
  async validateCanOrder(discordId) {
    const member = await memberRepo.findByDiscordId(discordId);
    if (!member) throw new NotFoundError('Membro não encontrado.', { code: 'MEMBER_NOT_FOUND' });
    // Futuro: verificar se está suspenso, em débito, etc.
    return member;
  }

  /**
   * Devolve preview rico de um item (preço + materiais).
   */
  async previewItem({ itemId, quantity = 1, memberRole, memberTier }) {
    const item = await inventoryRepo.getItemById(itemId);
    if (!item) throw new NotFoundError('Item não encontrado.', { code: 'ITEM_NOT_FOUND' });

    const pricing = await calculateOrderPricing({ itemId, quantity, memberRole, memberTier });
    return { item, pricing };
  }

  /**
   * Adiciona uma linha ao carrinho do utilizador.
   * Cria o carrinho se não existir.
   */
  async addToCart({ discordId, itemId, itemName, category, quantity, unitPrice, finalPrice, ingredients }) {
    let cart = orderCart.getCart(discordId);
    if (!cart) cart = orderCart.createCart(discordId);

    orderCart.addLine(cart, {
      itemId,
      itemName,
      category,
      quantity,
      unitPrice,
      finalPrice,
      ingredients: ingredients ? ingredients.map(i => ({ name: i.name, qty: i.qty })) : [],
    });

    orderCart.saveCart(discordId, cart);
    return cart;
  }

  /**
   * Checkout atómico.
   * Insere todas as orders numa transacção; só limpa o carrinho após sucesso.
   *
   * @param {Object} opts
   * @param {string} opts.discordId
   * @param {number} opts.memberId
   * @param {string} [opts.notes]
   * @returns {Promise<Array>} createdOrders
   */
  async checkout({ discordId, memberId, notes = '' }) {
    const cart = orderCart.getCart(discordId);
    if (!cart || !cart.lines.length) {
      throw new Error('Carrinho vazio.');
    }

    const createdOrders = await queryWithTransaction(async client => {
      const results = [];
      for (const line of cart.lines) {
        const res = await client.query(
          `INSERT INTO orders (
            member_id, item_id, quantity, unit_price, total_price,
            status, notes, payment_mode, material_cost, money_cost, ingredients_json
          ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10)
          RETURNING *`,
          [
            memberId,
            line.itemId,
            line.quantity,
            line.unitPrice,
            line.finalPrice,
            notes,
            line.mode || 'materials_money',
            null,
            line.finalPrice,
            line.ingredients ? JSON.stringify(line.ingredients) : null,
          ]
        );
        results.push(res.rows[0]);
      }
      return results;
    });

    // Só limpa depois do COMMIT garantido
    orderCart.clearCart(discordId);
    return createdOrders;
  }

  /**
   * Cancela uma encomenda se pertencer ao membro e estiver pendente.
   */
  async cancelOrder({ orderId, memberId, actorDiscordId }) {
    const order = await ordersRepo.findById(orderId);
    if (!order || order.member_id !== memberId) {
      throw new NotFoundError('Encomenda não encontrada.', { code: 'ORDER_NOT_FOUND' });
    }
    if (order.status !== 'pending') {
      throw new Error('Só encomendas pendentes podem ser canceladas.');
    }

    return ordersRepo.updateStatus(orderId, {
      status: 'cancelled',
      actorDiscordId,
      notes: 'Cancelada pelo bairrista',
    });
  }

  /**
   * Lista as encomendas de um membro.
   */
  async getMemberOrders(memberId, { limit = 20, status = null } = {}) {
    return ordersRepo.findByMember(memberId, { limit, status });
  }
}

module.exports = {
  OrderService,
};
