'use strict';
/**
 * Helpers para expirar graciosamente mensagens de fluxo interactivo.
 *
 * Um fluxo (ex: wizard de saída, registo de material multi-step) deve:
 *   1. Desactivar os componentes em vez de apagar a mensagem
 *   2. Mostrar estado visual de expiração
 *   3. Não deixar botões clicáveis eternamente
 *
 * Uso típico — agendar expiração após criar uma mensagem de fluxo:
 *
 *   scheduleFlowExpire(interaction, {
 *     afterMs: 10 * 60_000,            // 10 min
 *     reason:  'Sessão expirada. Abre pelo painel.',
 *   });
 *
 * Também há `markExpiredNow(interaction, reason)` para expirar já (ex: ao
 * concluir um wizard com sucesso, queremos mostrar "Fluxo concluído").
 */

const { EmbedBuilder } = require('discord.js');
const { warn } = require('../logger');
const { disableComponentRows } = require('./interactionHelpers');

const DEFAULT_EXPIRE_MS = 10 * 60 * 1000; // 10min — mais que suficiente para um fluxo

function _expireEmbed(reason) {
  return new EmbedBuilder()
    .setColor(0x7f8c8d)
    .setDescription(`⏱️ ${reason || 'Interacção expirada. Abre novamente pelo painel.'}`);
}

/**
 * Edita a mensagem original para mostrar estado de expiração e desactiva
 * todos os componentes. Silent fail — se a mensagem já não existe, ignora.
 */
async function markExpiredNow(interaction, reason) {
  if (!interaction) return;
  try {
    const components = interaction.message?.components ? disableComponentRows(interaction.message.components) : [];

    const payload = {
      embeds: [_expireEmbed(reason)],
      components,
    };

    if (interaction.webhook && interaction.message?.id) {
      await interaction.webhook.editMessage(interaction.message.id, payload).catch(() => {});
    } else if (typeof interaction.editReply === 'function') {
      await interaction.editReply(payload).catch(() => {});
    }
  } catch (e) {
    warn(`[EXPIRE] ${e.message}`);
  }
}

/**
 * Agenda expiração do fluxo. Não apaga a mensagem — desactiva componentes
 * e mostra o estado de expiração.
 */
function scheduleFlowExpire(interaction, opts = {}) {
  const afterMs = opts.afterMs || DEFAULT_EXPIRE_MS;
  const reason = opts.reason;
  const timer = setTimeout(() => {
    markExpiredNow(interaction, reason).catch(() => {});
  }, afterMs);
  // Se o processo morrer, não bloqueia shutdown.
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

/**
 * Expira uma mensagem arbitrária (não necessariamente ligada a uma
 * interaction). Usado por session stores que expiram contextos.
 */
async function markMessageExpired(message, reason) {
  if (!message) return;
  try {
    const components = message.components ? disableComponentRows(message.components) : [];
    await message
      .edit({
        embeds: [_expireEmbed(reason)],
        components,
      })
      .catch(() => {});
  } catch (e) {
    warn(`[EXPIRE] markMessageExpired: ${e.message}`);
  }
}

module.exports = {
  DEFAULT_EXPIRE_MS,
  markExpiredNow,
  scheduleFlowExpire,
  markMessageExpired,
};
