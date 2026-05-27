'use strict';
/**
 * Renderers built-in para os source_keys "de sistema":
 *   - availability:daily — embed da sessão activa do canal
 *   - radio:current      — painel actual da rádio
 *
 * Wireados em src/index.js durante o boot via registerSticky*.
 */

const { registerRenderer } = require('./stickyEngine');
const { radioRepo } = require('../repositories');

function registerBuiltinRenderers() {
  // ── radio:current ─────────────────────────────────────────────────────────
  registerRenderer('radio:current', async () => {
    const { buildEmbed, buildComponents } = require('../radio/radioEngine');
    const states = await radioRepo.getAllStates();
    return { embeds: [buildEmbed(states)], components: buildComponents() };
  });

  // ── Painéis (2 renderers) ─────────────────────────────────────────────────
  // Registados aqui para permitir que fiquem sticky (modo repost = sempre
  // visíveis no fundo do canal). panelBootstrap upserta sticky por painel
  // automaticamente se PANELS_STICKY_MODE != 'none'.
  registerRenderer('panel:entrada', async () => {
    const { buildEntradaPanel } = require('../panels/entradaPanel');
    return buildEntradaPanel();
  });
  registerRenderer('panel:radio', async () => {
    const { buildRadioPanel } = require('../panels/radioPanel');
    return buildRadioPanel();
  });
}

module.exports = { registerBuiltinRenderers };
