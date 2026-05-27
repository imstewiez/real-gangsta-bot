'use strict';
const { ChannelType, Events } = require('discord.js');
const CONFIG = require('./config');
const { getStateKey, setStateKey } = require('./state');
const { log, warn } = require('./logger');
const { EMOJI } = require('./content');
const { buildEntradaPanel } = require('./panels/entradaPanel');
const { buildRadioPanel } = require('./panels/radioPanel');
const { CATEGORY_BY_KEY, bold } = require('./discord/structureTemplate');

const { BottomPinEngine } = require('./messages/bottomPinEngine');
const { PanelSyncEngine } = require('./messages/panelSyncEngine');
const stickyEngine = require('./sticky/stickyEngine');

// Auto-discover: se PANEL_*_CHANNEL_ID não estiver definido, procura o canal
// dedicado pelo nome canónico na categoria esperada. A função acepta uma lista
// de nomes (para incluir o antigo `painel-entrada` enquanto não é renomeado
// para `boas-vindas`).
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
  {
    key: 'panel_radio',
    channelKey: 'RADIO_PANEL_CHANNEL_ID',
    build: buildRadioPanel, // async — lê estado actual do radioRepo
    stickySource: 'panel:radio',
  },
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
      reason: `sem canal: ${panelDef.channelKey} vazio e auto-discover de '${panelDef.autoName}' em ${panelDef.autoCategoryKey} falhou — corre /rg-sync-structure modo:apply primeiro`,
    };
  }

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      warn(`[PANELS] Canal ${panelDef.channelKey} (${channelId}) não encontrado.`);
      return { key: panelDef.key, status: 'failed', reason: `canal ${channelId} não encontrado (bot sem acesso?)` };
    }

    // Apaga TODAS as mensagens do bot no canal para garantir rebuild limpo.
    // Nunca editamos — sempre criamos mensagens novas. Assim cada deploy
    // mostra os painéis actualizados sem depender de state ou schema version.
    let deletedCount = 0;
    let failedCount = 0;
    let lastId = null;
    let more = true;
    while (more) {
      const opts = lastId ? { limit: 100, before: lastId } : { limit: 100 };
      const batch = await channel.messages.fetch(opts).catch(() => null);
      if (!batch || batch.size === 0) {
        more = false;
        break;
      }
      const botMsgs = [...batch.values()].filter(m => m.author.id === client.user.id);
      for (const msg of botMsgs) {
        try {
          await msg.delete();
          deletedCount++;
        } catch {
          failedCount++;
        }
        await new Promise(r => setTimeout(r, 350));
      }
      lastId = batch.last()?.id;
      if (batch.size < 100) more = false;
    }
    if (deletedCount > 0 || failedCount > 0) {
      log(`[PANELS] ${deletedCount} mensagem(ns) apagada(s), ${failedCount} falha(s) em #${channel.name}.`);
    }

    // Fallback para painéis sem stickySource (não deve acontecer)
    if (!panelDef.stickySource || !bottomPinEngine) {
      const payload = await panelDef.build();
      const newMsg = await channel.send(payload);
      const panelMessages = await getStateKey('panelMessages', {});
      panelMessages[panelDef.key] = newMsg.id;
      await setStateKey('panelMessages', panelMessages);
      log(`[PANELS] Painel '${panelDef.key}' publicado (msg ${newMsg.id}, fonte ${source}).`);
      return { key: panelDef.key, status: 'created', channelId, messageId: newMsg.id, source };
    }

    const newMsg = await bottomPinEngine.registerPin(channelId, panelDef.stickySource, {});
    if (!newMsg) {
      return { key: panelDef.key, status: 'failed', reason: 'registerPin devolveu null' };
    }

    const panelMessages = await getStateKey('panelMessages', {});
    panelMessages[panelDef.key] = newMsg.id;
    await setStateKey('panelMessages', panelMessages);
    log(`[PANELS] Painel '${panelDef.key}' publicado (msg ${newMsg.id}, fonte ${source}).`);
    return { key: panelDef.key, status: 'created', channelId, messageId: newMsg.id, source };
  } catch (e) {
    warn(`[PANELS] Falha ao publicar '${panelDef.key}': ${e.message}`);
    return { key: panelDef.key, status: 'failed', reason: e.message };
  }
}

// Versão do schema dos painéis. Bumpar isto força rebuild integral de
// todos os painéis no próximo boot (apaga mensagens antigas, publica
// frescas). Usar quando:
//   - nomes de canais mudam
//   - copy ou emojis são reformulados significativamente
//   - botões são renomeados/reorganizados
// O estado anterior (panelMessages) é limpo e todos os painéis voltam
// a seguir o caminho "sem mensagem existente" → delete old + create new.
const PANELS_SCHEMA_VERSION = 15;

async function _maybeForceRebuild() {
  const stored = await getStateKey('panelsSchemaVersion', 0);
  if (stored < PANELS_SCHEMA_VERSION) {
    log(`[PANELS] Schema bump detectado (${stored} → ${PANELS_SCHEMA_VERSION}) — force rebuild.`);
    await setStateKey('panelMessages', {});
    await setStateKey('panelsSchemaVersion', PANELS_SCHEMA_VERSION);
  }
}

async function bootstrapAll(client) {
  log('[PANELS] A inicializar painéis...');
  await _maybeForceRebuild();

  // Instancia os novos engines de gestão centralizada de mensagens
  const bottomPinEngine = new BottomPinEngine({ client, renderers: stickyEngine.renderers });
  const panelSyncEngine = new PanelSyncEngine({ client });
  panelSyncEngine.useBottomPinEngine(bottomPinEngine);
  stickyEngine.setPanelSyncEngine(panelSyncEngine);

  // Listener de bump para painéis geridos pelo BottomPinEngine
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

  // Backfill — garante que todos os canais individuais de bairrista têm o
  // painel bairrista (welcome + botões). Necessário para canais criados
  // antes de o painel existir, ou para canais onde a mensagem foi apagada.
  const backfill = await backfillResidentPanels(client);
  results.push({
    key: 'backfill_resident_panels',
    status: 'info',
    channelId: null,
    reason: `${backfill.posted} posted, ${backfill.skipped} já OK, ${backfill.failed} falhas (total ${backfill.total})`,
  });
  log(`[PANELS] Backfill residentes — ${JSON.stringify(backfill)}.`);

  return results;
}

/**
 * Itera todos os canais de bairrista activos e posta o painel bairrista
 * se ainda não existir uma mensagem do bot com esse painel lá.
 *
 * Idempotente: não duplica se o painel já estiver no canal (detectado por
 * título do embed "Painel do Bairrista" ou "Bem-vindo ao bairro").
 */
async function backfillResidentPanels(client) {
  const { query } = require('./db');
  const { buildBairristaChannelPanel } = require('./onboarding/onboardingHandlers');
  const { welcomeChannelEmbed } = require('./shared/embedBuilders');

  const res = await query(
    `SELECT rc.channel_id, m.full_name, m.display_name, m.nickname
       FROM resident_channels rc
       JOIN members m ON m.id = rc.member_id
      WHERE rc.status = 'active'`
  );

  // Detecção robusta do painel — o painel pode ter sido postado no primeiro
  // dia de vida do canal, há centenas de mensagens atrás. fetch({limit:30})
  // apanha apenas as mais recentes e falha. Aqui combina:
  //   (a) últimas 30 mensagens (caso o painel tenha sido reposted)
  //   (b) 100 mais antigas via after:'0' (canto oposto — habitual de painel)
  async function _findBairristaPanel(ch, botId) {
    const matches = m =>
      m.author?.id === botId &&
      m.components?.length &&
      m.components.some(row => row.components?.some(c => c.customId?.startsWith('bairrista::')));
    const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null);
    if (recent) {
      const found = [...recent.values()].find(matches);
      if (found) return found;
    }
    const oldest = await ch.messages.fetch({ limit: 100, after: '0' }).catch(() => null);
    if (oldest) {
      const found = [...oldest.values()].find(matches);
      if (found) return found;
    }
    return null;
  }

  let posted = 0,
    skipped = 0,
    failed = 0;
  for (const row of res.rows) {
    try {
      const ch = await client.channels.fetch(row.channel_id).catch(() => null);
      if (!ch || !ch.isTextBased?.()) {
        failed++;
        continue;
      }

      const existingPanel = await _findBairristaPanel(ch, client.user.id);
      if (existingPanel) {
        // Garante que painéis existentes (mesmo antigos) ficam pinned.
        if (!existingPanel.pinned) {
          await existingPanel.pin().catch(() => {});
        }
        skipped++;
        continue;
      }

      const name = row.full_name || row.display_name || row.nickname || 'bairrista';
      const panelMsg = await ch.send({
        embeds: [welcomeChannelEmbed(name)],
        components: buildBairristaChannelPanel(),
      });
      await panelMsg.pin().catch(() => {});
      posted++;
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {
      failed++;
      warn(`[BACKFILL] ${row.channel_id}: ${e.message}`);
    }
  }

  return { total: res.rows.length, posted, skipped, failed };
}

module.exports = { bootstrapAll, bootstrapPanel, PANELS };
