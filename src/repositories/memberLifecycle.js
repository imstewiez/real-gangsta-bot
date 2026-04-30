'use strict';
/**
 * Member lifecycle repository — state transitions + audit history.
 */

const { query, queryWithTransaction } = require('../db');

const VALID_TRANSITIONS = Object.freeze({
  pending: ['active', 'removed'],
  active: ['away', 'on_review', 'promoted', 'demoted', 'removed', 'left_discord'],
  away: ['active', 'removed', 'left_discord'],
  on_review: ['active', 'promoted', 'demoted', 'removed'],
  promoted: ['active', 'on_review', 'demoted', 'removed'],
  demoted: ['active', 'on_review', 'promoted', 'removed'],
  removed: ['pending'],
  left_discord: ['pending'],
});

function canTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

async function getState(memberId) {
  const res = await query('SELECT lifecycle_state FROM members WHERE id = $1', [memberId]);
  return res.rows[0]?.lifecycle_state || null;
}

async function transition({ memberId, newState, changedBy, reason }) {
  return queryWithTransaction(async client => {
    const cur = await client.query('SELECT lifecycle_state FROM members WHERE id = $1', [memberId]);
    if (!cur.rows.length) throw new Error('Membro não encontrado.');
    const oldState = cur.rows[0].lifecycle_state;
    if (oldState === newState) return { oldState, newState, changed: false };
    if (!canTransition(oldState, newState)) {
      throw new Error(`Transição inválida: ${oldState} → ${newState}`);
    }

    await client.query(
      `UPDATE members SET lifecycle_state = $1, lifecycle_changed_at = NOW(), lifecycle_changed_by = $2, lifecycle_notes = $3 WHERE id = $4`,
      [newState, changedBy, reason || '', memberId]
    );
    await client.query(
      `INSERT INTO member_lifecycle_history (member_id, old_state, new_state, changed_by, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [memberId, oldState, newState, changedBy, reason || '']
    );
    return { oldState, newState, changed: true };
  });
}

async function getHistory(memberId, { limit = 20 } = {}) {
  const res = await query(
    `SELECT * FROM member_lifecycle_history WHERE member_id = $1 ORDER BY changed_at DESC LIMIT $2`,
    [memberId, limit]
  );
  return res.rows;
}

async function listByState(state) {
  const res = await query(
    `SELECT id, discord_id, display_name, role, lifecycle_state, lifecycle_changed_at
     FROM members WHERE lifecycle_state = $1 ORDER BY display_name`,
    [state]
  );
  return res.rows;
}

module.exports = { canTransition, getState, transition, getHistory, listByState };
