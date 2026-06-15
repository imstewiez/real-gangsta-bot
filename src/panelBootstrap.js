'use strict';
const { ChannelType, Events } = require('discord.js');
const CONFIG = require('./config');
const { getStateKey, setStateKey } = require('./state');
const { log, warn } = require('./logger');
const { EMOJI } = require('./content');
const { buildEntradaPanel } = require('./panels/entradaPanel');
const { CATEGORY_BY_KEY, bold } = require('./discord/structureTemplate');

const { BottomPinEngine } = require('./messages/bottomPinEngine');
const { PanelSyncEngine } = require('./messages/panelSyncEngine');
const stickyEngine = require('./sticky/stickyEngine');

function autoName(slug, emoji = EMOJI.ENCOMENDA) {
  return `${emoji}・${bold(slug)}`;
}

const PANELS = [
  {
    key: 'panel_entrada',
    channelKey: 'PANEL_ENTRADA_CHANNEL_ID',
    autoName: autoName('boas-vindas', EMOJI.BEMVINDO),
    autoAltNames: [autoName('painel-entrada')],
    autoCategoryKey: 'ENTRADA',
    build: buildEntradaPanel,
    stickySource: 'panel:entrada',
  },
];

async function resolveChannelId(client, panelDef) {
  const explicit = CONFIG[panelDef.channelKey];
  if (explicit) return { channelId: explicit, source: 'env' };

  if (!panelDef.autoName || !panelDef.autoCategoryKey) return { channelId: null, source: null };

  const cat = CATEGORY_BY_KEY[panelDef.autoCategoryKey];
  if (!cat || !cat.id) return { channelId: null, source: null };

  const guild = client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) return { channelId: null, source: null };

  const acceptedNames = [panelDef.autoName, ...(panelDef.autoAltNames || [])];
  const slugs = acceptedNames.map(n => n.split('・')[1]).filter(Boolean);
  const found = guild.channels.cache.find(
    c =>
      c.type === ChannelType.GuildText &&
      c.parentId === cat.id &&
      (acceptedNames.includes(c.name) || slugs.some(s => c.name.includes(s)))
  );
  if (found) return { channelId: found.id, source: 'auto-discover' };

  return { channelId: null, source: null };
}

async function bootstrapPanel(client, panelDef, bottomPinEngine) {
  const { channelId, source } = await resolveChannelId(client, panelDef);
  if (!channelId) {
    return {
      key: panelDef.key,
      status: 'skipped',
      reason: `sem canal: ${panelDef.channelKey} vazio e auto-discover falhou`,
    };
  }

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      warn(`[PANELS] Canal ${panelDef.channelKey} (${channelId}) não encontrado.`);
      return { key: panelDef.key, status: 'failed', reason: `canal ${channelId} não encontrado` };
    }

    const panelMessages = await getStateKey('panelMessages', {});
    const existingId = panelMessages[panelDef.key];
    if (existingId) {
      try {
        const existing = await channel.messages.fetch(existingId);
        if (existing) {
          const payload = await panelDef.build();
          await existing.edit(payload);
          if (bottomPinEngine?._channelPins) {
            if (!bottomPinEngine._channelPins.has(channelId)) bottomPinEngine._channelPins.set(channelId, new Set());
            bottomPinEngine._channelPins.get(channelId).add(panelDef.stickySource);
          }
          log(`[PANELS] Painel '${panelDef.key}' actualizado (msg ${existingId}).`);
          return { key: panelDef.key, status: 'updated', channelId, messageId: existingId, source };
        }
      } catch (e) {
        if (e.code !== 10008) warn(`[PANELS] Falha ao editar '${panelDef.key}': ${e.message}`);
      }
    }

    if (!panelDef.stickySource || !bottomPinEngine) {
      const payload = await panelDef.build();
      const newMsg = await channel.send(payload);
      panelMessages[panelDef.key] = newMsg.id;
      await setStateKey('panelMessages', panelMessages);
      log(`[PANELS] Painel '${panelDef.key}' publicado (msg ${newMsg.id}, fonte ${source}).`);
      return { key: panelDef.key, status: 'created', channelId, messageId: newMsg.id, source };
    }

    const newMsg = await bottomPinEngine.registerPin(channelId, panelDef.stickySource, {});
    if (!newMsg) return { key: panelDef.key, status: 'failed', reason: 'registerPin devolveu null' };

    panelMessages[panelDef.key] = newMsg.id;
    await setStateKey('panelMessages', panelMessages);
    log(`[PANELS] Painel '${panelDef.key}' publicado (msg ${newMsg.id}, fonte ${source}).`);
    return { key: panelDef.key, status: 'created', channelId, messageId: newMsg.id, source };
  } catch (e) {
    warn(`[PANELS] Falha ao publicar '${panelDef.key}': ${e.message}`);
    return { key: panelDef.key, status: 'failed', reason: e.message };
  }
}

const PANELS_SCHEMA_VERSION = 16;

async function _maybeForceRebuild() {
  const stored = await getStateKey('panelsSchemaVersion', 0);
  if (stored < PANELS_SCHEMA_VERSION) {
    log(`[PANELS] Schema bump detectado (${stored} → ${PANELS_SCHEMA_VERSION}) — refresh.`);
    await setStateKey('panelsSchemaVersion', PANELS_SCHEMA_VERSION);
  }
}

async function bootstrapAll(client) {
  log('[PANELS] A inicializar painéis...');
  await _maybeForceRebuild();

  const bottomPinEngine = new BottomPinEngine({ client, renderers: stickyEngine.renderers });
  const panelSyncEngine = new PanelSyncEngine({ client });
  panelSyncEngine.useBottomPinEngine(bottomPinEngine);
  stickyEngine.setPanelSyncEngine(panelSyncEngine);

  client.on(Events.MessageCreate, async message => {
    try {
      await bottomPinEngine.onMessageCreate(message);
    } catch (e) {
      warn(`[BOTTOM_PIN] onMessageCreate erro: ${e.message}`);
    }
  });

  const results = [];
  for (const panel of PANELS) {
    const r = await bootstrapPanel(client, panel, bottomPinEngine);
    results.push(r);
  }
  const counts = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  log(`[PANELS] Painéis inicializados — ${JSON.stringify(counts)}.`);

  return results;
}

module.exports = { bootstrapAll, bootstrapPanel, PANELS };
