'use strict';
/**
 * String select router minimalista.
 * Sem rotas legacy de stock, materiais, saídas, encomendas, rádio ou rankings.
 */

const SELECT_ROUTES = [];

async function handleSelect(interaction) {
  const id = interaction.customId;
  const route = SELECT_ROUTES.find(r => r.match(id));
  if (!route) {
    const { warn } = require('../../logger');
    warn(`[Router:Select] Sem rota para customId: ${id}`);
    return;
  }
  return route.handler(interaction);
}

module.exports = { handleSelect, SELECT_ROUTES };
