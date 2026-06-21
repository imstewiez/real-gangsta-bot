'use strict';

const { query } = require('../db');
const { warn, log } = require('../logger');
const { syncMemberDiscordState } = require('./syncMemberDiscordState');

async function claimEvents(limit) {
  const res = await query(
    `UPDATE bot_outbox_events
        SET status = 'processing', attempts = attempts + 1
      WHERE id IN (
        SELECT id
          FROM bot_outbox_events
         WHERE status IN ('pending', 'failed')
           AND attempts < 5
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING *`,
    [limit]
  );
  return res.rows;
}

async function markDone(id) {
  await query(`UPDATE bot_outbox_events SET status = 'done', processed_at = now(), last_error = NULL WHERE id = $1`, [
    id,
  ]);
}

async function markFailed(id, errorMessage) {
  await query(
    `UPDATE bot_outbox_events
        SET status = 'failed', last_error = $2, processed_at = now()
      WHERE id = $1`,
    [id, String(errorMessage).slice(0, 1000)]
  );
}

function shouldSync(event) {
  return ['member.created', 'member.reactivated', 'member.role_changed', 'member.sync_requested'].includes(
    event.event_type
  );
}

async function processPendingOutboxEvents(client, { limit = 5 } = {}) {
  const events = await claimEvents(limit).catch(e => {
    if (/relation .*bot_outbox_events/i.test(e.message)) {
      warn('[OUTBOX] Tabela bot_outbox_events ainda não existe. Corre npm run db:migrate.');
      return [];
    }
    throw e;
  });

  let done = 0;
  for (const event of events) {
    try {
      if (!shouldSync(event)) {
        await markDone(event.id);
        done++;
        continue;
      }

      const result = await syncMemberDiscordState(client, {
        memberId: event.entity_id,
        discordId: event.discord_id,
      });

      if (!result.ok) throw new Error(result.error || 'sync_failed');
      await markDone(event.id);
      done++;
    } catch (e) {
      await markFailed(event.id, e.message).catch(err =>
        warn(`[OUTBOX] Falha a marcar erro ${event.id}: ${err.message}`)
      );
    }
  }

  if (events.length) log(`[OUTBOX] Processados ${done}/${events.length} evento(s).`);
  return { claimed: events.length, done };
}

module.exports = { processPendingOutboxEvents };
