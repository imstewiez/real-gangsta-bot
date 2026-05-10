'use strict';
/**
 * User select router — select menus do tipo UserSelect.
 * CustomId canónico `saida::*` — sem aliases legacy.
 */

const { handleParticipantUsersSelect } = require('../../../saidas/saidaHandlers');
const { handleDeliveryApproverSelect } = require('../../../inventory/handlers');

const prefix = (p, handler) => ({ match: x => x.startsWith(p), handler });

const USER_SELECT_ROUTES = [
  prefix('saida::user_select_participants::', handleParticipantUsersSelect),
  prefix('invdelivery::approver', handleDeliveryApproverSelect),
];

async function handleUserSelect(interaction) {
  const id = interaction.customId;
  const route = USER_SELECT_ROUTES.find(r => r.match(id));
  if (!route) return;
  return route.handler(interaction);
}

module.exports = { handleUserSelect, USER_SELECT_ROUTES };
