'use strict';
/**
 * Reconcile driver — resident_channels.
 * Verifica se channel_id referenciado na DB ainda existe no Discord.
 *   - DB.status='active' mas Discord apagou → orphan_in_db
 *   - Discord existe mas DB nunca soube → missing_in_db (raro, só com onboarding
 *     manual; backfill não cobre; reportado mas não corrigido)
 *
 * apply() marca channels órfãos como status='deleted' + deleted_at.
 */

const { query } = require('../../db');
const { warn } = require('../../logger');

async function check(guild) {
  const dbRows = await query(`
    SELECT id, member_id, discord_id, channel_id, channel_name, status, created_at
      FROM resident_channels
     WHERE status IN ('active', 'archived') AND deleted_at IS NULL`);

  const drift = { total_checked: 0, orphan_in_db: [], channels_missing: [], ok: 0 };

  for (const row of dbRows.rows) {
    drift.total_checked += 1;
    let ch = null;
    try { ch = await guild.channels.fetch(row.channel_id).catch(() => null); }
    catch (e) { warn(`[RECONCILE:channels] fetch falhou ${row.channel_id}: ${e.message}`); }
    if (!ch) {
      drift.orphan_in_db.push({
        id: row.id, discord_id: row.discord_id, channel_id: row.channel_id,
        channel_name: row.channel_name, status: row.status,
      });
    } else {
      drift.ok += 1;
    }
  }
  drift.has_drift = drift.orphan_in_db.length > 0;
  return drift;
}

async function apply(guild, drift, { actor = 'system:reconcile' } = {}) {
  let corrected = 0;
  for (const orphan of drift.orphan_in_db) {
    try {
      await query(
        `UPDATE resident_channels
            SET status = 'deleted',
                deleted_at = NOW(),
                record_version = record_version + 1
          WHERE id = $1 AND deleted_at IS NULL`,
        [orphan.id]
      );
      // Regista em archival_log
      await query(
        `INSERT INTO archival_log (domain, action, entity_ref, row_count, actor, reason, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['resident_channels', 'soft_delete', String(orphan.id), 1, actor,
         'Channel apagado em Discord — reconcile cleanup',
         { channel_id: orphan.channel_id, channel_name: orphan.channel_name }]
      );
      corrected += 1;
    } catch (e) {
      warn(`[RECONCILE:channels] apply falhou rc.id=${orphan.id}: ${e.message}`);
    }
  }
  return { corrected, errors: [] };
}

module.exports = { check, apply };
