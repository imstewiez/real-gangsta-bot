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
const eventBus = require('../../core/eventBus');

function registerLifecycleListeners(client) {
  // ── Sticky messages — listener para modo `repost` ─────────────────────────
  client.on(Events.MessageCreate, async message => {
    try {
      await stickyOnMessage(client, message);
    } catch (e) {
      error(`[STICKY:listener] ${e.message}`);
    }
  });

  // ── Newcomer joins — auto-atribuir role Pendente ──────────────────────────
  // Pendente é o único role que vê boas-vindas; removido ao aprovar tag.
  client.on(Events.GuildMemberAdd, async member => {
    try {
      if (member.user.bot) return;
      if (CONFIG.AUTO_ASSIGN_PENDENTE && CONFIG.PENDENTE_ROLE_ID) {
        await member.roles.add(CONFIG.PENDENTE_ROLE_ID, 'Newcomer — atribuir Pendente').catch(e => {
          warn(`[MEMBER_ADD] Falha ao dar Pendente a ${member.id}: ${e.message}`);
        });
        log(`[MEMBER_ADD] Pendente atribuído a ${member.displayName} (${member.id}).`);
      } else if (CONFIG.AUTO_ASSIGN_PENDENTE) {
        warn('[MEMBER_ADD] AUTO_ASSIGN_PENDENTE=true mas PENDENTE_ROLE_ID não configurado.');
      }

      // Event — vida da org
      eventBus
        .emitAsync('member.joined', {
          discordId: member.id,
          displayName: member.displayName || member.user.username,
          at: new Date(),
        })
        .catch(() => {});
    } catch (e) {
      error(`[MEMBER_ADD] ${e.message}`, e);
    }
  });

  // ── Member leaves — offboarding (arquivar/apagar canal + marcar inactivo) ─
  client.on(Events.GuildMemberRemove, async member => {
    try {
      const { handleMemberLeave } = require('../../onboarding/offboardingEngine');
      await handleMemberLeave(member, client);

      // Event — vida da org
      eventBus
        .emitAsync('member.left', {
          discordId: member.id,
          displayName: member.displayName || member.user?.username || 'Desconhecido',
          at: new Date(),
        })
        .catch(() => {});
    } catch (e) {
      error(`[MEMBER_REMOVE] ${e.message}`, e);
    }
  });

  // ── Role change detection (onboarding/promotion) ──────────────────────────
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;

      // 1. Detecta promoção a oficial (para arquivar canal individual)
      let promotedToOficial = false;
      for (const oficialId of CONFIG.OFICIAL_ROLE_IDS) {
        if (!oldRoles.has(oficialId) && newRoles.has(oficialId)) {
          const wasBairrista = CONFIG.BAIRRISTA_TIER_ROLE_IDS.some(id => oldRoles.has(id));
          if (wasBairrista) {
            await handlePromotionToOficial(newMember, client);
            promotedToOficial = true;
            break;
          }
        }
      }
      if (promotedToOficial) return;

      // 2. Detecta tier change dentro do ramo bairrista (admin mete/tira role)
      await _handleBairristaTierRoleChange(oldMember, newMember);
    } catch (e) {
      error(`[ROLE_UPDATE] Error processing ${newMember?.id}: ${e.message}`, e);
    }
  });
}

/**
 * Detecta promoções manuais dentro do ramo bairrista (young_blood → o_gunao
 * → gangster_fodido) via role Discord. Sincroniza DB + renomeia canal +
 * dispara projecção sheet.
 *
 * Complementa o autoPromotionEngine (threshold de material) — este handler
 * cobre admin a meter o role à mão no Discord.
 */
async function _handleBairristaTierRoleChange(oldMember, newMember) {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;
  const tierIds = CONFIG.BAIRRISTA_TIER_ROLE_IDS;

  const added = tierIds.some(id => id && !oldRoles.has(id) && newRoles.has(id));
  const removed = tierIds.some(id => id && oldRoles.has(id) && !newRoles.has(id));
  if (!added && !removed) return;

  // Tier actual = role mais alto presente (topo da hierarquia vence).
  const TIER_PRIORITY = [
    { roleId: CONFIG.GANGSTER_FODIDO_ROLE_ID, tier: 'gangster_fodido' },
    { roleId: CONFIG.O_GUNAO_ROLE_ID, tier: 'o_gunao' },
    { roleId: CONFIG.YOUNG_BLOOD_ROLE_ID, tier: 'young_blood' },
  ];
  const current = TIER_PRIORITY.find(t => t.roleId && newRoles.has(t.roleId));
  if (!current) return; // Ficou sem tier role — não é tier change, é saída do ramo

  const { memberRepo } = require('../../repositories');
  const dbMember = await memberRepo.findByDiscordId(newMember.id);
  if (!dbMember) return;
  if (dbMember.tier === current.tier) return; // Já sincronizado

  const fromTier = dbMember.tier;
  await memberRepo.update(dbMember.id, { tier: current.tier });
  log(`[ROLE_UPDATE] Tier change ${dbMember.display_name}: ${fromTier} → ${current.tier}`);

  // Renomear canal individual se existir
  if (dbMember.channel_id) {
    try {
      const { formatResidentChannelName } = require('../../discord/structureTemplate');
      const { queueChannelOp } = require('../../discordQueue');
      const channel = await newMember.guild.channels.fetch(dbMember.channel_id).catch(() => null);
      if (channel) {
        const newName = formatResidentChannelName(current.tier, dbMember.nickname || dbMember.display_name);
        if (channel.name !== newName) {
          await queueChannelOp(() => channel.setName(newName, `Tier change: ${fromTier} → ${current.tier}`));
        }
      }
    } catch (e) {
      warn(`[ROLE_UPDATE] Rename canal falha ${dbMember.display_name}: ${e.message}`);
    }
  }

  // Dispara projecção sheet (membros + resumo + dashboard)
  eventBus
    .emitAsync('member.tier_changed', {
      discordId: newMember.id,
      memberId: dbMember.id,
      displayName: dbMember.display_name,
      from: fromTier,
      to: current.tier,
      at: new Date(),
    })
    .catch(() => {});
}

module.exports = { registerLifecycleListeners };
