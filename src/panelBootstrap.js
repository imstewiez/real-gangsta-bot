'use strict';
const { ChannelType } = require('discord.js');
const CONFIG = require('./config');
const { getStateKey, setStateKey } = require('./state');
const { log, warn } = require('./logger');
const { buildBairristaPanel } = require('./panels/bairristaPanel');
const { buildOficialPanel } = require('./panels/oficialPanel');
const { buildChefiaPanel } = require('./panels/chefiaPanel');
const { buildPatraoDiZonaPanel } = require('./panels/patraoDiZonaPanel');
const { buildEntradaPanel } = require('./panels/entradaPanel');
const { CATEGORY_BY_KEY, bold } = require('./discord/structureTemplate');

// Auto-discover: se PANEL_*_CHANNEL_ID não estiver definido, procura o canal
// dedicado pelo nome canónico na categoria esperada. A função acepta uma lista
// de nomes (para incluir o antigo `painel-entrada` enquanto não é renomeado
// para `boas-vindas`).
function autoName(slug, emoji = '📋') { return `${emoji}・${bold(slug)}`; }

const PANELS = [
  { key: 'panel_entrada',         channelKey: 'PANEL_ENTRADA_CHANNEL_ID',         autoName: autoName('boas-vindas', '👋'),         autoAltNames: [autoName('painel-entrada')], autoCategoryKey: 'ENTRADA',  build: buildEntradaPanel,         stickySource: 'panel:entrada' },
  { key: 'panel_bairristas',      channelKey: 'PANEL_BAIRRISTAS_CHANNEL_ID',      autoName: autoName('painel-bairristas'),         autoAltNames: [autoName('painel-moradores')], autoCategoryKey: 'GUETTO',   build: buildBairristaPanel,       stickySource: 'panel:bairristas' },
  { key: 'panel_oficiais',        channelKey: 'PANEL_OFICIAIS_CHANNEL_ID',        autoName: autoName('painel-oficiais'),           autoCategoryKey: 'OFICIAIS', build: buildOficialPanel,         stickySource: 'panel:oficiais' },
  { key: 'panel_chefia',          channelKey: 'PANEL_CHEFIA_CHANNEL_ID',          autoName: autoName('painel-chefia'),             autoCategoryKey: 'COMANDO',  build: buildChefiaPanel,          stickySource: 'panel:chefia' },
  { key: 'panel_patrao_di_zona',  channelKey: 'PANEL_PATRAO_DI_ZONA_CHANNEL_ID',  autoName: autoName('painel-patrao-di-zona'),     autoAltNames: [autoName('painel-chefe-moradores')], autoCategoryKey: 'GUETTO',   build: buildPatraoDiZonaPanel,    stickySource: 'panel:patrao_di_zona' },
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
    if (r.status === 'created' || r.status === 'edited') {
      await upsertPanelSticky(panel, r.channelId);
    }
  }
  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  log(`[PANELS] Painéis inicializados — ${JSON.stringify(counts)}.`);

  // Backfill — garante que todos os canais individuais de morador têm o
  // painel morador (welcome + botões). Necessário para canais criados antes
  // de o painel existir, ou para canais onde a mensagem foi apagada.
  const backfill = await backfillResidentPanels(client);
  results.push({ key: 'backfill_resident_panels', status: 'info',
    channelId: null, reason: `${backfill.posted} posted, ${backfill.skipped} já OK, ${backfill.failed} falhas (total ${backfill.total})`,
  });
  log(`[PANELS] Backfill residentes — ${JSON.stringify(backfill)}.`);

  return results;
}

/**
 * Itera todos os canais de morador activos e posta o painel morador se
 * ainda não existir uma mensagem do bot com esse painel lá.
 *
 * Idempotente: não duplica se o painel já estiver no canal (detectado por
 * título do embed "Painel do Morador" ou "Bem-vindo ao bairro").
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

  let posted = 0, skipped = 0, failed = 0;
  for (const row of res.rows) {
    try {
      const ch = await client.channels.fetch(row.channel_id).catch(() => null);
      if (!ch || !ch.isTextBased?.()) { failed++; continue; }

      // Procura mensagem existente do bot que seja o painel
      const messages = await ch.messages.fetch({ limit: 30 }).catch(() => null);
      const existing = messages?.find(m =>
        m.author?.id === client.user.id &&
        m.components?.length &&
        m.components.some(row => row.components?.some(c => c.customId?.startsWith('morador::')))
      );
      if (existing) { skipped++; continue; }

      const name = row.full_name || row.display_name || row.nickname || 'bairrista';
      await ch.send({
        embeds: [welcomeChannelEmbed(name)],
        components: buildBairristaChannelPanel(),
      });
      posted++;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      failed++;
      warn(`[BACKFILL] ${row.channel_id}: ${e.message}`);
    }
  }

  return { total: res.rows.length, posted, skipped, failed };
}

module.exports = { bootstrapAll, bootstrapPanel, PANELS };
