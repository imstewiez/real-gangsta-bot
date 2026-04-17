'use strict';
/**
 * Auditoria centralizada de perm check failures.
 *
 * Sempre que um handler rejeita uma acção por falta de permissão, chama
 * recordDenial() — fica no audit_log e em métricas. Útil para detectar
 * utilizadores a tentar acções fora do scope deles.
 */

const { logAudit } = require('../audit/auditEngine');
const { warn } = require('../logger');
const metrics = require('../lib/metrics');

let _denyCounter = null;
function _counter() {
  if (_denyCounter) return _denyCounter;
  try {
    _denyCounter = metrics.permDenialsTotal || metrics.register?.counter?.('perm_denials_total') || { inc: () => {} };
  } catch {
    _denyCounter = { inc: () => {} };
  }
  return _denyCounter;
}

/**
 * Regista tentativa rejeitada. Fire-and-forget — nunca bloqueia handler.
 *
 * @param {object} interaction — Discord interaction (para extrair user/guild)
 * @param {string} action — descrição da acção ('fechar saídas', 'sync panels'...)
 * @param {string} [requiredRole] — role ou scope esperado ('chefia', 'oficial'...)
 */
function recordDenial(interaction, action, requiredRole = null) {
  try {
    _counter().inc();
    const ctx = require('./requestContext').current();
    const actorId = interaction?.user?.id;
    const actorName = interaction?.user?.username;
    const guildId = interaction?.guildId;

    warn(
      `[PERM-DENY] ${actorName || actorId} tentou "${action}" sem permissão${requiredRole ? ` (requer ${requiredRole})` : ''}${ctx ? ` · ${ctx.correlationId}` : ''}`
    );

    // Fire-and-forget DB insert
    logAudit({
      action: 'permission_denied',
      entityType: 'interaction',
      entityId: actorId,
      actorId,
      actorName,
      afterState: {
        attemptedAction: action,
        requiredRole,
        guildId,
        correlationId: ctx?.correlationId,
      },
    }).catch(e => warn(`[PERM-DENY] audit log falhou: ${e.message}`));
  } catch (e) {
    warn(`[PERM-DENY] exception: ${e.message}`);
  }
}

/**
 * Wrapper de check: recebe predicate + action + required, retorna boolean.
 * Se denied, regista automaticamente.
 *
 *   if (!permAudit.check(interaction, isChefia(m), 'criar saídas', 'chefia')) return;
 */
function check(interaction, predicateResult, action, requiredRole = null) {
  if (predicateResult) return true;
  recordDenial(interaction, action, requiredRole);
  return false;
}

module.exports = { recordDenial, check };
