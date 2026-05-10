'use strict';
/**
 * PanelSyncEngine — orquestra refreshes e validações de painéis.
 *
 * markStale usa debounce de 30s para evitar spam de edits quando
 * múltiplas mudanças acontecem em sequência.
 */

const { MessageRegistryRepo } = require('../repositories');
const { log, warn } = require('../logger');

const SYNC_DEBOUNCE_MS = 30000;
const MAX_BATCH_SIZE = 10;

class PanelSyncEngine {
  constructor({ client }) {
    if (!client) throw new Error('PanelSyncEngine requer client');
    this.client = client;
    this.registry = new MessageRegistryRepo();
    this.bottomPinEngine = null;

    this._debounces = new Map(); // key -> timeoutId
  }

  /** Injecção do BottomPinEngine (necessário para refresh/bump). */
  useBottomPinEngine(engine) {
    this.bottomPinEngine = engine;
  }

  /** Marca um painel como stale — refresh com debounce. */
  markStale(sourceKey, channelId = null) {
    const key = channelId ? `${sourceKey}:${channelId}` : sourceKey;
    const existing = this._debounces.get(key);
    if (existing) clearTimeout(existing);

    const timeoutId = setTimeout(() => {
      this._debounces.delete(key);
      this.refreshNow(sourceKey, channelId).catch(e => {
        warn(`[PANEL_SYNC] Debounced refresh falhou ${key}: ${e.message}`);
      });
    }, SYNC_DEBOUNCE_MS);

    this._debounces.set(key, timeoutId);
    log(`[PANEL_SYNC] markStale: ${key} (debounce ${SYNC_DEBOUNCE_MS}ms).`);
  }

  /** Marca múltiplos painéis como stale. */
  markMultipleStale(sourceKeys) {
    if (!Array.isArray(sourceKeys)) return;
    for (const sk of sourceKeys) {
      this.markStale(sk);
    }
  }

  /** Refresh imediato — cancela debounce pendente. */
  async refreshNow(sourceKey, channelId = null) {
    const key = channelId ? `${sourceKey}:${channelId}` : sourceKey;
    const existing = this._debounces.get(key);
    if (existing) {
      clearTimeout(existing);
      this._debounces.delete(key);
    }
    try {
      await this._executeRefresh(sourceKey, channelId);
    } catch (e) {
      warn(`[PANEL_SYNC] refreshNow falhou ${key}: ${e.message}`);
    }
  }

  /** Refresh de TODOS os painéis activos (batch). */
  async fullSync() {
    if (!this.bottomPinEngine) {
      warn('[PANEL_SYNC] BottomPinEngine não configurado — skip fullSync.');
      return;
    }

    const rows = await this.registry.listActiveByType('panel');
    const chunks = [];
    for (let i = 0; i < rows.length; i += MAX_BATCH_SIZE) {
      chunks.push(rows.slice(i, i + MAX_BATCH_SIZE));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(r =>
          this.bottomPinEngine.refresh(r.channel_id, r.source_key).catch(e => {
            warn(`[PANEL_SYNC] fullSync refresh falhou ${r.source_key} em ${r.channel_id}: ${e.message}`);
          })
        )
      );
    }

    log(`[PANEL_SYNC] fullSync completo: ${rows.length} painéis.`);
  }

  /** Valida existência das mensagens no Discord; recria órfãs. */
  async validateAll() {
    if (!this.bottomPinEngine) {
      warn('[PANEL_SYNC] BottomPinEngine não configurado — skip validateAll.');
      return;
    }

    const rows = await this.registry.listActiveByType('panel');
    for (const r of rows) {
      try {
        const channel = await this.client.channels.fetch(r.channel_id).catch(() => null);
        if (!channel) {
          warn(`[PANEL_SYNC] Canal inacessível em validateAll: ${r.channel_id}`);
          continue;
        }

        const msg = await channel.messages.fetch(r.discord_msg_id).catch(() => null);
        if (!msg) {
          warn(`[PANEL_SYNC] Mensagem orfã detectada: ${r.source_key} em ${r.channel_id}`);
          await this.bottomPinEngine.refresh(r.channel_id, r.source_key);
        } else {
          await this.registry.validate(r.discord_msg_id);
        }
      } catch (e) {
        warn(`[PANEL_SYNC] validateAll erro ${r.source_key}: ${e.message}`);
      }
    }
  }

  /** Execução interna do refresh (resolve channelId se omitido). */
  async _executeRefresh(sourceKey, channelId) {
    if (!this.bottomPinEngine) {
      warn('[PANEL_SYNC] BottomPinEngine não configurado — skip _executeRefresh.');
      return;
    }

    if (channelId) {
      await this.bottomPinEngine.refresh(channelId, sourceKey);
      return;
    }

    // Sem channelId: refresh todos os canais deste sourceKey
    const rows = await this.registry.listActiveByType('panel');
    const targets = rows.filter(r => r.source_key === sourceKey);
    for (const r of targets) {
      try {
        await this.bottomPinEngine.refresh(r.channel_id, sourceKey);
      } catch (e) {
        warn(`[PANEL_SYNC] refresh falhou ${sourceKey} em ${r.channel_id}: ${e.message}`);
      }
    }
  }
}

module.exports = { PanelSyncEngine };
