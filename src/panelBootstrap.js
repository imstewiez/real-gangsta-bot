'use strict';
const { ChannelType } = require('discord.js');
const CONFIG = require('./config');
const { getStateKey, setStateKey } = require('./state');
const { log, warn } = require('./logger');
const { buildMoradorPanel } = require('./panels/moradorPanel');
const { buildOficialPanel } = require('./panels/oficialPanel');
const { buildChefiaPanel } = require('./panels/chefiaPanel');
const { buildChefeMoradoresPanel } = require('./panels/chefeMoradoresPanel');
const { buildEntradaPanel } = require('./panels/entradaPanel');
const { CATEGORY_BY_KEY, bold } = require('./discord/structureTemplate');

// Auto-discover: se PANEL_*_CHANNEL_ID não estiver definido, procura o canal
// dedicado pelo nome canónico na categoria esperada. A função acepta uma lista
// de nomes (para incluir o antigo `painel-entrada` enquanto não é renomeado
// para `boas-vindas`).
function autoName(slug, emoji = '📋') { return `${emoji}・${bold(slug)}`; }

const PANELS = [
  { key: 'panel_entrada',         channelKey: 'PANEL_ENTRADA_CHANNEL_ID',         autoName: autoName('boas-vindas', '👋'),         autoAltNames: [autoName('painel-entrada')], autoCategoryKey: 'ENTRADA',  build: buildEntradaPanel,         stickySource: 'panel:entrada' },
  { key: 'panel_moradores',       channelKey: 'PANEL_MORADORES_CHANNEL_ID',       autoName: autoName('painel-moradores'),          autoCategoryKey: 'GUETTO',   build: buildMoradorPanel,         stickySource: 'panel:moradores' },
  { key: 'panel_oficiais',        channelKey: 'PANEL_OFICIAIS_CHANNEL_ID',        autoName: autoName('painel-oficiais'),           autoCategoryKey: 'OFICIAIS', build: buildOficialPanel,         stickySource: 'panel:oficiais' },
  { key: 'panel_chefia',          channelKey: 'PANEL_CHEFIA_CHANNEL_ID',          autoName: autoName('painel-chefia'),             autoCategoryKey: 'COMANDO',  build: buildChefiaPanel,          stickySource: 'panel:chefia' },
  { key: 'panel_chefe_moradores', channelKey: 'PANEL_CHEFE_MORADORES_CHANNEL_ID', autoName: autoName('painel-chefe-moradores'),    autoCategoryKey: 'GUETTO',   build: buildChefeMoradoresPanel,  stickySource: 'panel:chefe_moradores' },
];

/**
 * Tenta resolver o channelId do painel:
 *   1) env var PANEL_*_CHANNEL_ID (prioridade)
 *   2) auto-discover: canal com nome canónico dentro da categoria esperada
 *   3) null → skip com razão informativa
 */
async function resolveChannelId(client, panelDef) {
  const explicit = CONFIG[panelDef.channelKey];
  if (explicit) return { channelId: explicit, source: 'env' };

  if (!panelDef.autoName || !panelDef.autoCategoryKey) return { channelId: null, source: null };

  const cat = CATEGORY_BY_KEY[panelDef.autoCategoryKey];
  if (!cat || !cat.id) return { channelId: null, source: null };

  const guild = client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) return { channelId: null, source: null };

  // Lista de nomes aceitáveis: canónico + alternativos (para acomodar nomes
  // antigos antes do rename, e.g. painel-entrada → boas-vindas).
  const acceptedNames = [panelDef.autoName, ...(panelDef.autoAltNames || [])];
  const slugs = acceptedNames.map(n => n.split('・')[1]).filter(Boolean);
  const found = guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText &&
    c.parentId === cat.id &&
    (acceptedNames.includes(c.name) || slugs.some(s => c.name.includes(s)))
  );
  if (found) return { channelId: found.id, source: 'auto-discover' };

  return { channelId: null, source: null };
}

async function bootstrapPanel(client, panelDef) {
  const { channelId, source } = await resolveChannelId(client, panelDef);
  if (!channelId) {
    return {
      key: panelDef.key,
      status: 'skipped',
      reason: `sem canal: ${panelDef.channelKey} vazio e auto-discover de '${panelDef.autoName}' em ${panelDef.autoCategoryKey} falhou — corre /rg-sync-structure modo:apply primeiro`,
    };
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
        log(`[PANELS] Painel '${panelDef.key}' atualizado (msg ${existingMessageId}, fonte ${source}).`);
        return { key: panelDef.key, status: 'edited', channelId, messageId: existingMessageId, source };
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
    log(`[PANELS] Painel '${panelDef.key}' publicado (msg ${newMsg.id}, fonte ${source}).`);
    return { key: panelDef.key, status: 'created', channelId, messageId: newMsg.id, source };
  } catch (e) {
    warn(`[PANELS] Falha ao publicar '${panelDef.key}': ${e.message}`);
    return { key: panelDef.key, status: 'failed', reason: e.message };
  }
}

/**
 * Se PANELS_STICKY_MODE != 'none', regista o painel como sticky activo —
 * sempre que houver X mensagens novas no canal, o sticky engine republica
 * o painel no fundo. Fire-and-forget; não bloqueia o bootstrap.
 */
async function upsertPanelSticky(panelDef, channelId, actorId = 'system:panel-bootstrap') {
  const mode = (CONFIG.PANELS_STICKY_MODE || 'repost').toLowerCase();
  if (mode === 'none') return null;
  if (!['repost', 'update'].includes(mode)) {
    warn(`[PANELS] PANELS_STICKY_MODE inválido: '${mode}' — a ignorar sticky.`);
    return null;
  }
  if (!panelDef.stickySource) return null;

  try {
    const { setSticky } = require('./sticky/stickyEngine');
    await setSticky({
      channelId,
      sourceKey: panelDef.stickySource,
      mode,
      payload: {},
      thresholdMsgs: CONFIG.PANELS_STICKY_THRESHOLD_MSGS || 5,
      thresholdMinutes: 0,
      createdBy: actorId,
    });
    log(`[PANELS] Sticky activa para '${panelDef.stickySource}' em ${channelId} (${mode}, thr=${CONFIG.PANELS_STICKY_THRESHOLD_MSGS}).`);
  } catch (e) {
    warn(`[PANELS] Falha a registar sticky de '${panelDef.key}': ${e.message}`);
  }
}

async function bootstrapAll(client) {
  log('[PANELS] A inicializar painéis...');
  const results = [];
  for (const panel of PANELS) {
    const r = await bootstrapPanel(client, panel);
    results.push(r);
    // Se painel foi publicado/editado com sucesso, regista sticky automática.
    if (r.status === 'created' || r.status === 'edited') {
      await upsertPanelSticky(panel, r.channelId);
    }
  }
  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  log(`[PANELS] Painéis inicializados — ${JSON.stringify(counts)}.`);
  return results;
}

module.exports = { bootstrapAll, bootstrapPanel, PANELS };
