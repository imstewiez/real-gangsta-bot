'use strict';
/**
 * /backfill-topicos — cria tópicos em falta para bairristas activos.
 *
 * Encontra bairristas que:
 *   - members.role = 'bairrista' AND members.status = 'ativo'
 *   - NÃO têm entry em resident_channels com status IN ('active','archived')
 *
 * Para cada um: cria canal de texto em BAIRRISTA_TOPICOS_CATEGORY_ID com
 * permissões via buildBairristaChannelOverwrites, INSERT em resident_channels,
 * UPDATE members.channel_id, e posta welcome embed + painel.
 *
 * Chefia-only. Idempotente — correr 2× não duplica (query filtra os que já têm).
 *
 * Padrão UX:
 *   - Sem opção `executar` = dry-run (lista quem falta, não cria nada)
 *   - Com `executar:true` = cria de facto
 */

const { ChannelType, MessageFlags } = require('discord.js');
const { query } = require('../db');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, welcomeChannelEmbed } = require('../shared/embedBuilders');
const { EMOJI, ERRORS } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { queueChannelOp } = require('../discordQueue');
const { formatResidentChannelName } = require('../discord/structureTemplate');
const { buildBairristaChannelOverwrites } = require('../members/channelInvariants');
const { buildBairristaChannelPanel } = require('../onboarding/onboardingHandlers');
const memberRepo = require('../repositories/member');

async function _findMissing() {
  const res = await query(
    `SELECT m.id, m.discord_id, m.display_name, m.nickname, m.tier
       FROM members m
       LEFT JOIN resident_channels rc
         ON rc.member_id = m.id
        AND rc.status IN ('active', 'archived')
      WHERE m.role = 'bairrista'
        AND m.status = 'ativo'
        AND m.deleted_at IS NULL
        AND rc.id IS NULL
      ORDER BY m.display_name ASC`
  );
  return res.rows;
}

async function _createOne(guild, botId, dbMember) {
  const nickname = dbMember.nickname || dbMember.display_name;
  const fullName = dbMember.display_name;
  const channelName = formatResidentChannelName(dbMember.tier || 'young_blood', nickname);

  const permissionOverwrites = buildBairristaChannelOverwrites(guild, dbMember.discord_id, botId);

  const channel = await queueChannelOp(() =>
    guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID,
      permissionOverwrites,
      topic: `Canal individual de ${fullName} (${nickname})`,
    })
  );

  await memberRepo.update(dbMember.id, { channel_id: channel.id });

  await query(
    `INSERT INTO resident_channels (member_id, discord_id, channel_id, channel_name, category_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [dbMember.id, dbMember.discord_id, channel.id, channelName, CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID]
  );

  // Welcome embed + painel — non-fatal se falhar.
  try {
    const panelRows = buildBairristaChannelPanel();
    await channel.send({ embeds: [welcomeChannelEmbed(fullName)], components: panelRows });
  } catch (e) {
    warn(`[BACKFILL-TOPICOS] Welcome em ${channel.id} falhou (non-fatal): ${e.message}`);
  }

  return { channelId: channel.id, channelName };
}

async function handle(interaction) {
  try {
    return await _handleInner(interaction);
  } catch (e) {
    warn(`[BACKFILL-TOPICOS] Erro em handler: ${e.message}\n${e.stack}`);
    const msg = `${EMOJI.ERRO} Falha: ${String(e.message).slice(0, 200)}`;
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: msg }).catch(() => {});
    }
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function _handleInner(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('backfill de tópicos'), flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }

  if (!CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} \`BAIRRISTA_TOPICOS_CATEGORY_ID\` não está configurado.`,
        flags: MessageFlags.Ephemeral,
      },
      { dismissible: true }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const executar = interaction.options.getBoolean('executar') === true;
  const missing = await _findMissing();

  if (!missing.length) {
    const embed = brandEmbed('MOVEMENT')
      .setColor(0x2ecc71)
      .setTitle(`${EMOJI.OK} Todos os bairristas têm tópico`)
      .setDescription('Zero drift — nada a fazer.');
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  }

  if (!executar) {
    // Dry-run — só lista.
    const lines = missing
      .slice(0, 40)
      .map(m => `• **${m.display_name}** (${m.nickname || '—'}) · tier \`${m.tier || '—'}\``);
    if (missing.length > 40) lines.push(`_… e mais ${missing.length - 40}_`);
    const embed = brandEmbed('MOVEMENT')
      .setColor(0xf39c12)
      .setTitle(`${EMOJI.WARN} ${missing.length} bairrista(s) sem tópico`)
      .setDescription(lines.join('\n').slice(0, 3900))
      .setFooter({ text: 'preview — corre com `executar:true` para criar os canais' });
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  }

  // Execução real.
  const guild = interaction.guild;
  const botId = guild.members.me?.id;
  if (!botId) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} Bot não está registado na guild.` }, { dismissible: true });
  }

  const started = Date.now();
  const created = [];
  const failed = [];

  for (const m of missing) {
    try {
      const r = await _createOne(guild, botId, m);
      created.push({ member: m, ...r });
      log(`[BACKFILL-TOPICOS] ${m.display_name} → canal ${r.channelId} (${r.channelName}).`);
    } catch (e) {
      failed.push({ member: m, error: e.message });
      warn(`[BACKFILL-TOPICOS] ${m.display_name} falhou: ${e.message}`);
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const lines = [];
  for (const c of created) {
    lines.push(`${EMOJI.OK} **${c.member.display_name}** → <#${c.channelId}>`);
  }
  for (const f of failed) {
    lines.push(`${EMOJI.ERRO} **${f.member.display_name}** · ${String(f.error).slice(0, 120)}`);
  }

  const color = failed.length ? 0xe74c3c : 0x2ecc71;
  const embed = brandEmbed('MOVEMENT')
    .setColor(color)
    .setTitle(
      `${EMOJI.REFRESH} Backfill de tópicos — ${created.length} criados · ${failed.length} falhas · ${elapsed}s`
    )
    .setDescription(lines.join('\n').slice(0, 3900));

  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = { handle };
