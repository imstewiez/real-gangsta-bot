'use strict';
const { query } = require('../db');
const { assertJsonSchema } = require('../shared/validators');

async function listActive() {
  const res = await query('SELECT * FROM sticky_messages WHERE active = TRUE ORDER BY id');
  return res.rows;
}

async function listForChannel(channelId) {
  const res = await query('SELECT * FROM sticky_messages WHERE channel_id = $1 AND active = TRUE', [channelId]);
  return res.rows;
}

async function getByChannelSource(channelId, sourceKey) {
  const res = await query('SELECT * FROM sticky_messages WHERE channel_id = $1 AND source_key = $2', [
    channelId,
    sourceKey,
  ]);
  return res.rows[0] || null;
}

async function upsert({ channelId, sourceKey, mode, payload, thresholdMsgs, thresholdMinutes, createdBy }) {
  assertJsonSchema('sticky.payload', payload, { channel_id: 'string', message_id: 'string' });
  const res = await query(
    `INSERT INTO sticky_messages
       (channel_id, source_key, mode, payload, threshold_msgs, threshold_minutes, created_by, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      ON CONFLICT (channel_id, source_key) DO UPDATE SET
        mode = EXCLUDED.mode,
        payload = EXCLUDED.payload,
        threshold_msgs = EXCLUDED.threshold_msgs,
        threshold_minutes = EXCLUDED.threshold_minutes,
        active = TRUE,
        last_message_id = NULL,
        updated_at = NOW()
      RETURNING *`,
    [channelId, sourceKey, mode, JSON.stringify(payload || {}), thresholdMsgs || 0, thresholdMinutes || 0, createdBy]
  );
  return res.rows[0];
}

async function setLastMessage(id, messageId) {
  await query(
    `UPDATE sticky_messages
       SET last_message_id = $1, msgs_since_post = 0,
           last_posted_at = NOW(), updated_at = NOW()
      WHERE id = $2`,
    [messageId, id]
  );
}

async function incrementCounter(id) {
  const res = await query(
    `UPDATE sticky_messages
       SET msgs_since_post = msgs_since_post + 1, updated_at = NOW()
      WHERE id = $1
      RETURNING msgs_since_post, threshold_msgs`,
    [id]
  );
  return res.rows[0];
}

async function deactivate(id) {
  await query('UPDATE sticky_messages SET active = FALSE, updated_at = NOW() WHERE id = $1', [id]);
}

module.exports = {
  listActive,
  listForChannel,
  getByChannelSource,
  upsert,
  setLastMessage,
  incrementCounter,
  deactivate,
};
