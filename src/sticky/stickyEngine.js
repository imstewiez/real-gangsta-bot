'use strict';
/**
 * Sticky messages — mantêm uma mensagem do bot sempre visível num canal.
 *
 * ⚠️ DEPRECAÇÃO: este módulo está em transição para BottomPinEngine +
 * PanelSyncEngine. Os métodos públicos continuam a funcionar mas emitem
 * warnings. Novo código deve usar os engines em src/messages/.
 *
 * Modos suportados:
 *   - `update`  : edita sempre a mesma mensagem (ID fixo). Útil para
 *                 painéis de estado (rádio, disponibilidade) onde só
 *                 muda o conteúdo.
 *   - `repost`  : republica a mensagem no fundo do canal quando passa
 *                 X mensagens novas (threshold_msgs) ou Y minutos
 *                 (threshold_minutes). A anterior é apagada (best-effort).
 *
 * Renderers: cada source_key pode registar uma função render(client, params)
 * que devolve {content, embeds, components}. Permite stickys dinâmicos
 * (e.g. availability:daily renderiza o estado da sessão actual).
 * Se não houver renderer registado, o payload guardado em DB é usado tal
 * como está (modo estático).
 */

const { logAudit } = require('../audit/auditEngine');
const { stickyRepo } = require('../repositories');
const { log, warn } = require('../logger');

const renderers = new Map();
let _panelSyncEngine = null;
const _deprecationWarned = new Set();

function _deprecate(fnName) {
  if (_deprecationWarned.has(fnName)) return;
  _deprecationWarned.add(fnName);
  warn(`[STICKY] ${fnName}() está deprecado; migra para BottomPinEngine / PanelSyncEngine.`);
}

function setPanelSyncEngine(engine) {
  _panelSyncEngine = engine;
}

function registerRenderer(sourceKey, fn) {
  _deprecate('registerRenderer');
  if (typeof fn !== 'function') throw new Error('renderer tem de ser função');
  renderers.set(sourceKey, fn);
  log(`[STICKY] Renderer registado: ${sourceKey}`);
}

function listRenderers() {
  _deprecate('listRenderers');
  return [...renderers.keys()];
}

async function renderPayload(client, sticky) {
  _deprecate('renderPayload');
  const renderer = renderers.get(sticky.source_key);
  if (renderer) return renderer(client, sticky.payload || {});
  return sticky.payload || {}; // estático
}

async function postFresh(client, sticky) {
  _deprecate('postFresh');
  const channel = await client.channels.fetch(sticky.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased?.()) {
    warn(`[STICKY] Canal ${sticky.channel_id} indisponível para sticky ${sticky.source_key}.`);
    return null;
  }

  const payload = await renderPayload(client, sticky);

  // Apaga a mensagem anterior (best-effort) — só em modo repost.
  if (sticky.last_message_id && sticky.mode === 'repost') {
    try {
      const prev = await channel.messages.fetch(sticky.last_message_id).catch(() => null);
      if (prev) await prev.delete().catch(() => {});
    } catch (_) {
      /* ignore */
    }
  }

  const message = await channel.send({
    content: payload.content,
    embeds: payload.embeds || [],
    components: payload.components || [],
    allowedMentions: payload.allowedMentions || { parse: [] },
  });
  await stickyRepo.setLastMessage(sticky.id, message.id);
  return message;
}

async function refreshUpdate(client, sticky) {
  _deprecate('refreshUpdate');
  if (!sticky.last_message_id) {
    // Primeira vez — publica.
    return postFresh(client, sticky);
  }
  const channel = await client.channels.fetch(sticky.channel_id).catch(() => null);
  if (!channel) return null;
  const message = await channel.messages.fetch(sticky.last_message_id).catch(() => null);
  if (!message) return postFresh(client, sticky); // mensagem sumiu, recria

  const payload = await renderPayload(client, sticky);
  try {
    await message.edit({
      content: payload.content,
      embeds: payload.embeds || [],
      components: payload.components || [],
    });
  } catch (e) {
    if (e.code === 10008) {
      // Unknown Message — recria
      warn(`[STICKY] Mensagem desconhecida (10008) em ${sticky.source_key}, a recriar.`);
      await logAudit({
        action: 'STICKY_RECREATED',
        entityType: 'sticky',
        entityId: String(sticky.id),
        actorId: 'system',
        context: `Unknown message (10008) in ${sticky.source_key}`,
      });
      return postFresh(client, sticky);
    }
    throw e;
  }
  return message;
}

async function refresh(client, sticky) {
  _deprecate('refresh');
  if (!sticky.active) return null;
  if (sticky.mode === 'update') return refreshUpdate(client, sticky);
  return postFresh(client, sticky);
}

/**
 * Cria/atualiza uma definição de sticky. Não publica imediatamente — o
 * caller deve chamar refresh() depois se quiser.
 */
async function setSticky({ channelId, sourceKey, mode, payload, thresholdMsgs, thresholdMinutes, createdBy }) {
  _deprecate('setSticky');
  const validModes = new Set(['update', 'repost']);
  if (!validModes.has(mode)) throw new Error(`Modo inválido: ${mode} (usa update|repost)`);

  const sticky = await stickyRepo.upsert({
    channelId,
    sourceKey,
    mode,
    payload: payload || {},
    thresholdMsgs: thresholdMsgs || 0,
    thresholdMinutes: thresholdMinutes || 0,
    createdBy,
  });
  await logAudit({
    action: 'sticky_set',
    entityType: 'sticky',
    entityId: String(sticky.id),
    actorId: createdBy,
    afterState: { channelId, sourceKey, mode, thresholdMsgs, thresholdMinutes },
  });
  log(
    `[STICKY] Set ${sourceKey} em ${channelId} (${mode}, t_msgs=${thresholdMsgs || 0}, t_min=${thresholdMinutes || 0}).`
  );
  return sticky;
}

async function removeSticky({ channelId, sourceKey, actorId }) {
  _deprecate('removeSticky');
  const sticky = await stickyRepo.getByChannelSource(channelId, sourceKey);
  if (!sticky) return null;
  await stickyRepo.deactivate(sticky.id);
  await logAudit({
    action: 'sticky_removed',
    entityType: 'sticky',
    entityId: String(sticky.id),
    actorId,
    beforeState: { channelId, sourceKey },
  });
  log(`[STICKY] Remove ${sourceKey} em ${channelId}.`);
  return sticky;
}

/**
 * Listener de messageCreate. Para cada sticky em modo `repost` no mesmo
 * canal, incrementa o contador. Se atingir threshold_msgs > 0, dispara
 * postFresh.
 *
 * Ignora mensagens do próprio bot (caso contrário entra em loop infinito).
 */
async function onMessageCreate(client, message) {
  if (!message.channel || !message.channel.isTextBased?.()) return;
  if (message.author?.bot) return; // não conta msgs de bots (incluindo nós)
  const stickys = await stickyRepo.listForChannel(message.channel.id).catch(() => []);
  for (const s of stickys) {
    if (s.mode !== 'repost') continue;
    if (!s.threshold_msgs) continue;
    const updated = await stickyRepo.incrementCounter(s.id);
    if (updated && updated.msgs_since_post >= updated.threshold_msgs) {
      try {
        await postFresh(client, await stickyRepo.getByChannelSource(s.channel_id, s.source_key));
      } catch (e) {
        warn(`[STICKY] postFresh falhou (msg threshold) ${s.source_key}: ${e.message}`);
      }
    }
  }
}

/**
 * Job periódico — verifica threshold_minutes e dispara repost.
 * Idempotente; não toca em modo `update`.
 */
async function runTimeBasedRefresh(client) {
  _deprecate('runTimeBasedRefresh');
  const all = await stickyRepo.listActive();
  let posted = 0;
  for (const s of all) {
    if (s.mode !== 'repost') continue;
    if (!s.threshold_minutes) continue;
    const ageMs = Math.max(0, Date.now() - new Date(s.last_posted_at).getTime());
    if (ageMs >= s.threshold_minutes * 60 * 1000) {
      try {
        await postFresh(client, s);
        posted++;
      } catch (e) {
        warn(`[STICKY] runTimeBased postFresh falhou ${s.source_key}: ${e.message}`);
      }
    }
  }
  return { posted };
}

/**
 * Notifica que um source_key mudou e despoleta refresh em todas as stickys
 * activas que o usem. Filtra opcionalmente por channel.
 *
 * Usado por: availabilityEngine após cada voto, radioEngine após setRadio.
 * Falhas são log, não bloqueiam o fluxo principal.
 *
 * SHIM: redirecciona também para PanelSyncEngine.markStale se disponível.
 */
async function notifyChange(client, sourceKey, { channelId } = {}) {
  _deprecate('notifyChange');

  // Redirecção para o novo engine
  if (_panelSyncEngine) {
    try {
      await _panelSyncEngine.markStale(sourceKey, channelId);
    } catch (e) {
      warn(`[STICKY] PanelSyncEngine.markStale falhou: ${e.message}`);
    }
  }

  // Fallback antigo para stickys não migrados
  if (!client) return; // pode ser chamado em contexto sem cliente (tests)
  try {
    const all = await stickyRepo.listActive();
    const targets = all.filter(s => s.source_key === sourceKey && (!channelId || s.channel_id === channelId));
    for (const s of targets) {
      try {
        await refresh(client, s);
      } catch (e) {
        warn(`[STICKY] notifyChange refresh falhou ${sourceKey}: ${e.message}`);
      }
    }
  } catch (e) {
    warn(`[STICKY] notifyChange ${sourceKey} falhou: ${e.message}`);
  }
}

module.exports = {
  renderers,
  setPanelSyncEngine,
  registerRenderer,
  listRenderers,
  renderPayload,
  postFresh,
  refreshUpdate,
  refresh,
  setSticky,
  removeSticky,
  onMessageCreate,
  runTimeBasedRefresh,
  notifyChange,
};
