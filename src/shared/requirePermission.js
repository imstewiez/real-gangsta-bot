'use strict';
/**
 * Helper de permissão para handlers de interacção.
 *
 * Em vez de cada handler repetir:
 *   if (!isChefia(interaction.member)) {
 *     return safeReply(interaction, { content: ERRORS.NO_PERMISSION() });
 *   }
 *
 * Usa:
 *   if (!(await requirePermission(interaction, isChefia))) return;
 *
 * O helper responde automaticamente com uma mensagem efémera e devolve false.
 */

const { safeReply } = require('./interactionHelpers');
const { ERRORS } = require('../content');

/**
 * @param {Interaction} interaction
 * @param {Function} predicate — fn(member) => boolean
 * @param {object} [opts]
 * @param {string} [opts.message] — override da mensagem de negação
 * @param {string} [opts.messageClass] — classe da mensagem (default: BANAL)
 * @returns {Promise<boolean>} — true se autorizado, false se negado (já respondeu)
 */
async function requirePermission(interaction, predicate, opts = {}) {
  if (predicate(interaction.member)) return true;

  const message = opts.message ?? ERRORS.NO_PERMISSION?.() ?? '⛔ Não tens permissão para isto.';
  await safeReply(interaction, { content: message }, { messageClass: opts.messageClass ?? 'BANAL' });
  return false;
}

module.exports = { requirePermission };
