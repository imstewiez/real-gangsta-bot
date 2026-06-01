'use strict';
const CONFIG = require('../config');
const { memberRepo } = require('../repositories');
const { query } = require('../db');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');
const { COLOR } = require('../shared/embedBuilders');
const { queueMemberOp } = require('../discordQueue');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');

/**
 * Process an approved tag request after the webapp migration.
 *
 * Discord owns only Discord-native onboarding:
 * 1. Add base/tier roles and remove Pendente.
 * 2. Set Discord nickname when possible.
 * 3. Upsert/reactivate member row in DB.
 * 4. Mark tag request approved.
 * 5. Audit + notify user.
 *
 * The bot no longer creates individual channels, bairrista panels, topic
 * backfills, inventory panels, rankings or dashboard surfaces. Those belong to
 * the webapp or were intentionally removed.
 */
async function processApproval(tagRequest, approverMember, client) {
  const guild = approverMember.guild;
  const discordId = tagRequest.discord_id;
  const fullName = tagRequest.full_name;
  const nickname = tagRequest.nickname;
  const displayNickname = `${fullName} (${nickname})`;

  const result = {
    rolesAdded: false,
    nicknameSet: false,
    channelCreated: false,
    channelId: null,
    errors: [],
  };

  const guildMember = await guild.members.fetch(discordId).catch(() => null);
  if (!guildMember) {
    warn(`[ONBOARDING] Membro ${discordId} não encontrado no servidor.`);
    return result;
  }

  const entryTier = CONFIG.BAIRRISTA_DEFAULT_TIER || 'young_blood';
  const entryRoleKey = `${entryTier.toUpperCase()}_ROLE_ID`;
  const entryRoleId = CONFIG[entryRoleKey];

  try {
    if (CONFIG.BAIRRISTAS_BASE_ROLE_ID) {
      await queueMemberOp(() =>
        guildMember.roles.add(CONFIG.BAIRRISTAS_BASE_ROLE_ID, 'Onboarding: role base Bairristas')
      );
    }
    if (entryRoleId) {
      await queueMemberOp(() => guildMember.roles.add(entryRoleId, `Onboarding: tier ${entryTier}`));
    } else {
      warn(`[ONBOARDING] ${entryRoleKey} não configurado — tier de entrada não foi atribuído.`);
      result.errors.push({ phase: 'roles', message: `${entryRoleKey} não configurado` });
    }
    if (CONFIG.PENDENTE_ROLE_ID && guildMember.roles.cache.has(CONFIG.PENDENTE_ROLE_ID)) {
      await queueMemberOp(() =>
        guildMember.roles.remove(CONFIG.PENDENTE_ROLE_ID, 'Onboarding: tag aprovada, remove Pendente')
      );
    }
    result.rolesAdded = true;
    log(`[ONBOARDING] Roles aplicadas a ${fullName} (${discordId}).`);
  } catch (e) {
    warn(`[ONBOARDING] Falha ao adicionar roles: ${e.message}`);
    result.errors.push({ phase: 'roles', message: e.message });
  }

  try {
    const { ensureInvariants } = require('../members/roleInvariants');
    await ensureInvariants(guildMember, { actor: approverMember.id, reason: 'Post-onboarding invariant check' });
  } catch (e) {
    warn(`[ONBOARDING] Invariant check falhou para ${discordId}: ${e.message}`);
  }

  try {
    await queueMemberOp(() => guildMember.setNickname(displayNickname, 'Onboarding'));
    result.nicknameSet = true;
    log(`[ONBOARDING] Nickname de ${discordId} alterado para "${displayNickname}".`);
  } catch (e) {
    warn(`[ONBOARDING] Não foi possível mudar o nickname de ${discordId}: ${e.message}`);
    result.errors.push({ phase: 'nickname', message: e.message });
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
            lifecycle_notes = 'Onboarding aprovado via Discord',
            deleted_at = NULL,
            channel_id = NULL,
            updated_at = NOW()
      WHERE id = $7`,
    [tagRequest.username || guildMember.user.username, fullName, nickname, fullName, entryTier, approverMember.id, dbMember.id]
  );

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

  await logAudit({
    action: 'tag_request_approved',
    entityType: 'member',
    entityId: discordId,
    actorId: approverMember.id,
    actorName: approverMember.user.username,
    afterState: { fullName, nickname, tier: entryTier, rolesAdded: result.rolesAdded },
  });

  const { ONBOARDING } = require('../content');
  await sendAuditToChannel(client, {
    title: ONBOARDING.TAG_APPROVED_TITLE,
    description: `<@${discordId}> entrou como **${entryTier}**.\nNome: **${fullName}** *(${nickname})*`,
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

module.exports = { processApproval, handlePromotionToOficial };
