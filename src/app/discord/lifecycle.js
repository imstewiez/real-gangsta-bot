'use strict';
/**
 * Discord lifecycle handlers — member add/remove/update, message create.
 *
 * Separados do bootstrap para manter entry point limpo. Cada listener
 * tem try/catch próprio; erros não propagam para cima.
 */

const { Events } = require('discord.js');
const CONFIG = require('../../config');
const { log, warn, error } = require('../../logger');
const { onMessageCreate: stickyOnMessage } = require('../../sticky/stickyEngine');
const { handlePromotionToOficial } = require('../../onboarding/onboardingEngine');

function registerLifecycleListeners(client) {
  // ── Sticky messages — listener para modo `repost` ─────────────────────────
  client.on(Events.MessageCreate, async (message) => {
    try {
      await stickyOnMessage(client, message);
    } catch (e) {
      error(`[STICKY:listener] ${e.message}`);
    }
  });

  // ── Newcomer joins — auto-atribuir role Pendente ──────────────────────────
  // Pendente é o único role que vê boas-vindas; removido ao aprovar tag.
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      if (!CONFIG.AUTO_ASSIGN_PENDENTE) return;
      if (!CONFIG.PENDENTE_ROLE_ID) {
        warn('[MEMBER_ADD] AUTO_ASSIGN_PENDENTE=true mas PENDENTE_ROLE_ID não configurado.');
        return;
      }
      if (member.user.bot) return;
      await member.roles.add(CONFIG.PENDENTE_ROLE_ID, 'Newcomer — atribuir Pendente').catch(e => {
        warn(`[MEMBER_ADD] Falha ao dar Pendente a ${member.id}: ${e.message}`);
      });
      log(`[MEMBER_ADD] Pendente atribuído a ${member.displayName} (${member.id}).`);
    } catch (e) {
      error(`[MEMBER_ADD] ${e.message}`, e);
    }
  });

  // ── Member leaves — offboarding (arquivar/apagar canal + marcar inactivo) ─
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const { handleMemberLeave } = require('../../onboarding/offboardingEngine');
      await handleMemberLeave(member, client);
    } catch (e) {
      error(`[MEMBER_REMOVE] ${e.message}`, e);
    }
  });

  // ── Role change detection (onboarding/promotion) ──────────────────────────
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;

      // Detecta promoção a oficial (para arquivar canal individual)
      for (const oficialId of CONFIG.OFICIAL_ROLE_IDS) {
        if (!oldRoles.has(oficialId) && newRoles.has(oficialId)) {
          const wasBairrista = CONFIG.BAIRRISTA_TIER_ROLE_IDS.some(id => oldRoles.has(id));
          if (wasBairrista) {
            await handlePromotionToOficial(newMember, client);
            break;
          }
        }
      }
    } catch (e) {
      error(`[ROLE_UPDATE] Error processing ${newMember?.id}: ${e.message}`, e);
    }
  });
}

module.exports = { registerLifecycleListeners };
