'use strict';
const CONFIG = require('../config');
const { memberRepo } = require('../repositories');
const { query } = require('../db');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');
const { COLOR } = require('../shared/embedBuilders');
const { queueMemberOp } = require('../discordQueue');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const { ensureResidentChannelForMember } = require('../members/ensureResidentChannel');

function resolveEntryRole(tagRequest) {
  const isTropinha = String(tagRequest.request_type || '').toLowerCase() === 'tropinha';
  if (isTropinha) {
    return {
      requestType: 'tropinha',
      externalOnly: true,
      dbTier: null,
      roleId: CONFIG.TROPINHA_DI_ZONA_ROLE_ID || '1490397688800477215',
      roleLabel: 'Tropinha di Zona',
      reason: 'Onboarding: Tag Tropinha di Zona',
    };
  }

  const entryTier = CONFIG.BAIRRISTA_DEFAULT_TIER || 'young_blood';
  const entryRoleKey = `${entryTier.toUpperCase()}_ROLE_ID`;
  return {
    requestType: 'bairrista',
    externalOnly: false,
    dbTier: entryTier,
    roleId: CONFIG[entryRoleKey],
    roleLabel: entryTier,
    roleKey: entryRoleKey,
    reason: `Onboarding: tier ${entryTier}`,
  };
}

async function removeBairroRolesFromExternal(guildMember, reason) {
  const rolesToRemove = [
    CONFIG.BAIRRISTAS_BASE_ROLE_ID,
    CONFIG.YOUNG_BLOOD_ROLE_ID,
    CONFIG.O_GUNAO_ROLE_ID,
    CONFIG.GANGSTER_FODIDO_ROLE_ID,
  ].filter(Boolean);

  for (const roleId of rolesToRemove) {
    if (!guildMember.roles.cache.has(roleId)) continue;
    await queueMemberOp(() => guildMember.roles.remove(roleId, reason));
  }
}

async function processApproval(tagRequest, approverMember, client) {
  const guild = approverMember.guild;
  const discordId = tagRequest.discord_id;
  const fullName = tagRequest.full_name;
  const nickname = tagRequest.nickname;
  const displayNickname = `${fullName} (${nickname})`;
  const entry = resolveEntryRole(tagRequest);

  const result = {
    rolesAdded: false,
    nicknameSet: false,
    channelCreated: false,
    channelId: null,
    errors: [],
    entryRole: entry.roleLabel,
    requestType: entry.requestType,
  };

  const guildMember = await guild.members.fetch(discordId).catch(() => null);
  if (!guildMember) {
    warn(`[ONBOARDING] Membro ${discordId} não encontrado no servidor.`);
    return result;
  }

  try {
    if (entry.externalOnly) {
      await removeBairroRolesFromExternal(guildMember, 'Tropinha externo: remove tags internas do bairro');
    } else if (CONFIG.BAIRRISTAS_BASE_ROLE_ID) {
      await queueMemberOp(() =>
        guildMember.roles.add(CONFIG.BAIRRISTAS_BASE_ROLE_ID, 'Onboarding: role base Bairristas')
      );
    }

    if (entry.roleId) {
      await queueMemberOp(() => guildMember.roles.add(entry.roleId, entry.reason));
    } else {
      const missing = entry.roleKey || 'TROPINHA_DI_ZONA_ROLE_ID';
      warn(`[ONBOARDING] ${missing} não configurado — tag de entrada não foi atribuída.`);
      result.errors.push({ phase: 'roles', message: `${missing} não configurado` });
    }

    if (CONFIG.PENDENTE_ROLE_ID && guildMember.roles.cache.has(CONFIG.PENDENTE_ROLE_ID)) {
      await queueMemberOp(() =>
        guildMember.roles.remove(CONFIG.PENDENTE_ROLE_ID, 'Onboarding: tag aprovada, remove Pendente')
      );
    }
    result.rolesAdded = true;
    log(`[ONBOARDING] Role ${entry.roleLabel} aplicada a ${fullName} (${discordId}).`);
  } catch (e) {
    warn(`[ONBOARDING] Falha ao alterar roles: ${e.message}`);
    result.errors.push({ phase: 'roles', message: e.message });
  }

  if (!entry.externalOnly) {
    try {
      const { ensureInvariants } = require('../members/roleInvariants');
      await ensureInvariants(guildMember, { actor: approverMember.id, reason: 'Post-onboarding invariant check' });
    } catch (e) {
      warn(`[ONBOARDING] Invariant check falhou para ${discordId}: ${e.message}`);
    }
  }

  try {
    await queueMemberOp(() => guildMember.setNickname(displayNickname, 'Onboarding'));
    result.nicknameSet = true;
    log(`[ONBOARDING] Nickname de ${discordId} alterado para "${displayNickname}".`);
  } catch (e) {
    warn(`[ONBOARDING] Não foi possível mudar o nickname de ${discordId}: ${e.message}`);
    result.errors.push({ phase: 'nickname', message: e.message });
  }

  if (entry.externalOnly) {
    await query(
      `UPDATE tag_requests
          SET status = 'approved',
              approved_by = $1,
              resolved_at = NOW(),
              processed_at = NOW(),
              channel_create_failed = FALSE
        WHERE id = $2`,
      [approverMember.id, tagRequest.id]
    );

    await query(
      `UPDATE members
          SET role = 'externo',
              status = 'inativo',
              lifecycle_state = 'removed',
              lifecycle_changed_at = NOW(),
              lifecycle_changed_by = $2,
              lifecycle_notes = 'Tropinha externo: não pertence ao bairro',
              deleted_at = NOW(),
              updated_at = NOW()
        WHERE discord_id = $1
          AND deleted_at IS NULL
          AND coalesce(lifecycle_state::text, status, 'active') IN ('active','ativo','promoted')`,
      [discordId, approverMember.id]
    ).catch(e => warn(`[ONBOARDING] Falha ao marcar Tropinha como externo na DB: ${e.message}`));

    await logAudit({
      action: 'tag_request_approved_external',
      entityType: 'member',
      entityId: discordId,
      actorId: approverMember.id,
      actorName: approverMember.user.username,
      afterState: {
        fullName,
        nickname,
        entryRole: entry.roleLabel,
        requestType: entry.requestType,
        rolesAdded: result.rolesAdded,
      },
    });

    await sendAuditToChannel(client, {
      title: 'Tag aprovada',
      description: `<@${discordId}> recebeu **${entry.roleLabel}**.\nNome: **${fullName}** *(${nickname})*`,
      color: COLOR.SUCCESS,
    });

    metrics.membersOnboarded.inc();
    return result;
  }

  let dbMember = await memberRepo.findByDiscordId(discordId);
  if (!dbMember) {
    dbMember = await memberRepo.create({
      discordId,
      username: tagRequest.username || guildMember.user.username,
      displayName: fullName,
      role: 'bairrista',
    });
  }

  await query(
    `UPDATE members
        SET username = $1,
            full_name = $2,
            nickname = $3,
            display_name = $4,
            role = 'bairrista',
            tier = $5,
            status = 'ativo',
            lifecycle_state = 'active',
            lifecycle_changed_at = NOW(),
            lifecycle_changed_by = $6,
            lifecycle_notes = $7,
            deleted_at = NULL,
            channel_id = NULL,
            updated_at = NOW()
      WHERE id = $8`,
    [
      tagRequest.username || guildMember.user.username,
      fullName,
      nickname,
      fullName,
      entry.dbTier,
      approverMember.id,
      `Onboarding aprovado via Discord: ${entry.roleLabel}`,
      dbMember.id,
    ]
  );

  const freshMember = {
    ...dbMember,
    id: dbMember.id,
    discord_id: discordId,
    username: tagRequest.username || guildMember.user.username,
    full_name: fullName,
    nickname,
    display_name: fullName,
    role: 'bairrista',
    tier: entry.dbTier,
    status: 'ativo',
    lifecycle_state: 'active',
    deleted_at: null,
    channel_id: null,
  };

  try {
    const channelResult = await ensureResidentChannelForMember(guild, freshMember, {
      reason: 'Onboarding aprovado: criar canal individual de bairrista',
    });
    if (channelResult.created || channelResult.channelId) {
      result.channelCreated = Boolean(channelResult.created);
      result.channelId = channelResult.channelId || null;
    }
  } catch (e) {
    warn(`[ONBOARDING] Canal individual falhou para ${discordId}: ${e.message}`);
    result.errors.push({ phase: 'channel', message: e.message });
    await query(
      `UPDATE tag_requests
          SET channel_create_failed = TRUE
        WHERE id = $1`,
      [tagRequest.id]
    ).catch(() => {});
  }

  await query(
    `UPDATE tag_requests
        SET status = 'approved',
            approved_by = $1,
            resolved_at = NOW(),
            processed_at = NOW(),
            channel_create_failed = $3
      WHERE id = $2`,
    [approverMember.id, tagRequest.id, result.errors.some(e => e.phase === 'channel')]
  );

  await logAudit({
    action: 'tag_request_approved',
    entityType: 'member',
    entityId: discordId,
    actorId: approverMember.id,
    actorName: approverMember.user.username,
    afterState: {
      fullName,
      nickname,
      tier: entry.dbTier,
      entryRole: entry.roleLabel,
      requestType: entry.requestType,
      rolesAdded: result.rolesAdded,
      channelId: result.channelId,
    },
  });

  const { ONBOARDING } = require('../content');
  await sendAuditToChannel(client, {
    title: ONBOARDING.TAG_APPROVED_TITLE,
    description: `<@${discordId}> entrou com **${entry.roleLabel}**.\nNome: **${fullName}** *(${nickname})*${result.channelId ? `\nCanal: <#${result.channelId}>` : ''}`,
    color: COLOR.SUCCESS,
  });

  try {
    const { tryDmOrFallback } = require('../shared/dm');
    const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
    const guildName = guild.name || CONFIG.BOT_DISPLAY_NAME;
    const dmEmbed = applyLogo(
      brandEmbed('HOUSE')
        .setColor(COLOR.SUCCESS)
        .setTitle(ONBOARDING.DM_APPROVED_TITLE(fullName))
        .setDescription(ONBOARDING.DM_APPROVED_BODY(nickname, guildName, null))
    );
    const entradaChannel = CONFIG.PANEL_ENTRADA_CHANNEL_ID
      ? await client.channels.fetch(CONFIG.PANEL_ENTRADA_CHANNEL_ID).catch(() => null)
      : null;
    result.dmDelivery = await tryDmOrFallback({
      user: guildMember.user,
      payload: { embeds: [dmEmbed] },
      fallbackChannel: entradaChannel,
      fallbackMention: true,
    });
  } catch (e) {
    warn(`[ONBOARDING] DM approval falhou em ${discordId}: ${e.message}`);
    result.errors.push({ phase: 'dm', message: e.message });
  }

  metrics.membersOnboarded.inc();
  return result;
}

async function handlePromotionToOficial(member, client) {
  const discordId = member.id;
  const displayName = member.displayName || member.user.username;
  const dbMember = await memberRepo.findByDiscordId(discordId);
  if (!dbMember) return;

  await memberRepo.promote(dbMember.id, 'oficial', 'system', 'Promoção a Oficial via role Discord');
  await memberRepo.update(dbMember.id, { channel_id: null });

  await logAudit({
    action: 'member_promoted',
    entityType: 'member',
    entityId: discordId,
    actorId: 'system',
    beforeState: { role: dbMember.role },
    afterState: { role: 'oficial' },
  });

  const { EMOJI } = require('../content');
  await sendAuditToChannel(client, {
    title: `${EMOJI.LIDER} Subida — Bairrista → Oficial`,
    description: `<@${discordId}> sobe a **Oficial**.\n${displayName}`,
    color: COLOR.WARNING_SOFT,
  });
}

module.exports = { processApproval, handlePromotionToOficial, resolveEntryRole };
