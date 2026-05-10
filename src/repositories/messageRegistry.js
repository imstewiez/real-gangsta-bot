'use strict';
/**
 * MessageRegistryRepo — registo centralizado de mensagens do bot.
 *
 * Permite rastrear painéis, sticky messages, workflows e outras
 * mensagens duradouras, garantindo que apenas uma esteja activa
 * por (channel, source) para tipos fixos.
 */

const { query } = require('../db');

class MessageRegistryRepo {
  /**
   * Regista uma nova mensagem. Se já existir uma mensagem activa do
   * mesmo tipo no mesmo canal/source, marca-a como stale.
   */
  async register({ discordMsgId, channelId, guildId, messageType, sourceKey, ownerId, expiresAt, metadata }) {
    if (['panel', 'sticky'].includes(messageType)) {
      await query(
        `UPDATE bot_messages
            SET status = 'stale',
                updated_at = NOW()
          WHERE channel_id = $1
            AND source_key = $2
            AND message_type = $3
            AND status = 'active'`,
        [channelId, sourceKey, messageType]
      );
    }

    const res = await query(
      `INSERT INTO bot_messages
         (discord_msg_id, channel_id, guild_id, message_type,
          source_key, owner_id, status, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)
       RETURNING *`,
      [
        discordMsgId,
        channelId,
        guildId,
        messageType,
        sourceKey,
        ownerId,
        expiresAt || null,
        JSON.stringify(metadata || {}),
      ]
    );
    return res.rows[0];
  }

  /** Retorna a mensagem activa para um canal/source. */
  async getActive(channelId, sourceKey) {
    const res = await query(
      `SELECT * FROM bot_messages
        WHERE channel_id = $1
          AND source_key = $2
          AND status = 'active'
        ORDER BY id DESC
        LIMIT 1`,
      [channelId, sourceKey]
    );
    return res.rows[0] || null;
  }

  /** Lista todas as mensagens activas de um determinado tipo. */
  async listActiveByType(messageType) {
    const res = await query(
      `SELECT * FROM bot_messages
        WHERE message_type = $1
          AND status = 'active'
        ORDER BY created_at DESC`,
      [messageType]
    );
    return res.rows;
  }

  /** Lista todas as mensagens activas num canal. */
  async listActiveByChannel(channelId) {
    const res = await query(
      `SELECT * FROM bot_messages
        WHERE channel_id = $1
          AND status = 'active'
        ORDER BY created_at DESC`,
      [channelId]
    );
    return res.rows;
  }

  /** Actualiza o timestamp de última validação. */
  async validate(discordMsgId) {
    const res = await query(
      `UPDATE bot_messages
          SET last_validated = NOW(),
              updated_at = NOW()
        WHERE discord_msg_id = $1
        RETURNING *`,
      [discordMsgId]
    );
    return res.rows[0] || null;
  }

  /** Soft-delete: marca como deleted. */
  async markDeleted(discordMsgId) {
    const res = await query(
      `UPDATE bot_messages
          SET status = 'deleted',
              updated_at = NOW()
        WHERE discord_msg_id = $1
        RETURNING *`,
      [discordMsgId]
    );
    return res.rows[0] || null;
  }

  /** Marca uma mensagem como orfã (órfã). */
  async markOrphaned(discordMsgId) {
    const res = await query(
      `UPDATE bot_messages
          SET status = 'orphaned',
              updated_at = NOW()
        WHERE discord_msg_id = $1
        RETURNING *`,
      [discordMsgId]
    );
    return res.rows[0] || null;
  }

  /** Retorna mensagens expiradas (expires_at no passado). */
  async getExpired(limit = 100) {
    const res = await query(
      `SELECT * FROM bot_messages
        WHERE expires_at IS NOT NULL
          AND expires_at < NOW()
          AND status = 'active'
        ORDER BY expires_at ASC
        LIMIT $1`,
      [limit]
    );
    return res.rows;
  }

  /** Retorna mensagens não validadas há mais de N horas. */
  async getUnvalidated(hours, limit = 100) {
    const res = await query(
      `SELECT * FROM bot_messages
        WHERE status = 'active'
          AND (last_validated IS NULL
               OR last_validated < NOW() - INTERVAL '1 hour' * $2)
        ORDER BY last_validated ASC NULLS FIRST
        LIMIT $1`,
      [limit, hours]
    );
    return res.rows;
  }

  /** Remove permanentemente registos antigos. */
  async purgeOlderThan(days) {
    const res = await query(
      `DELETE FROM bot_messages
        WHERE updated_at < NOW() - INTERVAL '1 day' * $1
        RETURNING id`,
      [days]
    );
    return res.rowCount;
  }
}

module.exports = MessageRegistryRepo;
