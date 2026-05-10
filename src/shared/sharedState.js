'use strict';

const STATE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const processedInteractionIds = new Map();
const MAX_DEDUP_ENTRIES = 10000;
const recentModalOpenByUser = new Map();
const panelMessages = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of processedInteractionIds) {
    if (now > v) processedInteractionIds.delete(k);
  }
  for (const [k, v] of recentModalOpenByUser) {
    if (now > v) recentModalOpenByUser.delete(k);
  }
}, STATE_CLEANUP_INTERVAL_MS).unref();

module.exports = {
  STATE_CLEANUP_INTERVAL_MS,
  processedInteractionIds,
  recentModalOpenByUser,
  panelMessages,
};
