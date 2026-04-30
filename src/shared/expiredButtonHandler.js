'use strict';
/**
 * Generic handler for expired/old buttons.
 * Returns true if the button should be treated as expired.
 */

const { safeReply } = require('./interactionHelpers');

const ACTIVE_PANELS = new Map(); // messageId -> { timestamp, channelId }

function registerPanel(messageId, channelId) {
  ACTIVE_PANELS.set(messageId, { timestamp: Date.now(), channelId });
}

function isPanelActive(messageId, maxAgeMs = 3600000) {
  const panel = ACTIVE_PANELS.get(messageId);
  if (!panel) return false;
  if (Date.now() - panel.timestamp > maxAgeMs) {
    ACTIVE_PANELS.delete(messageId);
    return false;
  }
  return true;
}

async function handleExpired(interaction, messageId) {
  if (!isPanelActive(messageId)) {
    await safeReply(interaction, {
      content: '⏳ Este painel já não está activo. Usa o comando ou painel actual.',
      flags: 64,
    });
    return true;
  }
  return false;
}

function cleanupOldPanels(maxAgeMs = 86400000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, panel] of ACTIVE_PANELS) {
    if (panel.timestamp < cutoff) ACTIVE_PANELS.delete(id);
  }
}

setInterval(() => cleanupOldPanels(), 3600000);

module.exports = { registerPanel, isPanelActive, handleExpired };
