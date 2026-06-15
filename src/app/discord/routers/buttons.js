'use strict';
/**
 * Button router minimalista.
 * Runtime Discord limitado a onboarding e estado do pedido.
 */

const {
  handlePedirTagButton,
  handleApproveButton,
  handleDenyButton,
} = require('../../../onboarding/onboardingHandlers');
const { handleMeuPedido } = require('../../../onboarding/meuPedido');

const exact = (id, handler) => ({ match: x => x === id, handler });
const prefix = (p, handler) => ({ match: x => x.startsWith(p), handler });

const parseIdSafe = interaction => {
  const n = parseInt(interaction.customId.split('::')[2], 10);
  return Number.isNaN(n) ? null : n;
};

const approveHandler = interaction => {
  const id = parseIdSafe(interaction);
  if (id === null) return;
  return handleApproveButton(interaction, id);
};

const denyHandler = interaction => {
  const id = parseIdSafe(interaction);
  if (id === null) return;
  return handleDenyButton(interaction, id);
};

const BUTTON_ROUTES = [
  exact('onboard::pedir_tag', handlePedirTagButton),
  exact('onboard::meu_pedido', handleMeuPedido),
  prefix('onboard::approve::', approveHandler),
  prefix('onboard::deny::', denyHandler),
];

async function handleButton(interaction) {
  const id = interaction.customId;
  const route = BUTTON_ROUTES.find(r => r.match(id));
  if (!route) {
    const { warn } = require('../../logger');
    warn(`[Router:Button] Sem rota para customId: ${id}`);
    return;
  }
  return route.handler(interaction);
}

module.exports = { handleButton, BUTTON_ROUTES };
