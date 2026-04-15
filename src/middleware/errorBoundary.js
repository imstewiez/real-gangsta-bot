'use strict';
/**
 * Error boundary middleware for Discord interaction handlers.
 *
 * Wraps any async handler function so that unhandled errors are:
 *   1. Logged with full context (user, guild, interaction type, correlation ID)
 *   2. Counted in metrics
 *   3. Replied to the user with a friendly Portuguese error message
 *
 * Usage:
 *   const { withErrorBoundary } = require('../middleware/errorBoundary');
 *   // Wrap a handler inline:
 *   await withErrorBoundary(interaction, () => myHandler(interaction));
 */

const { MessageFlags } = require('discord.js');
const { warn, error } = require('../logger');
const metrics = require('../lib/metrics');

/**
 * Wraps an async handler with a try/catch error boundary.
 *
 * @param {import('discord.js').Interaction} interaction
 * @param {() => Promise<any>} fn - The handler to execute
 * @param {object} [opts]
 * @param {string} [opts.label] - Optional label for log context
 * @returns {Promise<any>}
 */
async function withErrorBoundary(interaction, fn, opts = {}) {
  try {
    return await fn();
  } catch (e) {
    metrics.interactionErrorsTotal.inc();

    // Build context string for diagnostics
    const ctx = interaction.isChatInputCommand?.()
      ? `cmd=/${interaction.commandName}`
      : interaction.isButton?.()
        ? `button=${interaction.customId}`
        : interaction.isModalSubmit?.()
          ? `modal=${interaction.customId}`
          : interaction.isAnySelectMenu?.()
            ? `select=${interaction.customId}`
            : `type=${interaction.type}`;

    const label = opts.label ? `[${opts.label}] ` : '';
    const userId = interaction.user?.id || 'unknown';
    const guildId = interaction.guildId || 'unknown';

    error(
      `${label}[ERROR_BOUNDARY] Unhandled error (${ctx}, user=${userId}, guild=${guildId}): ${e.message}`,
      e
    );

    // Attempt to reply with a user-friendly message
    try {
      const content = '⛔ Erro interno. Tenta novamente — se persistir, contacta a chefia.';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    } catch (_) {
      // Swallow reply errors — we already logged the original
    }
  }
}

/**
 * Creates a wrapped version of a handler function that automatically applies
 * the error boundary. Useful for wrapping imported handler functions.
 *
 * @param {Function} handler - async (interaction, ...args) => void
 * @param {string} [label] - Optional label for log context
 * @returns {Function} Wrapped handler
 */
function wrapHandler(handler, label) {
  return async function wrappedHandler(interaction, ...args) {
    return withErrorBoundary(interaction, () => handler(interaction, ...args), { label });
  };
}

module.exports = { withErrorBoundary, wrapHandler };
