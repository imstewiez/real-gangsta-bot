'use strict';

const { query } = require('../db');
const { log, warn } = require('../logger');

const FLUSH_INTERVAL_MS = Number(process.env.DISCORD_ACTIVITY_FLUSH_MS || 15000);
const buffer = new Map();
let flushTimer = null;
let flushing = false;

function shouldTrackMessage(message) {
  if (!message?.guildId) return false;
  if (message.author?.bot) return false;
  if (message.system) return false;
  return Boolean(message.author?.id);
}

function trackDiscordMessage(message) {
  if (!shouldTrackMessage(message)) return;
  const discordId = message.author.id;
  const current = buffer.get(discordId) || { count: 0, lastAt: null };
  current.count += 1;
  current.lastAt = message.createdAt || new Date();
  buffer.set(discordId, current);
}

async function ensureDiscordActivitySchema() {
  await query(`CREATE TABLE IF NOT EXISTS discord_member_daily_activity (
    discord_id       TEXT NOT NULL,
    activity_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    message_count    INTEGER NOT NULL DEFAULT 0,
    last_message_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (discord_id, activity_date)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_discord_member_daily_activity_last
    ON discord_member_daily_activity (last_message_at DESC)`);
}

async function flushDiscordMessageActivity() {
  if (flushing || buffer.size === 0) return { flushed: 0 };
  flushing = true;
  const snapshot = Array.from(buffer.entries());
  buffer.clear();

  try {
    await ensureDiscordActivitySchema();
    for (const [discordId, data] of snapshot) {
      await query(
        `INSERT INTO discord_member_daily_activity (discord_id, activity_date, message_count, last_message_at, updated_at)
         VALUES ($1, CURRENT_DATE, $2, $3, NOW())
         ON CONFLICT (discord_id, activity_date) DO UPDATE
           SET message_count = discord_member_daily_activity.message_count + EXCLUDED.message_count,
               last_message_at = GREATEST(discord_member_daily_activity.last_message_at, EXCLUDED.last_message_at),
               updated_at = NOW()`,
        [discordId, data.count, data.lastAt]
      );
    }
    return { flushed: snapshot.length };
  } catch (e) {
    for (const [discordId, data] of snapshot) {
      const current = buffer.get(discordId) || { count: 0, lastAt: data.lastAt };
      current.count += data.count;
      if (!current.lastAt || data.lastAt > current.lastAt) current.lastAt = data.lastAt;
      buffer.set(discordId, current);
    }
    warn(`[DISCORD-ACTIVITY] Flush falhou: ${e.message}`);
    return { flushed: 0, error: e.message };
  } finally {
    flushing = false;
  }
}

function startDiscordActivityTracker(client) {
  if (!client || flushTimer) return;
  flushTimer = setInterval(() => {
    flushDiscordMessageActivity().catch(e => warn(`[DISCORD-ACTIVITY] Flush interval falhou: ${e.message}`));
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
  log(`[DISCORD-ACTIVITY] Tracking ativo: mensagens agregadas a cada ${FLUSH_INTERVAL_MS}ms.`);
}

async function stopDiscordActivityTracker() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushDiscordMessageActivity();
}

module.exports = {
  trackDiscordMessage,
  startDiscordActivityTracker,
  stopDiscordActivityTracker,
  flushDiscordMessageActivity,
  ensureDiscordActivitySchema,
};
