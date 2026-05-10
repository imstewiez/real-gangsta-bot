'use strict';
/**
 * MESSAGE LIFECYCLE MANAGER
 *
 * Gestão centralizada do lifecycle de TODAS as mensagens do bot:
 *   - Criação: cada mensagem é registada
 *   - Validação: verificações periódicas se ainda existem
 *   - Expiração: mensagens efémeras auto-limpas
 *   - Deleção: cleanup coordenado
 *   - Arquivamento: purge de registos antigos
 *
 * Jobs agendados:
 *   - Cada 5 min: limpar mensagens efémeras expiradas
 *   - Cada 30 min: validar painéis/stickies
 *   - Cada 24h: purge de registos antigos
 *   - Cada 30 min: limpar workflows órfãos
 */

const { MessageRegistryRepo } = require('../repositories/messageRegistry');
const { log, warn } = require('../logger');

class LifecycleManager {
  constructor(deps) {
    this.client = deps.client;
    this.registry = new MessageRegistryRepo();
    this._running = false;
    this._intervals = [];
  }

  start() {
    if (this._running) return;
    this._running = true;
    log('[Lifecycle] Starting message lifecycle manager');

    this._intervals.push(setInterval(() => this._cleanExpired(), 300000));
    this._intervals.push(setInterval(() => this._validatePersistent(), 1800000));
    this._intervals.push(setInterval(() => this._purgeOld(), 86400000));
    this._intervals.push(setInterval(() => this._cleanOrphanedWorkflows(), 1800000));
  }

  stop() {
    this._running = false;
    for (const iv of this._intervals) clearInterval(iv);
    this._intervals = [];
    log('[Lifecycle] Stopped');
  }

  async _cleanExpired() {
    try {
      const expired = await this.registry.getExpired(100);
      let cleaned = 0;
      for (const msg of expired) {
        try {
          const channel = await this.client.channels.fetch(msg.channel_id).catch(() => null);
          if (channel) {
            const discordMsg = await channel.messages.fetch(msg.discord_msg_id).catch(() => null);
            if (discordMsg) await discordMsg.delete();
          }
          await this.registry.markDeleted(msg.discord_msg_id);
          cleaned++;
        } catch (e) {
          await this.registry.markDeleted(msg.discord_msg_id);
        }
      }
      if (cleaned > 0) log(`[Lifecycle] Cleaned ${cleaned} expired ephemeral messages`);
    } catch (e) {
      warn(`[Lifecycle] Expired cleanup failed: ${e.message}`);
    }
  }

  async _validatePersistent() {
    try {
      const unvalidated = await this.registry.getUnvalidated(1, 50);
      let valid = 0;
      let recreated = 0;

      for (const msg of unvalidated) {
        if (msg.message_type !== 'panel' && msg.message_type !== 'sticky') continue;
        try {
          const channel = await this.client.channels.fetch(msg.channel_id).catch(() => null);
          if (!channel) {
            await this.registry.markOrphaned(msg.discord_msg_id);
            continue;
          }
          const discordMsg = await channel.messages.fetch(msg.discord_msg_id).catch(() => null);
          if (discordMsg) {
            await this.registry.validate(msg.discord_msg_id);
            valid++;
          } else {
            await this.registry.markOrphaned(msg.discord_msg_id);
            recreated++;
            // TODO: trigger panel recreation via BottomPinEngine
          }
        } catch (e) {
          warn(`[Lifecycle] Validation failed for ${msg.source_key}: ${e.message}`);
        }
      }

      if (valid + recreated > 0) {
        log(`[Lifecycle] Validated ${valid} panels, ${recreated} orphaned`);
      }
    } catch (e) {
      warn(`[Lifecycle] Validation failed: ${e.message}`);
    }
  }

  async _cleanOrphanedWorkflows() {
    try {
      const { query } = require('../db');
      const result = await query(
        `UPDATE bot_messages SET status = 'orphaned'
         WHERE message_type = 'workflow' AND status = 'active'
           AND expires_at < NOW() - INTERVAL '1 hour'
         RETURNING id`
      );
      if (result.rowCount > 0) log(`[Lifecycle] Marked ${result.rowCount} orphaned workflows`);
    } catch (e) {
      warn(`[Lifecycle] Orphan cleanup failed: ${e.message}`);
    }
  }

  async _purgeOld() {
    try {
      const purged = await this.registry.purgeOlderThan(30);
      if (purged > 0) log(`[Lifecycle] Purged ${purged} old message records`);
    } catch (e) {
      warn(`[Lifecycle] Purge failed: ${e.message}`);
    }
  }

  /**
   * Apaga TODAS as mensagens do bot num canal (uso admin/reset).
   */
  async purgeChannel(channelId, options = {}) {
    const { keepPanels = true } = options;
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel) return { deleted: 0, errors: 0 };

    let deleted = 0;
    let errors = 0;
    let lastId = null;
    let hasMore = true;

    while (hasMore) {
      const opts = lastId ? { limit: 100, before: lastId } : { limit: 100 };
      const messages = await channel.messages.fetch(opts).catch(() => null);
      if (!messages || messages.size === 0) break;

      const botMessages = [...messages.values()].filter(m => m.author?.id === this.client.user.id);

      for (const msg of botMessages) {
        if (keepPanels) {
          const entries = await this.registry.listActiveByChannel(channelId);
          if (entries.some(e => e.discord_msg_id === msg.id && e.message_type === 'panel')) continue;
        }
        try {
          await msg.delete();
          await this.registry.markDeleted(msg.id);
          deleted++;
          await new Promise(r => setTimeout(r, 350));
        } catch (e) {
          errors++;
        }
      }

      lastId = messages.last()?.id;
      hasMore = messages.size === 100;
    }

    log(`[Lifecycle] Purged ${deleted} messages in ${channelId} (${errors} errors)`);
    return { deleted, errors };
  }
}

module.exports = { LifecycleManager };
