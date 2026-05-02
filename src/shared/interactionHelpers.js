'use strict';
const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
} = require('discord.js');
const { warn } = require('../logger');
const { processedInteractionIds } = require('./sharedState');
const { MessageClass, ttlForClass, autoDeletes, classFromLegacyOpts } = require('./messagePolicy');

// Fallback TTL para respostas sem classe explícita (legacy). A mensagem
// dura 20s — equivalente a BANAL. Handlers novos devem passar messageClass.
const EPHEMERAL_AUTO_DELETE_MS = 20_000;

/**
 * isSingleSelectInteraction — detecta se a interação é um StringSelectMenu
 * isSingleSelectInteraction — detecta se a interação é um StringSelectMenu
 * de seleção única. Usado para auto-limpar componentes após escolha.
 */
function isSingleSelectInteraction(interaction) {
  return interaction?.isStringSelectMenu?.() && interaction.maxValues === 1;
}

/**
 * autoClearSelectComponents — se a interação vier de um single-select e o
 * payload NÃO explicitar components, assume que o handler quer consumir o
 * select e substitui por lista vazia (remove-o da mensagem).
 * Multi-select NÃO é tocado — o user pode escolher vários antes de confirmar.
 */
function autoClearSelectComponents(interaction, payload) {
  if (isSingleSelectInteraction(interaction) && payload && payload.components === undefined) {
    payload.components = [];
  }
}

function scheduleDeleteInteractionReply(interaction, ms = EPHEMERAL_AUTO_DELETE_MS) {
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, ms);
}

function scheduleDeleteEphemeralMessage(interaction, messageId, ms = EPHEMERAL_AUTO_DELETE_MS) {
  if (!messageId) return;
  setTimeout(() => {
    interaction.webhook?.deleteMessage(messageId).catch(() => {});
  }, ms);
}

function scheduleDeleteMessage(message, ms = EPHEMERAL_AUTO_DELETE_MS) {
  if (!message) return;
  setTimeout(() => {
    message.delete().catch(() => {});
  }, ms);
}

/**
 * safeReply — a única forma de responder a interactions.
 *
 * opts:
 *   messageClass: 'BANAL' | 'WARN' | 'ERROR' | 'RESULT' | 'COCKPIT' | 'FLOW' | 'PERSISTENT'
 *     Determina TTL + política de auto-delete (ver src/shared/messagePolicy.js).
 *
 *   dismissible (legacy): mantido por retrocompat. Se messageClass ausente,
 *     `true` → BANAL, `false` → FLOW. Inferência a partir do payload caso
 *     nada esteja definido.
 *
 *   ttlMs: override explícito em ms (usar apenas em casos especiais).
 */
async function safeReply(interaction, payload, opts = {}) {
  autoClearSelectComponents(interaction, payload);

  const cls =
    opts.messageClass ||
    classFromLegacyOpts({
      dismissible: opts.dismissible,
      payload,
    });
  const shouldDelete = autoDeletes(cls);
  const ttl = opts.ttlMs ?? ttlForClass(cls);

  const result = interaction.replied
    ? await interaction.followUp(payload).catch(() => null)
    : interaction.deferred
      ? await interaction.editReply(payload).catch(() => null)
      : await interaction.reply(payload).catch(() => null);

  if (shouldDelete && ttl && result) {
    scheduleDeleteInteractionReply(interaction, ttl);
  }
  return result;
}

/**
 * safeUpdate — para interactions de componente (button/select).
 * Substitui a mensagem original (mesmo ephemeral) em vez de criar uma nova.
 * Útil em cadeias de dropdowns: o velho desaparece, o próximo aparece no mesmo sítio.
 */
async function safeUpdate(interaction, payload, opts = {}) {
  autoClearSelectComponents(interaction, payload);
  if (typeof interaction.update !== 'function') return safeReply(interaction, payload, opts);
  try {
    await interaction.update(payload);
  } catch (e) {
    if (String(e?.code || '') === '40060') {
      // already acknowledged — fall back to followUp
      return safeReply(interaction, payload, opts);
    }
    if (String(e?.code || '') === '10062') {
      warn('[UPDATE] Interação expirada.');
      return null;
    }
    throw e;
  }
  // safeUpdate replaces the message; auto-delete respeita messageClass.
  // Default para updates intermédios de fluxo é FLOW (persistente).
  const cls =
    opts.messageClass ||
    classFromLegacyOpts({
      dismissible: opts.dismissible,
      payload,
    });
  const shouldDelete = autoDeletes(cls);
  const ttl = opts.ttlMs ?? ttlForClass(cls);
  if (shouldDelete && ttl) scheduleDeleteInteractionReply(interaction, ttl);
  return interaction;
}

function disableComponentRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => {
    const newRow = new ActionRowBuilder();
    const components = row.components || [];
    for (const comp of components) {
      const data = comp.data || comp;
      const type = data.type;
      try {
        if (type === 2) newRow.addComponents(ButtonBuilder.from(comp).setDisabled(true));
        else if (type === 3) newRow.addComponents(StringSelectMenuBuilder.from(comp).setDisabled(true));
        else if (type === 5) newRow.addComponents(UserSelectMenuBuilder.from(comp).setDisabled(true));
        else if (type === 6) newRow.addComponents(RoleSelectMenuBuilder.from(comp).setDisabled(true));
        else if (type === 8) newRow.addComponents(ChannelSelectMenuBuilder.from(comp).setDisabled(true));
      } catch {
        // unknown component type — skip
      }
    }
    return newRow;
  });
}

/**
 * lockMessageComponents — desactiva todos os componentes da mensagem original
 * de uma interaction de componente. Funciona para ephemerals via webhook.
 */
async function lockMessageComponents(interaction) {
  if (!interaction?.message) return;
  try {
    const disabled = disableComponentRows(interaction.message.components);
    if (interaction.webhook && interaction.message.id) {
      await interaction.webhook.editMessage(interaction.message.id, { components: disabled }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

/**
 * safeShowModal — mostra modal. Opcionalmente tranca os componentes da
 * mensagem original se `lockSource: true`.
 *
 * Default é NÃO lockar — porque se o user cancela o modal, a mensagem
 * original (ex: painel, dropdown) fica acessível para tentar outra vez.
 * Usar `lockSource: true` só para cadeias select→modal onde o select
 * original já não deve ser reutilizado (ex: escolha irreversível já
 * materializada).
 *
 * Casos em que NÃO queres lockar (não passes lockSource):
 *   - Botão em painel persistente (Fechar, Dar a Cara, Criar Saída) —
 *     se o user cancela, deve poder clicar de novo sem se refrescar.
 *   - Botões numa ephemeral onde o user pode querer outra acção.
 */
async function safeShowModal(interaction, modal, opts = {}) {
  try {
    await interaction.showModal(modal);
    if (opts.lockSource && interaction.message) {
      setImmediate(() => {
        lockMessageComponents(interaction);
      });
    }
    return true;
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (String(e?.code || '') === '10062' || msg.includes('Unknown interaction')) {
      warn('[MODAL] Interação expirada.');
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({
            content: 'A interação expirou. Tenta novamente.',
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => null);
      }
      return false;
    }
    if (String(e?.code || '') === '40060' || msg.includes('already been acknowledged')) {
      return false;
    }
    throw e;
  }
}

function isDuplicate(interactionId, ttlMs = 15000) {
  const until = processedInteractionIds.get(interactionId) || 0;
  if (Date.now() < until) return true;
  processedInteractionIds.set(interactionId, Date.now() + ttlMs);
  return false;
}

function getModalField(interaction, fieldId) {
  try {
    return interaction.fields.getTextInputValue(fieldId);
  } catch {
    return '';
  }
}

function safeCustomId(parts, separator = '::') {
  const id = parts.join(separator);
  if (id.length > 100) {
    warn(`[CUSTOM_ID] Truncated: ${id.slice(0, 50)}...`);
    return id.slice(0, 100);
  }
  return id;
}

async function safePanelRefresh(message, payload, label = 'PANEL') {
  if (!message) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await message.edit(payload);
      return true;
    } catch (e) {
      const code = String(e?.code || '');
      if (code === '10008' || String(e?.message || '').includes('Unknown Message')) {
        warn(`[${label}] Mensagem do painel já não existe.`);
        return false;
      }
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 500));
      } else {
        warn(`[${label}] Falha ao atualizar painel: ${e?.message}`);
      }
    }
  }
  return false;
}

module.exports = {
  EPHEMERAL_AUTO_DELETE_MS,
  MessageClass,
  scheduleDeleteInteractionReply,
  scheduleDeleteEphemeralMessage,
  scheduleDeleteMessage,
  safeReply,
  safeUpdate,
  safeShowModal,
  lockMessageComponents,
  disableComponentRows,
  isDuplicate,
  getModalField,
  safeCustomId,
  safePanelRefresh,
};
