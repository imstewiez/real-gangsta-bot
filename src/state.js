'use strict';
const { query } = require('./db');

async function getStateKey(key, defaultValue = {}) {
  try {
    const result = await query('SELECT value FROM bot_state WHERE key = $1', [key]);
    if (result.rows.length === 0) return defaultValue;
    return result.rows[0].value;
  } catch (err) {
    require('./logger').error(`[State] Erro ao ler chave '${key}':`, err.message);
    return defaultValue;
  }
}

async function setStateKey(key, value) {
  if (JSON.stringify(value).length > 1_000_000) throw new Error('State payload too large');
  await query(
    `INSERT INTO bot_state (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

module.exports = { getStateKey, setStateKey };
