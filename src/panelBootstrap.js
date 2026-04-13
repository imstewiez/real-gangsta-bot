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
  if (!channelId) {
    return { key: panelDef.key, status: 'skipped', reason: `${panelDef.channelKey} não configurado no .env` };
  }

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      warn(`[PANELS] Canal ${panelDef.channelKey} (${channelId}) não encontrado.`);
      return { key: panelDef.key, status: 'failed', reason: `canal ${channelId} não encontrado (bot sem acesso?)` };
    }

    const panelMessages = await getStateKey('panelMessages', {});
    const existingMessageId = panelMessages[panelDef.key];
    const payload = panelDef.build();

    if (existingMessageId) {
      try {
        const msg = await channel.messages.fetch(existingMessageId);
        await msg.edit(payload);
        log(`[PANELS] Painel '${panelDef.key}' atualizado (msg ${existingMessageId}).`);
        return { key: panelDef.key, status: 'edited', channelId, messageId: existingMessageId };
      } catch {
        // Message gone, will create new
      }
    }

    const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
    if (messages) {
      const botMessages = messages.filter(m => m.author.id === client.user.id);
      for (const [, msg] of botMessages) {
        await msg.delete().catch(() => {});
      }
    }

    const newMsg = await channel.send(payload);
    panelMessages[panelDef.key] = newMsg.id;
    await setStateKey('panelMessages', panelMessages);
    log(`[PANELS] Painel '${panelDef.key}' publicado (msg ${newMsg.id}).`);
    return { key: panelDef.key, status: 'created', channelId, messageId: newMsg.id };
  } catch (e) {
    warn(`[PANELS] Falha ao publicar '${panelDef.key}': ${e.message}`);
    return { key: panelDef.key, status: 'failed', reason: e.message };
  }
}

async function bootstrapAll(client) {
  log('[PANELS] A inicializar painéis...');
  const results = [];
  for (const panel of PANELS) {
    results.push(await bootstrapPanel(client, panel));
  }
  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  log(`[PANELS] Painéis inicializados — ${JSON.stringify(counts)}.`);
  return results;
}

module.exports = { bootstrapAll, bootstrapPanel, PANELS };
