'use strict';
/**
 * Renderers built-in para os source_keys "de sistema":
 *   - availability:daily — embed da sessão activa do canal
 *   - radio:current      — painel actual da rádio
 *
 * Wireados em src/index.js durante o boot via registerSticky*.
 */

const { registerRenderer } = require('./stickyEngine');
const { availabilityRepo, radioRepo } = require('../repositories');

function registerBuiltinRenderers() {
  // ── availability:daily ────────────────────────────────────────────────────
  // Renderiza a sessão aberta para hoje neste canal. Se não houver, devolve
  // mensagem informativa (sem componentes).
  registerRenderer('availability:daily', async (client, params) => {
    const { buildEmbed, buildComponents, todayDateString } = require('../availability/availabilityEngine');

    const channelId = params?.channelId;
    if (!channelId) return { content: '_(sticky availability:daily sem channelId em params)_' };

    const session = await availabilityRepo.getOpenSession(channelId, todayDateString());
    if (!session) {
      return { content: '_Sem sessão de disponibilidade aberta para hoje._' };
    }
    const slots = await availabilityRepo.getSlots(session.id);
    const tallies = await availabilityRepo.getTallies(session.id);
    const total = await availabilityRepo.getDistinctVoterCount(session.id);
    return {
      embeds: [buildEmbed(session, tallies, total)],
      components: buildComponents(session, slots),
    };
  });

  // ── radio:current ─────────────────────────────────────────────────────────
  registerRenderer('radio:current', async () => {
    const { buildEmbed, buildComponents } = require('../radio/radioEngine');
    const states = await radioRepo.getAllStates();
    return { embeds: [buildEmbed(states)], components: buildComponents() };
  });

  // ── Painéis (5 renderers) ─────────────────────────────────────────────────
  // Registados aqui para permitir que fiquem sticky (modo repost = sempre
  // visíveis no fundo do canal). panelBootstrap upserta sticky por painel
  // automaticamente se PANELS_STICKY_MODE != 'none'.
  registerRenderer('panel:entrada', async () => {
    const { buildEntradaPanel } = require('../panels/entradaPanel');
    return buildEntradaPanel();
  });
  registerRenderer('panel:bairristas', async () => {
    const { buildBairristaPanel } = require('../panels/bairristaPanel');
    return buildBairristaPanel();
  });
  registerRenderer('panel:oficiais', async () => {
    const { buildOficialPanel } = require('../panels/oficialPanel');
    return buildOficialPanel();
  });
  registerRenderer('panel:chefia', async () => {
    const { buildChefiaPanel } = require('../panels/chefiaPanel');
    return buildChefiaPanel();
  });
  registerRenderer('panel:patrao_di_zona', async () => {
    const { buildPatraoDiZonaPanel } = require('../panels/patraoDiZonaPanel');
    return buildPatraoDiZonaPanel();
  });
  registerRenderer('panel:radio', async () => {
    const { buildRadioPanel } = require('../panels/radioPanel');
    return buildRadioPanel();
  });
}

module.exports = { registerBuiltinRenderers };
