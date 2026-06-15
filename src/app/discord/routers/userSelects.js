'use strict';
/**
 * User select router minimalista.
 * O bot core não usa UserSelect em runtime.
 */

const USER_SELECT_ROUTES = [];

async function handleUserSelect(interaction) {
  const id = interaction.customId;
  const route = USER_SELECT_ROUTES.find(r => r.match(id));
  if (!route) return;
  return route.handler(interaction);
}

module.exports = { handleUserSelect, USER_SELECT_ROUTES };
