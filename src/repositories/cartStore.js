'use strict';
/**
 * PostgreSQL-backed session cart store.
 * Replaces in-memory Map with durable rows + automatic TTL via expires_at.
 */

const { query } = require('../db');

const TTL_SQL = "NOW() + INTERVAL '15 minutes'";

async function getCart(discordId) {
  const res = await query(
    `SELECT tipo, lines, global_notes
       FROM session_carts
      WHERE discord_id = $1
        AND expires_at > NOW()`,
    [discordId]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  // Sliding window: every read resets TTL
  await touchExpiry(discordId);
  return {
    tipo: row.tipo,
    lines: Array.isArray(row.lines) ? row.lines : [],
    globalNotes: row.global_notes || '',
    updatedAt: Date.now(),
  };
}

async function saveCart(discordId, cart) {
  await query(
    `INSERT INTO session_carts (discord_id, tipo, lines, global_notes, expires_at)
     VALUES ($1, $2, $3, $4, ${TTL_SQL})
     ON CONFLICT (discord_id)
     DO UPDATE SET
       tipo = EXCLUDED.tipo,
       lines = EXCLUDED.lines,
       global_notes = EXCLUDED.global_notes,
       updated_at = NOW(),
       expires_at = ${TTL_SQL}`,
    [discordId, cart.tipo, JSON.stringify(cart.lines || []), cart.globalNotes || '']
  );
}

async function clearCart(discordId) {
  await query('DELETE FROM session_carts WHERE discord_id = $1', [discordId]);
}

async function touchExpiry(discordId) {
  await query(
    `UPDATE session_carts
        SET expires_at = ${TTL_SQL},
            updated_at = NOW()
      WHERE discord_id = $1
        AND expires_at > NOW()`,
    [discordId]
  );
}

module.exports = {
  getCart,
  saveCart,
  clearCart,
  touchExpiry,
};
