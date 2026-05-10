'use strict';
/**
 * Máquina de estados explícita para saídas.
 *
 * Extraída do saidaEngine para reutilização e testabilidade.
 */

const { saidaRepo } = require('../repositories');
const { NotFoundError, ConflictError } = require('../shared/errors');

const ALLOWED_TRANSITIONS = {
  criada: new Set(['trancagem', 'cancelada']),
  trancagem: new Set(['em_preparacao', 'cancelada']),
  em_preparacao: new Set(['em_curso', 'cancelada']),
  em_curso: new Set(['em_liquidacao', 'cancelada']),
  em_liquidacao: new Set(['concluida', 'cancelada']),
  concluida: new Set([]), // terminal — nunca reverter
  cancelada: new Set([]), // terminal
};

const STATUS_METADATA = {
  criada: { terminal: false, color: '#3498db', label: 'Criada', emoji: '📝' },
  trancagem: { terminal: false, color: '#e67e22', label: 'Trancagem', emoji: '🔒' },
  em_preparacao: { terminal: false, color: '#f39c12', label: 'Em preparação', emoji: '🛠️' },
  em_curso: { terminal: false, color: '#2ecc71', label: 'Em curso', emoji: '⚔️' },
  em_liquidacao: { terminal: false, color: '#9b59b6', label: 'Em liquidação', emoji: '💰' },
  concluida: { terminal: true, color: '#27ae60', label: 'Concluída', emoji: '✅' },
  cancelada: { terminal: true, color: '#e74c3c', label: 'Cancelada', emoji: '❌' },
};

function canTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  return !!allowed && allowed.has(to);
}

async function assertTransition(saidaId, toStatus) {
  const saida = await saidaRepo.findById(saidaId);
  if (!saida) throw new NotFoundError(`Saída #${saidaId} não existe.`, { code: 'SAIDA_NOT_FOUND' });
  const from = saida.status;
  // Rejeitar quando from == toStatus — evita re-entrância em cálculos
  if (from === toStatus) {
    throw new ConflictError(`Transição proibida: saída #${saidaId} já está "${from}".`, {
      code: 'SAIDA_ALREADY_IN_STATUS',
    });
  }
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.has(toStatus)) {
    throw new ConflictError(`Transição proibida: saída #${saidaId} está "${from}" e não pode passar a "${toStatus}".`, {
      code: 'SAIDA_INVALID_TRANSITION',
    });
  }
  return saida;
}

function getTerminalStates() {
  return Object.entries(STATUS_METADATA)
    .filter(([, meta]) => meta.terminal)
    .map(([status]) => status);
}

module.exports = {
  ALLOWED_TRANSITIONS,
  STATUS_METADATA,
  canTransition,
  assertTransition,
  getTerminalStates,
};
