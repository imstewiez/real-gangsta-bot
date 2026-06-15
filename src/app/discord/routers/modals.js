'use strict';

const { handleTagModal, handleDenyModalSubmit } = require('../../../onboarding/onboardingHandlers');
const { handleTropinhaModal } = require('../../../onboarding/tropinhaHandlers');

const exact = (id, handler) => ({ match: x => x === id, handler });
const prefix = (p, handler) => ({ match: x => x.startsWith(p), handler });

const MODAL_ROUTES = [
  exact('onboard::modal_tropinha', handleTropinhaModal),
  prefix('onboard::modal_tag', handleTagModal),
  prefix('onboard::modal_deny::', handleDenyModalSubmit),
];

async function handleModal(interaction) {
  const id = interaction.customId;
  const route = MODAL_ROUTES.find(r => r.match(id));
  if (!route) return;
  return route.handler(interaction);
}

module.exports = { handleModal, MODAL_ROUTES };
