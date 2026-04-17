'use strict';
const { query, queryWithTransaction } = require('../db');

const TYPES = ['principal', 'parceria'];

async function getState(type) {
  const res = await query('SELECT * FROM radio_state WHERE radio_type = $1', [type]);
  return res.rows[0] || null;
}

async function getAllStates() {
  const res = await query('SELECT * FROM radio_state ORDER BY radio_type');
  return res.rows;
}

async function setState({ type, value, mode, actorId, note }) {
  return queryWithTransaction(async client => {
    // Lê o valor antigo (se existir)
    const cur = await client.query('SELECT value FROM radio_state WHERE radio_type = $1', [type]);
    const oldValue = cur.rows[0]?.value || '';

    await client.query(
      `INSERT INTO radio_state (radio_type, value, previous_value, mode, updated_by, note, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (radio_type) DO UPDATE SET
          previous_value = radio_state.value,
          value = EXCLUDED.value,
          mode = EXCLUDED.mode,
          updated_by = EXCLUDED.updated_by,
          note = EXCLUDED.note,
          updated_at = NOW()`,
      [type, value, oldValue, mode, actorId, note || '']
    );

    await client.query(
      `INSERT INTO radio_history (radio_type, old_value, new_value, mode, actor_id, note)
        VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, oldValue, value, mode, actorId, note || '']
    );

    return { type, value, previous: oldValue, mode };
  });
}

async function listHistory(limit = 10, type = null) {
  if (type) {
    const res = await query('SELECT * FROM radio_history WHERE radio_type = $1 ORDER BY created_at DESC LIMIT $2', [
      type,
      limit,
    ]);
    return res.rows;
  }
  const res = await query('SELECT * FROM radio_history ORDER BY created_at DESC LIMIT $1', [limit]);
  return res.rows;
}

module.exports = { TYPES, getState, getAllStates, setState, listHistory };
