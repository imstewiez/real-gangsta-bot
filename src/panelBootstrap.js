'use strict';
const CONFIG = require('./config');
const { getStateKey, setStateKey } = require('./state');
const { log, warn } = require('./logger');
const { buildMoradorPanel } = require('./panels/moradorPanel');
const { buildOficialPanel } = require('./panels/oficialPanel');
const { buildChefiaPanel } = require('./panels/chefiaPanel');
const { buildChefeMoradoresPanel } = require('./panels/chefeMoradoresPanel');
const { buildEntradaPanel } = require('./panels/entradaPanel');

const PANELS = [
  { key: 'panel_entrada', channelKey: 'PANEL_ENTRADA_CHANNEL_ID', build: buildEntradaPanel },
  { key: 'panel_moradores', channelKey: 'PANEL_MORADORES_CHANNEL_ID', build: buildMoradorPanel },
  { key: 'panel_oficiais', channelKey: 'PANEL_OFICIAIS_CHANNEL_ID', build: buildOficialPanel },
  { key: 'panel_chefia', channelKey: 'PANEL_CHEFIA_CHANNEL_ID', build: buildChefiaPanel },
  { key: 'panel_chefe_moradores', channelKey: 'PANEL_CHEFE_MORADORES_CHANNEL_ID', build: buildChefeMoradoresPanel },
];

async function bootstrapPanel(client, panelDef) {
  const channelId = CONFIG[panelDef.channelKey];
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      warn(`[PANELS] Canal ${panelDef.channelKey} não encontrado.`);
      return;
    }

    const panelMessages = await getStateKey('panelMessages', {});
    const existingMessageId = panelMessages[panelDef.key];
    const payload = panelDef.build();

    if (existingMessageId) {
      try {
        const msg = await channel.messages.fetch(existingMessageId);
        await msg.edit(payload);
        log(`[PANELS] Painel '${panelDef.key}' atualizado.`);
        return;
      } catch {
        // Message gone, will create new
      }
    }

    const messages = await channel.messages.fetch({ limit: 10 });
    const botMessages = messages.filter(m => m.author.id === client.user.id);
    for (const [, msg] of botMessages) {
      await msg.delete().catch(() => {});
    }

    const newMsg = await channel.send(payload);
    panelMessages[panelDef.key] = newMsg.id;
    await setStateKey('panelMessages', panelMessages);
    log(`[PANELS] Painel '${panelDef.key}' publicado.`);
  } catch (e) {
    warn(`[PANELS] Falha ao publicar '${panelDef.key}': ${e.message}`);
  }
}

async function bootstrapAll(client) {
  log('[PANELS] A inicializar painéis...');
  for (const panel of PANELS) {
    await bootstrapPanel(client, panel);
  }
  log('[PANELS] Painéis inicializados.');
}

module.exports = { bootstrapAll, bootstrapPanel, PANELS };
