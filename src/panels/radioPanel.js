'use strict';
/**
 * Painel de rádio — usado pelo bootstrap de painéis para publicar/editar
 * a mensagem fixa no RADIO_PANEL_CHANNEL_ID. Lê o estado actual via
 * radioRepo e delega o render a radioEngine.buildEmbed/buildComponents.
 *
 * Async porque precisa de fetch ao DB — panelBootstrap foi adaptado para
 * fazer `await build()`.
 */

const { radioRepo } = require('../repositories');
const { buildEmbed, buildComponents } = require('../radio/radioEngine');

async function buildRadioPanel() {
  const states = await radioRepo.getAllStates();
  return { embeds: [buildEmbed(states)], components: buildComponents() };
}

module.exports = { buildRadioPanel };
