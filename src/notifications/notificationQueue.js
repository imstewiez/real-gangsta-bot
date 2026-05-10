'use strict';
const { query } = require('../db');
const { log, warn } = require('../logger');

async function enqueue(channelId, payload, { priority = 5, maxAttempts = 3 } = {}) {
  await query(
    `INSERT INTO pending_notifications (channel_id, payload, priority, max_attempts)
     VALUES ($1, $2, $3, $4)`,
    [channelId, JSON.stringify(payload), priority, maxAttempts]
  );
}

async function dequeueBatch(limit = 10) {
  const res = await query(
    `SELECT id, channel_id, payload, priority, attempts, max_attempts
     FROM pending_notifications
     WHERE sent_at IS NULL AND attempts < max_attempts AND next_retry_at <= NOW()
     ORDER BY priority ASC, next_retry_at ASC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function markSent(id) {
  await query(
    `UPDATE pending_notifications SET sent_at = NOW() WHERE id = $1`,
    [id]
  );
}

async function markFailed(id, error) {
  const res = await query(
    `UPDATE pending_notifications
     SET attempts = attempts + 1,
         error = $1,
         next_retry_at = NOW() + (POWER(2, attempts + 1) * interval '5 seconds')
     WHERE id = $2
     RETURNING attempts, max_attempts`,
    [error?.slice(0, 500) || 'unknown', id]
  );
  return res.rows[0] || null;
}

async function processQueue(client) {
  const batch = await dequeueBatch(10);
  if (!batch.length) return { processed: 0 };

  let processed = 0;
  let failed = 0;

  for (const row of batch) {
    try {
      const channel = await client.channels.fetch(row.channel_id);
      if (!channel) {
        await markFailed(row.id, 'Canal não encontrado');
        failed++;
        continue;
      }
      await channel.send(row.payload);
      await markSent(row.id);
      processed++;
    } catch (e) {
      await markFailed(row.id, e.message);
      failed++;
      warn(`[NOTIFICATION_QUEUE] Falha ao enviar notificação ${row.id}: ${e.message}`);
    }
  }

  log(`[NOTIFICATION_QUEUE] Processado ${processed}/${batch.length} (${failed} falhas)`);
  return { processed, failed, total: batch.length };
}

module.exports = { enqueue, dequeueBatch, markSent, markFailed, processQueue };
