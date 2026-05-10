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

  // ── Role change detection (promotion/demotion/tier) ───────────────────────
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      await _handleMemberRoleChange(oldMember, newMember, client);
    } catch (e) {
      error(`[ROLE_UPDATE] Error processing ${newMember?.id}: ${e.message}`, e);
    }
  });

  client.on(Events.Error, err => error('[DISCORD] Client error:', err));
  client.on(Events.ShardError, err => error('[DISCORD] Shard error:', err));
  client.on(Events.Invalidated, () => error('[DISCORD] Session invalidated'));
}

// ── Role resolution helpers ─────────────────────────────────────────────────

const ROLE_PRIORITY = Object.freeze({ chefia: 5, patrao_di_zona: 4, oficial: 3, bairrista: 2, inativo: 1 });

function _resolveRoleAndTier(guildMember) {
  const roles = guildMember.roles.cache;

  // Comando total
  if (CONFIG.COMMAND_ROLE_IDS.some(id => id && roles.has(id))) {
    return { role: 'chefia', tier: null };
  }
  // Supervisão
  if (CONFIG.SUPERVISOR_ROLE_IDS.some(id => id && roles.has(id))) {
    return { role: 'oficial', tier: null };
  }
  // Patrão di Zona
  if (CONFIG.PATRAO_DI_ZONA_ROLE_ID && roles.has(CONFIG.PATRAO_DI_ZONA_ROLE_ID)) {
    return { role: 'patrao_di_zona', tier: null };
  }
  // Bairrista (tier ou role base)
  const hasTier = CONFIG.BAIRRISTA_TIER_ROLE_IDS.some(id => id && roles.has(id));
  const hasBase = CONFIG.BAIRRISTAS_BASE_ROLE_ID && roles.has(CONFIG.BAIRRISTAS_BASE_ROLE_ID);
  if (hasTier || hasBase) {
    const TIER_PRIORITY = [
      { roleId: CONFIG.GANGSTER_FODIDO_ROLE_ID, tier: 'gangster_fodido' },
      { roleId: CONFIG.O_GUNAO_ROLE_ID, tier: 'o_gunao' },
      { roleId: CONFIG.YOUNG_BLOOD_ROLE_ID, tier: 'young_blood' },
    ];
    const current = TIER_PRIORITY.find(t => t.roleId && roles.has(t.roleId));
    return { role: 'bairrista', tier: current?.tier || CONFIG.BAIRRISTA_DEFAULT_TIER || 'young_blood' };
  }

  return { role: 'inativo', tier: null };
}

function _getRelevantRoleIds() {
  return [
    ...CONFIG.COMMAND_ROLE_IDS,
    ...CONFIG.SUPERVISOR_ROLE_IDS,
    CONFIG.PATRAO_DI_ZONA_ROLE_ID,
    ...CONFIG.BAIRRISTA_TIER_ROLE_IDS,
    CONFIG.BAIRRISTAS_BASE_ROLE_ID,
  ].filter(Boolean);
}

// ── Generic role change handler ─────────────────────────────────────────────

async function _handleMemberRoleChange(oldMember, newMember, client) {
  const relevantRoleIds = _getRelevantRoleIds();
  const roleChanged = relevantRoleIds.some(id => oldMember.roles.cache.has(id) !== newMember.roles.cache.has(id));
  if (!roleChanged) return;

  const { memberRepo } = require('../../repositories');
  const dbMember = await memberRepo.findByDiscordId(newMember.id);
  if (!dbMember) return;

  const { role: resolvedRole, tier: resolvedTier } = _resolveRoleAndTier(newMember);

  // ── 1. Role principal mudou → promoção / demotion ───────────────────────
  if (dbMember.role !== resolvedRole) {
    const { promoteMember, demoteMember } = require('../../members/promotionEngine');
    const isPromotion = (ROLE_PRIORITY[resolvedRole] || 0) > (ROLE_PRIORITY[dbMember.role] || 0);

    if (isPromotion) {
      await promoteMember(dbMember.id, resolvedRole, {
        guildMember: newMember,
        client,
        reason: 'Detetada mudança de role no Discord',
        actorTag: 'system',
        actorId: 'system',
        changedBy: 'system',
      });
      log(
        `[ROLE_UPDATE] Promoção automática: ${dbMember.display_name || newMember.id} ${dbMember.role} → ${resolvedRole}`
      );
    } else {
      await demoteMember(dbMember.id, resolvedRole, {
        guildMember: newMember,
        client,
        reason: 'Detetada mudança de role no Discord',
        actorTag: 'system',
        actorId: 'system',
        changedBy: 'system',
      });
      log(
        `[ROLE_UPDATE] Rebaixamento automático: ${dbMember.display_name || newMember.id} ${dbMember.role} → ${resolvedRole}`
      );
    }
    return;
  }

  // ── 2. Role igual mas tier mudou (só aplica a bairristas) ───────────────
  if (resolvedRole === 'bairrista' && dbMember.tier !== resolvedTier) {
    await _handleBairristaTierRoleChange(oldMember, newMember, resolvedTier);
  }
}

// ── Tier change within bairrista branch ─────────────────────────────────────

async function _handleBairristaTierRoleChange(oldMember, newMember, _resolvedTier) {
  const tierIds = CONFIG.BAIRRISTA_TIER_ROLE_IDS;
  const added = tierIds.some(id => id && !oldMember.roles.cache.has(id) && newMember.roles.cache.has(id));
  const removed = tierIds.some(id => id && oldMember.roles.cache.has(id) && !newMember.roles.cache.has(id));
  if (!added && !removed) return;

  // Tier actual = role mais alto presente (topo da hierarquia vence).
  const TIER_PRIORITY = [
    { roleId: CONFIG.GANGSTER_FODIDO_ROLE_ID, tier: 'gangster_fodido' },
    { roleId: CONFIG.O_GUNAO_ROLE_ID, tier: 'o_gunao' },
    { roleId: CONFIG.YOUNG_BLOOD_ROLE_ID, tier: 'young_blood' },
  ];
  const current = TIER_PRIORITY.find(t => t.roleId && newMember.roles.cache.has(t.roleId));
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
