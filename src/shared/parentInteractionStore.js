'use strict';
/**
 * Parent interaction store — guarda a interaction que criou o ephemeral
 * original de um fluxo, para que qualquer handler ao longo da cascata
 * possa chamar `parent.deleteReply()` e fechar o dropdown.
 *
 * Porquê: Discord não permite `update + showModal` no mesmo interaction
 * response. Quando um select leva a um modal, o ephemeral do select
 * fica pendurado. A forma oficial (usada no RoboCop) é guardar a
 * interaction original (normalmente do botão inicial) num Map<userId>,
 * e antes do `showModal` chamar `parent.deleteReply()` — isso fecha o
 * ephemeral usando o webhook da interaction original (válido 15 min).
 *
 * TTL automático 15 min — alinhado com a validade do webhook interaction.
 */

const _parents = new Map(); // userId → { interaction, storedAt }
const TTL_MS = 15 * 60_000;

function _prune() {
  const now = Date.now();
  for (const [userId, entry] of _parents) {
    if (now - entry.storedAt > TTL_MS) _parents.delete(userId);
  }
}

function setParent(userId, interaction) {
  if (!userId || !interaction) return;
  _parents.set(userId, { interaction, storedAt: Date.now() });
  _prune();
}

function getParent(userId) {
  const entry = _parents.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > TTL_MS) {
    _parents.delete(userId);
    return null;
  }
  return entry.interaction;
}

function clearParent(userId) {
  _parents.delete(userId);
}

/**
 * Fecha o ephemeral da parent interaction — usado antes de showModal
 * para o dropdown desaparecer. Idempotente (silent se não há parent).
 */
async function deleteParentEphemeral(userId) {
  const parent = getParent(userId);
  if (!parent) return false;
  clearParent(userId);
  try {
    await parent.deleteReply();
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { setParent, getParent, clearParent, deleteParentEphemeral };
