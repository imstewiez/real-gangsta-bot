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
const { isCommand, isSupervisor, isOficial, isPatraoDiZona, isBairrista } = require('../permissions/permissionEngine');

const MIN_ROLE_PREDICATES = Object.freeze({
  command: isCommand,
  chefia: isCommand,
  supervisor: isSupervisor,
  oficial: isOficial,
  og: isOficial,
  patrao_di_zona: isPatraoDiZona,
  patrao: isPatraoDiZona,
  bairrista: isBairrista,
  any: isBairrista,
});

function _resolvePredicate(predicate) {
  if (typeof predicate === 'function') return predicate;
  if (predicate && typeof predicate === 'object' && predicate.minRole) {
    const p = MIN_ROLE_PREDICATES[predicate.minRole.toLowerCase()];
    if (p) return p;
  }
  return null;
}

/**
 * @param {Interaction} interaction
 * @param {Function|{minRole:string}} predicate — fn(member) => boolean, ou {minRole:'OG'}
 * @param {object} [opts]
 * @param {string} [opts.message] — override da mensagem de negação
 * @param {string} [opts.messageClass] — classe da mensagem (default: BANAL)
 * @returns {Promise<boolean>} — true se autorizado, false se negado (já respondeu)
 */
async function requirePermission(interaction, predicate, opts = {}) {
  const fn = _resolvePredicate(predicate);
  if (!fn) {
    throw new TypeError(`requirePermission: predicado inválido: ${JSON.stringify(predicate)}`);
  }
  if (fn(interaction.member)) return true;

  const message = opts.message ?? ERRORS.NO_PERMISSION?.() ?? '⛔ Não tens permissão para isto.';
  await safeReply(interaction, { content: message }, { messageClass: opts.messageClass ?? 'BANAL' });
  return false;
}

module.exports = { requirePermission };
