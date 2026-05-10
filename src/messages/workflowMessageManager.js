'use strict';
/**
 * WORKFLOW MESSAGE MANAGER
 *
 * Gere TODAS as mensagens produzidas durante workflows multi-step.
 *
 * Princípios:
 *   1. UMA mensagem por workflow por utilizador. Todos os steps editam a mesma mensagem.
 *   2. Se um workflow expira, a mensagem é limpa (apagada ou bloqueada).
 *   3. Um utilizador só pode ter UM workflow activo de cada tipo.
 *   4. Iniciar um novo workflow do mesmo tipo cancela o anterior.
 *   5. Todas as mensagens de workflow são rastreadas no registry.
 */

const { MessageFlags, ActionRowBuilder } = require('discord.js');
const { MessageRegistryRepo } = require('../repositories/messageRegistry');
const { log, warn } = require('../logger');

// Timeout por tipo de workflow (ms)
const WORKFLOW_TIMEOUTS = {
  saida_creation: 300000,
  saida_settlement: 600000,
  cart_checkout: 300000,
  delivery_approval: 300000,
  onboarding: 600000,
  default: 300000,
};

// Tracker activo: Map<ownerId, Map<workflowType, { messageId, channelId, timeoutId }>>
const _activeWorkflows = new Map();

class WorkflowMessageManager {
  constructor(deps) {
    this.client = deps.client;
    this.registry = new MessageRegistryRepo();
  }

  /**
   * Inicia um novo workflow. Cancela qualquer workflow do mesmo tipo para este utilizador.
   */
  async start({ workflowType, ownerId, interaction, initialPayload, visibility = 'EPHEMERAL' }) {
    await this.cancel(ownerId, workflowType);

    let message;
    const ephemeral = visibility === 'EPHEMERAL' || visibility === 'CHANNEL_PRIVATE';

    if (interaction.replied || interaction.deferred) {
      message = await interaction.editReply({
        ...initialPayload,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    } else {
      message = await interaction.reply({
        ...initialPayload,
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
        fetchReply: true,
      });
    }

    const timeoutMs = WORKFLOW_TIMEOUTS[workflowType] || WORKFLOW_TIMEOUTS.default;
    await this.registry.register({
      discordMsgId: message.id,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      messageType: 'workflow',
      sourceKey: `workflow:${workflowType}:${ownerId}`,
      ownerId,
      expiresAt: new Date(Date.now() + timeoutMs),
      metadata: { workflowType, visibility, step: 1 },
    });

    const timeoutId = setTimeout(() => this._onTimeout(ownerId, workflowType), timeoutMs);
    this._trackWorkflow(ownerId, workflowType, message.id, interaction.channelId, timeoutId);

    log(`[Workflow] Started ${workflowType} for ${ownerId}, msg ${message.id}`);
    return message;
  }

  /**
   * Avança o workflow para o próximo step. Edita a MESMA mensagem.
   */
  async step({ workflowType, ownerId, interaction, payload, stepNumber }) {
    const workflow = this._getWorkflow(ownerId, workflowType);
    if (!workflow) {
      throw new Error('WORKFLOW_EXPIRED');
    }

    let message;
    if (interaction.replied || interaction.deferred) {
      message = await interaction.editReply(payload);
    } else {
      message = await interaction.update(payload);
    }

    // Actualizar metadata no registry
    try {
      const { query } = require('../db');
      await query(
        'UPDATE bot_messages SET metadata = jsonb_set(metadata, \'{step}\', $1::jsonb) WHERE discord_msg_id = $2',
        [JSON.stringify(stepNumber), message.id]
      );
    } catch (e) {
      warn(`[Workflow] Metadata update failed: ${e.message}`);
    }

    return message;
  }

  /**
   * Completa um workflow. Limpa o tracking.
   */
  async complete(ownerId, workflowType, finalPayload = null) {
    const workflow = this._getWorkflow(ownerId, workflowType);
    if (!workflow) return;

    if (finalPayload) {
      try {
        const channel = await this.client.channels.fetch(workflow.channelId).catch(() => null);
        if (channel) {
          const message = await channel.messages.fetch(workflow.messageId).catch(() => null);
          if (message) await message.edit(finalPayload);
        }
      } catch (e) {
        /* non-critical */
      }
    }

    this._clearWorkflow(ownerId, workflowType);
    log(`[Workflow] Completed ${workflowType} for ${ownerId}`);
  }

  /**
   * Cancela um workflow. Apaga a mensagem e limpa.
   */
  async cancel(ownerId, workflowType) {
    const workflow = this._getWorkflow(ownerId, workflowType);
    if (!workflow) return;

    try {
      const channel = await this.client.channels.fetch(workflow.channelId).catch(() => null);
      if (channel) {
        const message = await channel.messages.fetch(workflow.messageId).catch(() => null);
        if (message) await message.delete();
      }
    } catch (e) {
      /* message might already be gone */
    }

    await this.registry.markDeleted(workflow.messageId);
    this._clearWorkflow(ownerId, workflowType);
    log(`[Workflow] Cancelled ${workflowType} for ${ownerId}`);
  }

  /**
   * Cancela TODOS os workflows de um utilizador.
   */
  async cancelAllForUser(ownerId) {
    const userWorkflows = _activeWorkflows.get(ownerId);
    if (!userWorkflows) return;

    for (const type of [...userWorkflows.keys()]) {
      await this.cancel(ownerId, type);
    }
    _activeWorkflows.delete(ownerId);
    log(`[Workflow] Cancelled all workflows for ${ownerId}`);
  }

  isActive(ownerId, workflowType) {
    return _activeWorkflows.get(ownerId)?.has(workflowType) ?? false;
  }

  getActiveCount() {
    let count = 0;
    for (const userMap of _activeWorkflows.values()) {
      count += userMap.size;
    }
    return count;
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  _trackWorkflow(ownerId, workflowType, messageId, channelId, timeoutId) {
    if (!_activeWorkflows.has(ownerId)) {
      _activeWorkflows.set(ownerId, new Map());
    }
    _activeWorkflows.get(ownerId).set(workflowType, { messageId, channelId, timeoutId });
  }

  _getWorkflow(ownerId, workflowType) {
    return _activeWorkflows.get(ownerId)?.get(workflowType) ?? null;
  }

  _clearWorkflow(ownerId, workflowType) {
    const userMap = _activeWorkflows.get(ownerId);
    if (!userMap) return;
    const wf = userMap.get(workflowType);
    if (wf?.timeoutId) clearTimeout(wf.timeoutId);
    userMap.delete(workflowType);
    if (userMap.size === 0) _activeWorkflows.delete(ownerId);
  }

  async _onTimeout(ownerId, workflowType) {
    const workflow = this._getWorkflow(ownerId, workflowType);
    if (!workflow) return;

    try {
      const entry = await this.registry.getActive(workflow.channelId, `workflow:${workflowType}:${ownerId}`);
      const visibility = entry?.metadata?.visibility || 'EPHEMERAL';

      if (visibility === 'CHANNEL_PUBLIC') {
        // Bloqueia componentes (não apaga — mensagem pública)
        const channel = await this.client.channels.fetch(workflow.channelId).catch(() => null);
        if (channel) {
          const message = await channel.messages.fetch(workflow.messageId).catch(() => null);
          if (message) {
            const disabled =
              message.components?.map(row => {
                const newRow = ActionRowBuilder.from(row);
                newRow.components.forEach(c => c.setDisabled(true));
                return newRow;
              }) || [];
            await message.edit({ content: '_Workflow expirado._', components: disabled });
          }
        }
      } else {
        // EPHEMERAL / CHANNEL_PRIVATE → apaga
        const channel = await this.client.channels.fetch(workflow.channelId).catch(() => null);
        if (channel) {
          const message = await channel.messages.fetch(workflow.messageId).catch(() => null);
          if (message) await message.delete();
        }
      }
    } catch (e) {
      /* non-critical */
    }

    await this.registry.markDeleted(workflow.messageId);
    this._clearWorkflow(ownerId, workflowType);
    log(`[Workflow] Timed out ${workflowType} for ${ownerId}`);
  }
}

module.exports = { WorkflowMessageManager, WORKFLOW_TIMEOUTS };
