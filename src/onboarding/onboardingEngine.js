'use strict';
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const CONFIG = require('../config');
const { memberRepo } = require('../repositories');
const { query } = require('../db');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');
const { welcomeChannelEmbed } = require('../shared/embedBuilders');
const { queueChannelOp, queueMemberOp } = require('../discordQueue');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const { buildMoradorChannelPanel } = require('./onboardingHandlers');

/**
 * Process an approved tag request:
 * 1. Add Moradores (base) + tier de entrada (O Gunão) roles
 * 2. Try to set nickname to "FullName (Nickname)"
 * 3. Create/update member in DB (tier=o_gunao por defeito)
 * 4. Create individual channel in GUETTO
 * 5. Send welcome panel in channel
 * 6. Enforce role invariants
 */
async function processApproval(tagRequest, approverMember, client) {
  const guild = approverMember.guild;
  const discordId = tagRequest.discord_id;
  const fullName = tagRequest.full_name;
  const nickname = tagRequest.nickname;
  const displayNickname = `${fullName} (${nickname})`;

  const result = { rolesAdded: false, nicknameSet: false, channelCreated: false, channelId: null };

  const guildMember = await guild.members.fetch(discordId).catch(() => null);
  if (!guildMember) {
    warn(`[ONBOARDING] Membro ${discordId} não encontrado no servidor.`);
    return result;
  }

  // ── 2. Add roles (Moradores base + tier de entrada) ────────────────────
  // O tier de entrada é resolvido por nome a partir de MORADOR_DEFAULT_TIER
  // para acompanhar mudanças de hierarquia sem editar o engine.
  const entryTier = CONFIG.MORADOR_DEFAULT_TIER || 'o_gunao';
  const entryRoleKey = `${entryTier.toUpperCase()}_ROLE_ID`;
  const entryRoleId = CONFIG[entryRoleKey];
  try {
    if (CONFIG.MORADORES_BASE_ROLE_ID) {
      await queueMemberOp(() => guildMember.roles.add(CONFIG.MORADORES_BASE_ROLE_ID, 'Onboarding: role base Moradores'));
    }
    if (entryRoleId) {
      await queueMemberOp(() => guildMember.roles.add(entryRoleId, `Onboarding: tier ${entryTier}`));
    } else {
      warn(`[ONBOARDING] ${entryRoleKey} não configurado — tier de entrada não foi atribuído.`);
    }
    result.rolesAdded = true;
    log(`[ONBOARDING] Roles adicionadas a ${fullName} (${discordId}).`);
  } catch (e) {
    warn(`[ONBOARDING] Falha ao adicionar roles: ${e.message}`);
  }

  // ── 2b. Enforce invariantes (uma vez aplicadas as roles) ───────────────
  try {
    const { ensureInvariants } = require('../members/roleInvariants');
    await ensureInvariants(guildMember, { actor: approverMember.id, reason: 'Post-onboarding invariant check' });
  } catch (e) {
    warn(`[ONBOARDING] Invariant check falhou para ${discordId}: ${e.message}`);
  }

  // ── 3. Set nickname ────────────────────────────────────────────────────
  try {
    await queueMemberOp(() => guildMember.setNickname(displayNickname, 'Onboarding'));
    result.nicknameSet = true;
    log(`[ONBOARDING] Nickname de ${discordId} alterado para "${displayNickname}".`);
  } catch (e) {
    warn(`[ONBOARDING] Não foi possível mudar o nickname de ${discordId}: ${e.message}`);
    // Continue — user said to proceed without nickname
  }

  // ── 4. Create/update member in DB ──────────────────────────────────────
  let dbMember = await memberRepo.findByDiscordId(discordId);
  if (!dbMember) {
    dbMember = await memberRepo.create({
      discordId,
      username: tagRequest.username || guildMember.user.username,
      displayName: fullName,
      role: 'morador',
    });
  }
  await query(
    'UPDATE members SET full_name = $1, nickname = $2, display_name = $3, tier = $4, updated_at = NOW() WHERE id = $5',
    [fullName, nickname, fullName, entryTier, dbMember.id]
  );

  // ── 5. Create individual channel ───────────────────────────────────────
  // Format: emoji・𝗧𝗶𝗲𝗿 - 𝗡𝗶𝗰𝗸 (mantido em sincronia em auto-promoção e
  // bulk-rename via /rg-sync-structure).
  const { formatResidentChannelName, TIER_LABEL } = require('../discord/structureTemplate');
  const channelName = formatResidentChannelName(entryTier, nickname);

  if (CONFIG.MORADOR_TOPICOS_CATEGORY_ID) {
    try {
      const botMember = guild.members.me;
      const permissionOverwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
      ];

      // Comando total (Manda-Chuva, Kingpin) — full control
      for (const roleId of CONFIG.COMMAND_ROLE_IDS) {
        permissionOverwrites.push({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels],
        });
      }
      // Supervisão (OG, Real Gangster) — read/write
      for (const roleId of CONFIG.SUPERVISOR_ROLE_IDS) {
        permissionOverwrites.push({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
      }
      // Patrão di Zona — gestão do GUETTO
      for (const roleId of CONFIG.CHEFE_MORADORES_ROLE_IDS) {
        permissionOverwrites.push({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
        });
      }

      const channel = await queueChannelOp(() => guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: CONFIG.MORADOR_TOPICOS_CATEGORY_ID,
        permissionOverwrites,
        topic: `Canal individual de ${fullName} (${nickname})`,
      }));

      await memberRepo.update(dbMember.id, { channel_id: channel.id });

      await query(
        `INSERT INTO resident_channels (member_id, discord_id, channel_id, channel_name, category_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [dbMember.id, discordId, channel.id, channelName, CONFIG.MORADOR_TOPICOS_CATEGORY_ID]
      );

      // Send welcome embed + enhanced panel
      const welcomeEmbed = welcomeChannelEmbed(fullName);
      const panelRows = buildMoradorChannelPanel();
      await channel.send({ embeds: [welcomeEmbed], components: panelRows });

      result.channelCreated = true;
      result.channelId = channel.id;
      metrics.membersOnboarded.inc();

      log(`[ONBOARDING] Canal "${channelName}" criado para ${fullName}.`);
    } catch (e) {
      warn(`[ONBOARDING] Falha ao criar canal para ${fullName}: ${e.message}`);
    }
  }

  // ── 6. Update tag request ──────────────────────────────────────────────
  await query(
    `UPDATE tag_requests SET status = 'approved', approved_by = $1, resolved_at = NOW() WHERE id = $2`,
    [approverMember.id, tagRequest.id]
  );

  // ── 7. Audit ───────────────────────────────────────────────────────────
  await logAudit({
    action: 'tag_request_approved',
    entityType: 'member',
    entityId: discordId,
    actorId: approverMember.id,
    actorName: approverMember.user.username,
    afterState: { fullName, nickname, channelId: result.channelId, rolesAdded: result.rolesAdded },
  });

  await sendAuditToChannel(client, {
    title: '\uD83C\uDFF7\uFE0F Novo Morador — Tag Aprovada',
    description: `<@${discordId}> entrou como **${TIER_LABEL[entryTier] || entryTier}** (tier 1)\nNome: **${fullName} (${nickname})**${result.channelCreated ? `\nCanal: <#${result.channelId}>` : ''}`,
    color: 0x2ECC71,
  });

  return result;
}

/**
 * Handle promotion to oficial — archive/delete morador channel
 */
async function handlePromotionToOficial(member, client) {
  const discordId = member.id;
  const displayName = member.displayName || member.user.username;
  const dbMember = await memberRepo.findByDiscordId(discordId);
  if (!dbMember) return;

  await memberRepo.promote(dbMember.id, 'oficial', 'system', 'Promoção a Oficial via role Discord');

  await logAudit({
    action: 'member_promoted', entityType: 'member', entityId: discordId,
    actorId: 'system', beforeState: { role: dbMember.role }, afterState: { role: 'oficial' },
  });

  if (!dbMember.channel_id) return;
  const guild = member.guild;

  if (CONFIG.ARCHIVE_ON_PROMOTION) {
    try {
      const channel = await guild.channels.fetch(dbMember.channel_id).catch(() => null);
      if (channel) {
        if (CONFIG.MORADOR_ARQUIVO_CATEGORY_ID) {
          await queueChannelOp(() => channel.setParent(CONFIG.MORADOR_ARQUIVO_CATEGORY_ID, { lockPermissions: false }));
        }
        await queueChannelOp(() => channel.permissionOverwrites.edit(discordId, {
          ViewChannel: false, SendMessages: false,
        }));
        await channel.send({ content: `Canal arquivado \u2014 ${displayName} foi promovido a Oficial.` });
        await query(
          `UPDATE resident_channels SET status = 'archived', archived_at = NOW() WHERE channel_id = $1 AND status = 'active'`,
          [dbMember.channel_id]
        );
      }
    } catch (e) {
      warn(`[ONBOARDING] Falha ao arquivar canal: ${e.message}`);
    }
  }

  if (CONFIG.DELETE_ON_PROMOTION && !CONFIG.ARCHIVE_ON_PROMOTION) {
    try {
      const channel = await guild.channels.fetch(dbMember.channel_id).catch(() => null);
      if (channel) {
        await queueChannelOp(() => channel.delete(`Promoção de ${displayName}`));
        await query(
          `UPDATE resident_channels SET status = 'deleted', deleted_at = NOW() WHERE channel_id = $1 AND status = 'active'`,
          [dbMember.channel_id]
        );
      }
    } catch (e) {
      warn(`[ONBOARDING] Falha ao apagar canal: ${e.message}`);
    }
  }

  await memberRepo.update(dbMember.id, { channel_id: null });

  await sendAuditToChannel(client, {
    title: 'Promoção \u2014 Morador \u2192 Oficial',
    description: `<@${discordId}> foi promovido a **Oficial**.`,
    color: 0xF39C12,
  });
}

module.exports = { processApproval, handlePromotionToOficial };
