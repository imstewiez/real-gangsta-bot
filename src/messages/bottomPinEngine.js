'use strict';
/**
 * BottomPinEngine — mantém mensagens de painel sempre no fundo do canal
 * sem flicker. Usa MessageRegistryRepo para rastrear estado.
 *
 * Estratégia de bump (zero flicker):
 *   1. Envia nova mensagem.
 *   2. Verifica que chegou bem.
 *   3. Apaga a anterior.
 *   4. Regista a nova no registry.
 */

const { MessageRegistryRepo } = require('../repositories');
const { log, warn } = require('../logger');

const BUMP_THRESHOLD = 5;
const BUMP_COOLDOWN_MS = 30000;

class BottomPinEngine {
  constructor({ client, renderers }) {
    if (!client) throw new Error('BottomPinEngine requer client');
    this.client = client;
    this.renderers = renderers || new Map();
    this.registry = new MessageRegistryRepo();

    // Contadores e cooldowns em memória (por channel:source)
    this.counters = new Map();
    this.lastBumpAt = new Map();

    // Cache de canais com pins para evitar DB hit em cada mensagem
    this._channelPins = new Map(); // channelId -> Set<sourceKey>
  }

  /** Renderiza o payload para um sourceKey via renderer registado. */
  async _render(sourceKey) {
    const renderer = this.renderers.get(sourceKey);
    if (!renderer) throw new Error(`Renderer não registado: ${sourceKey}`);
    return renderer(this.client);
  }

  /** Publica uma mensagem nova num canal e regista-a no bot_messages. */
  async _postFresh(channelId, sourceKey, metadata = {}) {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased?.()) {
      warn(`[BOTTOM_PIN] Canal ${channelId} indisponível para ${sourceKey}.`);
      return null;
    }

    const payload = await this._render(sourceKey);
    const message = await channel.send({
      content: payload.content,
      embeds: payload.embeds || [],
      components: payload.components || [],
      allowedMentions: payload.allowedMentions || { parse: [] },
    });

    await this.registry.register({
      discordMsgId: message.id,
      channelId,
      guildId: message.guild?.id || null,
      messageType: 'panel',
      sourceKey,
      ownerId: this.client.user?.id,
      metadata,
    });

    // Actualiza cache
    if (!this._channelPins.has(channelId)) this._channelPins.set(channelId, new Set());
    this._channelPins.get(channelId).add(sourceKey);

    const key = `${channelId}:${sourceKey}`;
    this.counters.set(key, 0);
    return message;
  }

  /** Regista (ou re-regista) um pin num canal. */
  async registerPin(channelId, sourceKey, metadata = {}) {
    const msg = await this._postFresh(channelId, sourceKey, metadata);
    if (msg) {
      log(`[BOTTOM_PIN] Pin registado: ${sourceKey} em ${channelId} (msg ${msg.id}).`);
    }
    return msg;
  }

  /** Chamado em cada MessageCreate — incrementa contadores e bump se necessário. */
  async onMessageCreate(message) {
    if (message.author?.bot) return;
    if (!message.channel?.isTextBased?.()) return;

    const channelId = message.channel.id;
    const sourceKeys = this._channelPins.get(channelId);
    if (!sourceKeys || sourceKeys.size === 0) return;

    for (const sourceKey of sourceKeys) {
      const key = `${channelId}:${sourceKey}`;
      let count = (this.counters.get(key) || 0) + 1;
      this.counters.set(key, count);

      if (count >= BUMP_THRESHOLD) {
        const lastBump = this.lastBumpAt.get(key) || 0;
        if (Date.now() - lastBump < BUMP_COOLDOWN_MS) continue;

        const oldPin = await this.registry.getActive(channelId, sourceKey);
        if (oldPin) {
          try {
            await this._executeBump(channelId, oldPin);
            this.counters.set(key, 0);
            this.lastBumpAt.set(key, Date.now());
          } catch (e) {
            warn(`[BOTTOM_PIN] Bump falhou ${sourceKey}: ${e.message}`);
          }
        }
      }
    }
  }

  /** Bump manual — republica a mensagem no fundo. */
  async bump(channelId, sourceKey) {
    const oldPin = await this.registry.getActive(channelId, sourceKey);
    if (!oldPin) {
      warn(`[BOTTOM_PIN] Nenhum pin activo para bump: ${sourceKey} em ${channelId}`);
      return null;
    }
    return this._executeBump(channelId, oldPin);
  }

  /** Refresh — edita a mensagem actual sem a mover. */
  async refresh(channelId, sourceKey) {
    const active = await this.registry.getActive(channelId, sourceKey);
    if (!active) {
      warn(`[BOTTOM_PIN] Nenhum pin activo para refresh: ${sourceKey} em ${channelId}`);
      return null;
    }

    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      warn(`[BOTTOM_PIN] Canal inacessível em refresh: ${channelId}`);
      return null;
    }

    const message = await channel.messages.fetch(active.discord_msg_id).catch(() => null);
    if (!message) {
      warn(`[BOTTOM_PIN] Mensagem sumiu em refresh (${sourceKey}), a recriar.`);
      return this._postFresh(channelId, sourceKey, active.metadata || {});
    }

    const payload = await this._render(sourceKey);
    try {
      await message.edit({
        content: payload.content,
        embeds: payload.embeds || [],
        components: payload.components || [],
      });
      await this.registry.validate(active.discord_msg_id);
      return message;
    } catch (e) {
      if (e.code === 10008) {
        warn(`[BOTTOM_PIN] Unknown Message (10008) em refresh (${sourceKey}), a recriar.`);
        return this._postFresh(channelId, sourceKey, active.metadata || {});
      }
      throw e;
    }
  }

  /** Bump zero-flicker: envia nova, apaga antiga, actualiza registry. */
  async _executeBump(channelId, oldPin) {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased?.()) {
      warn(`[BOTTOM_PIN] Canal ${channelId} indisponível durante bump.`);
      return null;
    }

    const payload = await this._render(oldPin.source_key);
    const newMsg = await channel.send({
      content: payload.content,
      embeds: payload.embeds || [],
      components: payload.components || [],
      allowedMentions: payload.allowedMentions || { parse: [] },
    });

    // Apaga a anterior (best-effort)
    if (oldPin.discord_msg_id) {
      const oldMsg = await channel.messages.fetch(oldPin.discord_msg_id).catch(() => null);
      if (oldMsg) {
        await oldMsg
          .delete()
          .catch(err => warn(`[BOTTOM_PIN] Falha a apagar mensagem antiga ${oldPin.discord_msg_id}: ${err.message}`));
      }
    }

    // Regista a nova e marca a antiga como deleted
    await this.registry.register({
      discordMsgId: newMsg.id,
      channelId,
      guildId: newMsg.guild?.id || null,
      messageType: oldPin.message_type || 'panel',
      sourceKey: oldPin.source_key,
      ownerId: this.client.user?.id,
      metadata: oldPin.metadata || {},
    });
    await this.registry.markDeleted(oldPin.discord_msg_id);

    const key = `${channelId}:${oldPin.source_key}`;
    this.counters.set(key, 0);
    this.lastBumpAt.set(key, Date.now());

    log(`[BOTTOM_PIN] Bump executado: ${oldPin.source_key} em ${channelId} (msg ${newMsg.id}).`);
    return newMsg;
  }
}

module.exports = { BottomPinEngine, BUMP_THRESHOLD, BUMP_COOLDOWN_MS };
