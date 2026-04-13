'use strict';
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const CONFIG = require('../config');
const { memberRepo } = require('../repositories');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');
const { welcomeChannelEmbed } = require('../shared/embedBuilders');
const { queueChannelOp } = require('../discordQueue');
const { log, warn } = require('../logger');
const metrics = require('../lib/metrics');
const { buildMoradorWelcomeButtons } = require('./onboardingHandlers');

async function handleMoradorRoleAdded(member, client) {
  const discordId = member.id;
  const displayName = member.displayName || member.user.username;
  const username = member.user.username;

  let dbMember = await memberRepo.findByDiscordId(discordId);

  if (dbMember && dbMember.channel_id) {
    log(`[ONBOARDING] Membro ${displayName} já tem canal. A saltar.`);
    return;
  }

  if (!dbMember) {
    dbMember = await memberRepo.create({
      discordId,
      username,
      displayName,
      role: 'morador',
    });
    log(`[ONBOARDING] Membro ${displayName} registado na DB.`);
  }

  const channelName = `morador-${displayName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 80)}`;

  if (!CONFIG.MORADOR_TOPICOS_CATEGORY_ID) {
    warn('[ONBOARDING] MORADOR_TOPICOS_CATEGORY_ID não configurado. Canal não criado.');
    return;
  }

  const guild = member.guild;
  const botMember = guild.members.me;

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: discordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];

  if (CONFIG.CHEFE_MORADORES_ROLE_ID) {
    permissionOverwrites.push({
      id: CONFIG.CHEFE_MORADORES_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }
  if (CONFIG.CHEFIA_ROLE_ID) {
    permissionOverwrites.push({
      id: CONFIG.CHEFIA_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels],
    });
  }

  try {
    const channel = await queueChannelOp(() => guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: CONFIG.MORADOR_TOPICOS_CATEGORY_ID,
      permissionOverwrites,
      topic: `Canal individual de ${displayName} — entregas, vendas, histórico`,
    }));

    await memberRepo.update(dbMember.id, { channel_id: channel.id });

    const { query } = require('../db');
    await query(
      `INSERT INTO resident_channels (member_id, discord_id, channel_id, channel_name, category_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [dbMember.id, discordId, channel.id, channelName, CONFIG.MORADOR_TOPICOS_CATEGORY_ID]
    );

    const welcomeEmbed = welcomeChannelEmbed(displayName);
    const buttons = buildMoradorWelcomeButtons();
    await channel.send({ embeds: [welcomeEmbed], components: [buttons] });

    metrics.membersOnboarded.inc();

    await logAudit({
      action: 'morador_channel_created',
      entityType: 'member',
      entityId: discordId,
      actorId: 'system',
      actorName: 'Real Gangsta Bot',
      afterState: { channelId: channel.id, channelName },
      context: 'Onboarding automático',
    });

    await sendAuditToChannel(client, {
      title: 'Novo Morador — Canal Criado',
      description: `<@${discordId}> recebeu a tag de Morador.\nCanal: <#${channel.id}>`,
      color: 0x2ECC71,
    });

    log(`[ONBOARDING] Canal ${channelName} criado para ${displayName}.`);
  } catch (e) {
    warn(`[ONBOARDING] Falha ao criar canal para ${displayName}: ${e.message}`);
  }
}

async function handlePromotionToOficial(member, client) {
  const discordId = member.id;
  const displayName = member.displayName || member.user.username;
  const dbMember = await memberRepo.findByDiscordId(discordId);
  if (!dbMember) return;

  const promoted = await memberRepo.promote(dbMember.id, 'oficial', 'system', 'Promoção a Oficial via role Discord');

  await logAudit({
    action: 'member_promoted',
    entityType: 'member',
    entityId: discordId,
    actorId: 'system',
    actorName: 'Real Gangsta Bot',
    beforeState: { role: dbMember.role },
    afterState: { role: 'oficial' },
    context: 'Promoção Morador → Oficial',
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
          ViewChannel: false,
          SendMessages: false,
        }));

        await channel.send({ content: `Canal arquivado — ${displayName} foi promovido a Oficial.` });

        const { query } = require('../db');
        await query(
          `UPDATE resident_channels SET status = 'archived', archived_at = NOW()
           WHERE channel_id = $1 AND status = 'active'`,
          [dbMember.channel_id]
        );

        log(`[ONBOARDING] Canal de ${displayName} arquivado.`);
      }
    } catch (e) {
      warn(`[ONBOARDING] Falha ao arquivar canal de ${displayName}: ${e.message}`);
    }
  }

  if (CONFIG.DELETE_ON_PROMOTION && !CONFIG.ARCHIVE_ON_PROMOTION) {
    try {
      const channel = await guild.channels.fetch(dbMember.channel_id).catch(() => null);
      if (channel) {
        await queueChannelOp(() => channel.delete(`Promoção de ${displayName} a Oficial`));

        const { query } = require('../db');
        await query(
          `UPDATE resident_channels SET status = 'deleted', deleted_at = NOW()
           WHERE channel_id = $1 AND status = 'active'`,
          [dbMember.channel_id]
        );

        log(`[ONBOARDING] Canal de ${displayName} apagado.`);
      }
    } catch (e) {
      warn(`[ONBOARDING] Falha ao apagar canal de ${displayName}: ${e.message}`);
    }
  }

  await memberRepo.update(dbMember.id, { channel_id: null });

  await sendAuditToChannel(client, {
    title: 'Promoção — Morador → Oficial',
    description: `<@${discordId}> foi promovido a **Oficial**.\nCanal individual ${CONFIG.ARCHIVE_ON_PROMOTION ? 'arquivado' : 'removido'}.`,
    color: 0xF39C12,
  });
}

module.exports = { handleMoradorRoleAdded, handlePromotionToOficial };
