'use strict';
const { memberRepo, memberLifecycleRepo } = require('../repositories');
const { handlePromotionToOficial } = require('../onboarding/onboardingEngine');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');
const { queueMemberOp, queueChannelOp } = require('../discordQueue');
const { log, warn } = require('../logger');
const eventBus = require('../core/eventBus');
const CONFIG = require('../config');

const ALLOWED_ROLES = Object.freeze(['bairrista', 'patrao_di_zona', 'oficial', 'chefia', 'inativo']);

function _roleToDiscordAddIds(dbRole, tier) {
  switch (dbRole) {
    case 'bairrista': {
      const tierRole = CONFIG[`${(tier || 'young_blood').toUpperCase()}_ROLE_ID`];
      const ids = [];
      if (CONFIG.BAIRRISTAS_BASE_ROLE_ID) ids.push(CONFIG.BAIRRISTAS_BASE_ROLE_ID);
      if (tierRole) ids.push(tierRole);
      return ids;
    }
    case 'patrao_di_zona':
      return CONFIG.PATRAO_DI_ZONA_ROLE_IDS.filter(Boolean);
    case 'oficial':
      return CONFIG.OFICIAL_ROLE_IDS.filter(Boolean);
    case 'chefia':
      return CONFIG.CHEFIA_ROLE_IDS.filter(Boolean);
    case 'inativo':
      return [];
    default:
      return [];
  }
}

function _allManagedRoleIds() {
  return [
    ...CONFIG.BAIRRISTA_TIER_ROLE_IDS,
    CONFIG.BAIRRISTAS_BASE_ROLE_ID,
    ...CONFIG.PATRAO_DI_ZONA_ROLE_IDS,
    ...CONFIG.OFICIAL_ROLE_IDS,
    ...CONFIG.CHEFIA_ROLE_IDS,
  ].filter(Boolean);
}

async function _updateDiscordRoles(guildMember, newDbRole, oldDbRole, tier) {
  if (!guildMember) return;
  const toAdd = _roleToDiscordAddIds(newDbRole, tier);
  const toRemove = _allManagedRoleIds().filter(id => !toAdd.includes(id));

  for (const id of toRemove) {
    if (guildMember.roles.cache.has(id)) {
      await queueMemberOp(() => guildMember.roles.remove(id, `Mudança de cargo: ${oldDbRole} → ${newDbRole}`));
    }
  }
  for (const id of toAdd) {
    if (!guildMember.roles.cache.has(id)) {
      await queueMemberOp(() => guildMember.roles.add(id, `Mudança de cargo: ${oldDbRole} → ${newDbRole}`));
    }
  }
}

async function _archiveBairristaChannel(guildMember, dbMember, client) {
  if (!dbMember.channel_id) return;
  const guild = guildMember.guild;
  const discordId = guildMember.id;
  const displayName = guildMember.displayName || guildMember.user?.username || dbMember.display_name;

  try {
    const channel = await guild.channels.fetch(dbMember.channel_id).catch(() => null);
    if (!channel) return;

    if (CONFIG.ARCHIVE_ON_PROMOTION) {
      if (CONFIG.BAIRRISTA_ARQUIVO_CATEGORY_ID) {
        await queueChannelOp(() => channel.setParent(CONFIG.BAIRRISTA_ARQUIVO_CATEGORY_ID, { lockPermissions: false }));
      }
      await queueChannelOp(() =>
        channel.permissionOverwrites.edit(discordId, {
          ViewChannel: false,
          SendMessages: false,
        })
      );
      const { query } = require('../db');
      await query(
        "UPDATE resident_channels SET status = 'archived', archived_at = NOW() WHERE channel_id = $1 AND status = 'active'",
        [dbMember.channel_id]
      );
      const { EMOJI } = require('../content');
      await channel
        .send({ content: `${EMOJI.AUDIT} Canal arquivado — ${displayName} subiu de cargo.` })
        .catch(() => {});
    } else if (CONFIG.DELETE_ON_PROMOTION) {
      await queueChannelOp(() => channel.delete(`Promoção de ${displayName}`));
      const { query } = require('../db');
      await query(
        "UPDATE resident_channels SET status = 'deleted', deleted_at = NOW() WHERE channel_id = $1 AND status = 'active'",
        [dbMember.channel_id]
      );
    }

    await memberRepo.update(dbMember.id, { channel_id: null });
  } catch (e) {
    warn(`[PROMOTION] Falha ao arquivar canal: ${e.message}`);
  }
}

async function _ensureBairristaChannel(guildMember, dbMember) {
  const guild = guildMember.guild;
  const discordId = guildMember.id;
  const tier = dbMember.tier || CONFIG.BAIRRISTA_DEFAULT_TIER || 'young_blood';
  const nickname = dbMember.nickname || dbMember.display_name || guildMember.displayName || guildMember.user?.username;
  const { query } = require('../db');

  // 1. Canal ativo já existe?
  if (dbMember.channel_id) {
    const channel = await guild.channels.fetch(dbMember.channel_id).catch(() => null);
    if (channel) {
      try {
        const { buildBairristaChannelOverwrites } = require('./channelInvariants');
        const botMember = guild.members.me;
        await queueChannelOp(() =>
          channel.permissionOverwrites.set(
            buildBairristaChannelOverwrites(guild, discordId, botMember.id),
            'Rebaixamento — restaurar permissões'
          )
        );
      } catch (e) {
        warn(`[DEMOTION] Falha a restaurar permissões do canal existente: ${e.message}`);
      }
      return;
    }
  }

  // 2. Tentar restaurar canal arquivado
  const archived = await query(
    `SELECT channel_id FROM resident_channels
      WHERE member_id = $1 AND status = 'archived'
      ORDER BY archived_at DESC LIMIT 1`,
    [dbMember.id]
  );
  if (archived.rows.length) {
    const archivedChannelId = archived.rows[0].channel_id;
    const channel = await guild.channels.fetch(archivedChannelId).catch(() => null);
    if (channel) {
      try {
        const { moveChannelToManagedCategory } = require('./createResidentChannel');
        const { buildBairristaChannelOverwrites } = require('./channelInvariants');
        const botMember = guild.members.me;
        await moveChannelToManagedCategory(guild, channel);
        await queueChannelOp(() =>
          channel.permissionOverwrites.set(
            buildBairristaChannelOverwrites(guild, discordId, botMember.id),
            'Rebaixamento — restaurar canal arquivado'
          )
        );
        await query("UPDATE resident_channels SET status = 'active', archived_at = NULL WHERE channel_id = $1", [
          archivedChannelId,
        ]);
        await memberRepo.update(dbMember.id, { channel_id: archivedChannelId });
        return;
      } catch (e) {
        warn(`[DEMOTION] Falha a restaurar canal arquivado: ${e.message}`);
      }
    }
  }

  // 3. Criar novo canal
  try {
    const { formatResidentChannelName } = require('../discord/structureTemplate');
    const { buildBairristaChannelOverwrites } = require('./channelInvariants');
    const { createResidentChannel } = require('./createResidentChannel');
    const { ChannelType } = require('discord.js');
    const botMember = guild.members.me;
    const channelName = formatResidentChannelName(tier, nickname);

    const { channel, categoryId } = await createResidentChannel(guild, {
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites: buildBairristaChannelOverwrites(guild, discordId, botMember.id),
      topic: `Canal individual de ${dbMember.display_name || nickname}`,
    });

    await memberRepo.update(dbMember.id, { channel_id: channel.id });
    await query(
      `INSERT INTO resident_channels (member_id, discord_id, channel_id, channel_name, category_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (channel_id) DO UPDATE SET status = 'active', deleted_at = NULL, archived_at = NULL`,
      [dbMember.id, discordId, channel.id, channelName, categoryId]
    );
  } catch (e) {
    warn(`[DEMOTION] Falha a criar canal: ${e.message}`);
  }
}

async function promoteToOficial(guildMember, client, promotedBy) {
  const discordId = guildMember.id;
  const dbMember = await memberRepo.findByDiscordId(discordId);
  if (!dbMember) return null;

  if (dbMember.role === 'oficial') return dbMember;

  await handlePromotionToOficial(guildMember, client);
  return await memberRepo.findByDiscordId(discordId);
}

async function promoteMember(memberId, newRole, opts = {}) {
  const { guildMember, client, reason = '', actorTag = 'system', actorId = 'system', changedBy = 'system' } = opts;
  if (!ALLOWED_ROLES.includes(newRole)) {
    throw new Error(`Cargo inválido: ${newRole}. Permitidos: ${ALLOWED_ROLES.join(', ')}`);
  }

  const dbMember = await memberRepo.findById(memberId);
  if (!dbMember) return null;
  if (dbMember.role === newRole) return dbMember;

  const oldRole = dbMember.role;
  const updated = await memberRepo.promote(memberId, newRole, changedBy, reason);
  if (!updated) return null;

  if (guildMember) {
    await _updateDiscordRoles(guildMember, newRole, oldRole, updated.tier);
  }

  if (oldRole === 'bairrista' && newRole !== 'bairrista' && guildMember) {
    await _archiveBairristaChannel(guildMember, dbMember, client);
  }

  try {
    await memberLifecycleRepo.transition({ memberId, newState: 'promoted', changedBy, reason });
  } catch (e) {
    warn(`[PROMOTION] Transição de lifecycle falhou: ${e.message}`);
  }

  eventBus
    .emitAsync('member.promoted', {
      memberId,
      discordId: dbMember.discord_id,
      displayName: dbMember.display_name,
      fromRole: oldRole,
      toRole: newRole,
      beforeState: { role: oldRole, tier: dbMember.tier },
      afterState: { role: newRole, tier: updated.tier },
      actorId,
      actorTag,
      reason,
      at: new Date(),
    })
    .catch(() => {});

  await logAudit({
    action: 'member_promoted',
    entityType: 'member',
    entityId: dbMember.discord_id,
    actorId,
    actorName: actorTag,
    beforeState: { role: oldRole, tier: dbMember.tier },
    afterState: { role: newRole, tier: updated.tier },
    context: reason,
  });

  if (client) {
    const { COLOR } = require('../shared/embedBuilders');
    await sendAuditToChannel(client, {
      title: '⬆️ Promoção',
      description: `<@${dbMember.discord_id}> promovido de **${oldRole}** para **${newRole}**${reason ? ` — ${reason}` : ''}`,
      color: COLOR.PROMOTION_GOLD,
    });
  }

  return updated;
}

async function demoteMember(memberId, newRole, opts = {}) {
  const { guildMember, client, reason = '', actorTag = 'system', actorId = 'system', changedBy = 'system' } = opts;
  if (!ALLOWED_ROLES.includes(newRole)) {
    throw new Error(`Cargo inválido: ${newRole}. Permitidos: ${ALLOWED_ROLES.join(', ')}`);
  }

  const dbMember = await memberRepo.findById(memberId);
  if (!dbMember) return null;
  if (dbMember.role === newRole) return dbMember;

  const oldRole = dbMember.role;
  const updated = await memberRepo.demote(memberId, newRole, changedBy, reason);
  if (!updated) return null;

  if (guildMember) {
    await _updateDiscordRoles(guildMember, newRole, oldRole, updated.tier);
  }

  if (newRole === 'bairrista' && guildMember) {
    await _ensureBairristaChannel(guildMember, updated);
  }

  try {
    await memberLifecycleRepo.transition({ memberId, newState: 'demoted', changedBy, reason });
  } catch (e) {
    warn(`[DEMOTION] Transição de lifecycle falhou: ${e.message}`);
  }

  eventBus
    .emitAsync('member.demoted', {
      memberId,
      discordId: dbMember.discord_id,
      displayName: dbMember.display_name,
      fromRole: oldRole,
      toRole: newRole,
      beforeState: { role: oldRole, tier: dbMember.tier },
      afterState: { role: newRole, tier: updated.tier },
      actorId,
      actorTag,
      reason,
      at: new Date(),
    })
    .catch(() => {});

  await logAudit({
    action: 'member_demoted',
    entityType: 'member',
    entityId: dbMember.discord_id,
    actorId,
    actorName: actorTag,
    beforeState: { role: oldRole, tier: dbMember.tier },
    afterState: { role: newRole, tier: updated.tier },
    context: reason,
  });

  if (client) {
    const { COLOR } = require('../shared/embedBuilders');
    await sendAuditToChannel(client, {
      title: '⬇️ Rebaixamento',
      description: `<@${dbMember.discord_id}> rebaixado de **${oldRole}** para **${newRole}**${reason ? ` — ${reason}` : ''}`,
      color: COLOR.WARNING_SOFT,
    });
  }

  return updated;
}

module.exports = { promoteToOficial, promoteMember, demoteMember };
