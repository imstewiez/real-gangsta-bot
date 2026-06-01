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

// Debounce cache to ignore rapid successive role updates (e.g. webhook batch swaps)
const _recentRoleChanges = new Map();
const ROLE_CHANGE_DEBOUNCE_MS = 8000;

function _isDebounced(discordId) {
  const ts = _recentRoleChanges.get(discordId);
  if (!ts) return false;
  if (Date.now() - ts > ROLE_CHANGE_DEBOUNCE_MS) {
    _recentRoleChanges.delete(discordId);
    return false;
  }
  return true;
}

function _touchDebounce(discordId) {
  _recentRoleChanges.set(discordId, Date.now());
}

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

  // Chefia
  if (CONFIG.CHEFIA_ROLE_IDS.some(id => id && roles.has(id))) {
    const CHEFIA_TIERS = [
      { roleId: CONFIG.MANDA_CHUVA_ROLE_ID, tier: 'manda_chuva' },
      { roleId: CONFIG.KINGPIN_ROLE_ID, tier: 'kingpin' },
    ];
    const current = CHEFIA_TIERS.find(t => t.roleId && roles.has(t.roleId));
    return { role: 'chefia', tier: current?.tier || null };
  }

  // Oficial
  if (CONFIG.OFICIAL_ROLE_IDS.some(id => id && roles.has(id))) {
    const OFICIAL_TIERS = [
      { roleId: CONFIG.OG_ROLE_ID, tier: 'og' },
      { roleId: CONFIG.REAL_GANGSTER_ROLE_ID, tier: 'real_gangster' },
    ];
    const current = OFICIAL_TIERS.find(t => t.roleId && roles.has(t.roleId));
    return { role: 'oficial', tier: current?.tier || null };
  }

  // Patrão di Zona
  if (CONFIG.PATRAO_DI_ZONA_ROLE_IDS.some(id => id && roles.has(id))) {
    return { role: 'patrao_di_zona', tier: 'patrao_di_zona' };
  }

  // Bairrista só conta com cargo operacional/tier real.
  // A role base/friends nunca deve, sozinha, manter alguém como membro ativo.
  const BAIRRISTA_TIERS = [
    { roleId: CONFIG.GANGSTER_FODIDO_ROLE_ID, tier: 'gangster_fodido' },
    { roleId: CONFIG.O_GUNAO_ROLE_ID, tier: 'o_gunao' },
    { roleId: CONFIG.YOUNG_BLOOD_ROLE_ID, tier: 'young_blood' },
  ];
  const current = BAIRRISTA_TIERS.find(t => t.roleId && roles.has(t.roleId));
  if (current) {
    return { role: 'bairrista', tier: current.tier };
  }

  return { role: 'inativo', tier: null };
}

function _getRelevantRoleIds() {
  return [
    ...CONFIG.CHEFIA_ROLE_IDS,
    ...CONFIG.OFICIAL_ROLE_IDS,
    ...CONFIG.PATRAO_DI_ZONA_ROLE_IDS,
    ...CONFIG.BAIRRISTA_TIER_ROLE_IDS,
  ].filter(Boolean);
}

// ── Generic role change handler ─────────────────────────────────────────────

async function _handleMemberRoleChange(oldMember, newMember, client) {
  const relevantRoleIds = _getRelevantRoleIds();
  const roleChanged = relevantRoleIds.some(id => oldMember.roles.cache.has(id) !== newMember.roles.cache.has(id));
  if (!roleChanged) return;

  // Debounce: ignore rapid successive updates (webhook batch swaps, etc.)
  if (_isDebounced(newMember.id)) return;
  _touchDebounce(newMember.id);

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
        reason: resolvedRole === 'inativo' ? 'Perdeu todos os cargos operacionais da Ballas' : 'Detetada mudança de role no Discord',
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

  // ── 2. Role igual mas tier mudou ────────────────────────────────────────
  if (dbMember.role === resolvedRole && dbMember.tier !== resolvedTier) {
    await _handleTierRoleChange(oldMember, newMember, resolvedRole, resolvedTier);
  }
}

// ── Tier change handler (works for any role branch) ─────────────────────────

function _getTierPriorityForRole(role) {
  if (role === 'chefia') {
    return [
      { roleId: CONFIG.MANDA_CHUVA_ROLE_ID, tier: 'manda_chuva' },
      { roleId: CONFIG.KINGPIN_ROLE_ID, tier: 'kingpin' },
    ];
  }
  if (role === 'oficial') {
    return [
      { roleId: CONFIG.OG_ROLE_ID, tier: 'og' },
      { roleId: CONFIG.REAL_GANGSTER_ROLE_ID, tier: 'real_gangster' },
    ];
  }
  if (role === 'patrao_di_zona') {
    return [{ roleId: CONFIG.PATRAO_DI_ZONA_ROLE_ID, tier: 'patrao_di_zona' }];
  }
  if (role === 'bairrista') {
    return [
      { roleId: CONFIG.GANGSTER_FODIDO_ROLE_ID, tier: 'gangster_fodido' },
      { roleId: CONFIG.O_GUNAO_ROLE_ID, tier: 'o_gunao' },
      { roleId: CONFIG.YOUNG_BLOOD_ROLE_ID, tier: 'young_blood' },
    ];
  }
  return [];
}

async function _handleTierRoleChange(oldMember, newMember, resolvedRole, resolvedTier) {
  const tierIds = _getTierPriorityForRole(resolvedRole)
    .map(t => t.roleId)
    .filter(Boolean);
  const added = tierIds.some(id => id && !oldMember.roles.cache.has(id) && newMember.roles.cache.has(id));
  const removed = tierIds.some(id => id && oldMember.roles.cache.has(id) && !newMember.roles.cache.has(id));
  if (!added && !removed) return;

  // Tier actual = role mais alto presente (topo da hierarquia vence).
  const tierPriority = _getTierPriorityForRole(resolvedRole);
  const current = tierPriority.find(t => t.roleId && newMember.roles.cache.has(t.roleId));
  if (!current) return; // Ficou sem tier role — já foi tratado como saída do ramo

  const { memberRepo } = require('../../repositories');
  const dbMember = await memberRepo.findByDiscordId(newMember.id);
  if (!dbMember) return;
  if (dbMember.tier === current.tier) return; // Já sincronizado

  const fromTier = dbMember.tier;
  await memberRepo.update(dbMember.id, { tier: current.tier });
  log(`[ROLE_UPDATE] Tier change ${dbMember.display_name}: ${fromTier} → ${current.tier}`);

  // Renomear canal individual se existir (apenas para bairristas)
  if (dbMember.channel_id && resolvedRole === 'bairrista') {
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
