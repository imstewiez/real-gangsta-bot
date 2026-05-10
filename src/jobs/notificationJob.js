'use strict';
const { processQueue } = require('../notifications/notificationQueue');

async function runNotificationJob(client) {
  if (!client) return { skipped: 'no_client' };
  return processQueue(client);
}

module.exports = { runNotificationJob };
