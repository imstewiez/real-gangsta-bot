'use strict';
const { query, queryWithTransaction } = require('../db');

async function getOpenSession(channelId, sessionDate) {
  const res = await query(
    `SELECT * FROM availability_sessions
      WHERE channel_id = $1 AND session_date = $2 AND status = 'open'
      LIMIT 1`,
    [channelId, sessionDate]
  );
  return res.rows[0] || null;
}

async function getSessionById(id) {
  const res = await query('SELECT * FROM availability_sessions WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function getLatestSession(channelId) {
  const res = await query(
    `SELECT * FROM availability_sessions WHERE channel_id = $1
      ORDER BY session_date DESC, created_at DESC LIMIT 1`,
    [channelId]
  );
  return res.rows[0] || null;
}

async function createSession({ sessionDate, channelId, createdBy, headerText, mentionRoleIds, slots }) {
  return queryWithTransaction(async client => {
    const sess = await client.query(
      `INSERT INTO availability_sessions
         (session_date, channel_id, created_by, header_text, mention_role_ids, slots_json)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
      [sessionDate, channelId, createdBy, headerText, (mentionRoleIds || []).join(','), JSON.stringify(slots || [])]
    );
    const session = sess.rows[0];
    let pos = 0;
    for (const label of slots || []) {
      await client.query(
        `INSERT INTO availability_slots (session_id, slot_label, position)
          VALUES ($1, $2, $3)`,
        [session.id, label, pos++]
      );
    }
    return session;
  });
}

async function getSlots(sessionId) {
  const res = await query('SELECT * FROM availability_slots WHERE session_id = $1 ORDER BY position', [sessionId]);
  return res.rows;
}

async function setMessageId(sessionId, messageId) {
  await query('UPDATE availability_sessions SET message_id = $1, updated_at = NOW() WHERE id = $2', [
    messageId,
    sessionId,
  ]);
}

async function closeSession(sessionId) {
  const res = await query(
    `UPDATE availability_sessions
        SET status = 'closed', closed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'open'
      RETURNING *`,
    [sessionId]
  );
  return res.rows[0] || null;
}

async function upsertVote({ sessionId, slotId, discordUserId, voteState }) {
  const res = await query(
    `INSERT INTO availability_votes (session_id, slot_id, discord_user_id, vote_state)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (slot_id, discord_user_id)
      DO UPDATE SET vote_state = EXCLUDED.vote_state, updated_at = NOW()
      RETURNING *`,
    [sessionId, slotId, discordUserId, voteState]
  );
  return res.rows[0];
}

async function bulkVoteAllSlots({ sessionId, discordUserId, voteState }) {
  // Define o mesmo estado para TODOS os slots da sessão (atalho UX).
  return queryWithTransaction(async client => {
    const slots = await client.query('SELECT id FROM availability_slots WHERE session_id = $1', [sessionId]);
    let count = 0;
    for (const row of slots.rows) {
      await client.query(
        `INSERT INTO availability_votes (session_id, slot_id, discord_user_id, vote_state)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (slot_id, discord_user_id)
          DO UPDATE SET vote_state = EXCLUDED.vote_state, updated_at = NOW()`,
        [sessionId, row.id, discordUserId, voteState]
      );
      count++;
    }
    return count;
  });
}

async function getTallies(sessionId) {
  // Conta votos por (slot_id, vote_state) para construir o embed.
  const res = await query(
    `SELECT s.id AS slot_id, s.slot_label, s.position,
            v.vote_state, COUNT(v.id)::int AS count
       FROM availability_slots s
       LEFT JOIN availability_votes v ON v.slot_id = s.id
      WHERE s.session_id = $1
      GROUP BY s.id, s.slot_label, s.position, v.vote_state
      ORDER BY s.position`,
    [sessionId]
  );
  // Reduz para { [slot_id]: { label, position, counts: { state: n } } }
  const map = new Map();
  for (const row of res.rows) {
    let entry = map.get(row.slot_id);
    if (!entry) {
      entry = { slotId: row.slot_id, label: row.slot_label, position: row.position, counts: {} };
      map.set(row.slot_id, entry);
    }
    if (row.vote_state) entry.counts[row.vote_state] = row.count;
  }
  return [...map.values()].sort((a, b) => a.position - b.position);
}

async function getVoters(sessionId) {
  // Devolve { discord_user_id, slot_label, vote_state } ordenado por slot.
  const res = await query(
    `SELECT v.discord_user_id, s.slot_label, s.position, v.vote_state
       FROM availability_votes v
       JOIN availability_slots s ON s.id = v.slot_id
      WHERE v.session_id = $1
      ORDER BY s.position, v.vote_state, v.created_at`,
    [sessionId]
  );
  return res.rows;
}

async function getDistinctVoterCount(sessionId) {
  const res = await query(
    `SELECT COUNT(DISTINCT discord_user_id)::int AS n
       FROM availability_votes WHERE session_id = $1`,
    [sessionId]
  );
  return res.rows[0]?.n || 0;
}

module.exports = {
  getOpenSession,
  getSessionById,
  getLatestSession,
  createSession,
  getSlots,
  setMessageId,
  closeSession,
  upsertVote,
  bulkVoteAllSlots,
  getTallies,
  getVoters,
  getDistinctVoterCount,
};
