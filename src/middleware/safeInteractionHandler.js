'use strict';
/**
 * safeInteractionHandler — composes error boundary + rate limiting + metrics
 * into a single wrapper for interaction handlers.
 *
 * Usage:
 *   const { safeHandle } = require('../middleware/safeInteractionHandler');
 *
 *   // In a handler file:
 *   async function handleMyButton(interaction) {
 *     return safeHandle(interaction, async () => {
 *       // ... handler logic
 *     });
 *   }
 *
 * What it does:
 *   1. Checks rate limit (per-user, per-action)
 *   2. Wraps handler in error boundary
 *   3. Records response time in metrics
 */

const { MessageFlags } = require('discord.js');
const { withErrorBoundary } = require('./errorBoundary');
const { allow, retryAfter, denyMessage } = require('../shared/rateLimiter');
const metrics = require('../lib/metrics');

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {() => Promise<any>} fn
 * @param {object} [opts]
 * @param {number} [opts.rateLimit=10] - Max requests per window
 * @param {number} [opts.rateLimitWindowMs=10000] - Window in ms
 * @param {boolean} [opts.skipRateLimit=false] - Bypass rate limiting (admin commands)
 * @param {string} [opts.label] - Label for error logs
 * @returns {Promise<any>}
 */
async function safeHandle(interaction, fn, opts = {}) {
  const {
    rateLimit = 10,
    rateLimitWindowMs = 10_000,
    skipRateLimit = false,
    label,
  } = opts;

  // Rate limiting
  if (!skipRateLimit) {
    const actionKey = interaction.customId || interaction.commandName || 'misc';
    const userId = interaction.user?.id;
    if (userId && !allow(userId, actionKey, { limit: rateLimit, windowMs: rateLimitWindowMs })) {
      const wait = retryAfter(userId, actionKey);
      return interaction.reply({
        content: denyMessage(wait),
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  }

  // Error boundary + metrics
  const start = Date.now();
  try {
    const result = await withErrorBoundary(interaction, fn, { label });
    metrics.interactionResponseTimeMs.observe(Date.now() - start);
    return result;
  } catch (_) {
    metrics.interactionResponseTimeMs.observe(Date.now() - start);
  }
}

module.exports = { safeHandle };
