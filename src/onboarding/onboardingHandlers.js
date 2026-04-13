'use strict';
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags, EmbedBuilder,
} = require('discord.js');
const CONFIG = require('../config');
const { safeReply, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed, successEmbed } = require('../shared/embedBuilders');
const { isChefeMoradores } = require('../permissions/permissionEngine');
const { query } = require('../db');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL DE ENTRADA — botão "Pedir Tag"
// ═══════════════════════════════════════════════════════════════════════════

function buildEntradaPanel() {
  const embed = new EmbedBuilder()
    .setColor(CONFIG.BOT_COLOR)
    .setTitle('\uD83E\uDE78 Real Gangsta — Bem-vindo ao Bairro')
    .setDescription(
      'Queres fazer parte do grupo?\n\n' +
      'Clica no botão abaixo para pedir a tua tag de **Morador**.\n' +
      'Vais precisar de indicar o teu **nome in-game** e a tua **alcunha**.\n\n' +
      'Depois de aprovado pela chefia, recebes acesso ao bairro e ao teu canal individual.'
    )
    .setFooter({ text: CONFIG.BOT_DISPLAY_NAME })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('onboard::pedir_tag')
      .setLabel('Pedir Tag de Morador')
      .setStyle(ButtonStyle.Success)
      .setEmoji('\uD83C\uDFF7\uFE0F'),
  );

  return { embeds: [embed], components: [row] };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: User clica "Pedir Tag" → abre modal
// ═══════════════════════════════════════════════════════════════════════════

async function handlePedirTagButton(interaction) {
  // Check if user already has a pending request
  const existing = await query(
    `SELECT id FROM tag_requests WHERE discord_id = $1 AND status = 'pending'`,
    [interaction.user.id]
  );
  if (existing.rows.length > 0) {
    return safeReply(interaction, {
      content: 'Já tens um pedido de tag pendente. Aguarda pela aprovação.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check if already a morador
  const moradorRoleIds = CONFIG.ALL_MORADOR_TIER_IDS;
  const hasRole = moradorRoleIds.some(id => interaction.member.roles.cache.has(id));
  if (hasRole) {
    return safeReply(interaction, {
      content: 'Já tens uma tag de morador. Não precisas de pedir novamente.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('onboard::modal_tag')
    .setTitle('Pedir Tag de Morador')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('full_name')
          .setLabel('Nome completo in-game (Primeiro Último)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Chico Navalhas')
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(50)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nickname')
          .setLabel('Alcunha')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Stewie')
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(30)
      ),
    );

  await safeShowModal(interaction, modal);
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: Modal submetido → DB + embed no canal de tags
// ═══════════════════════════════════════════════════════════════════════════

async function handleTagModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const fullName = getModalField(interaction, 'full_name').trim();
  const nickname = getModalField(interaction, 'nickname').trim();

  if (!fullName || !nickname) {
    return interaction.editReply({ content: 'Nome e alcunha são obrigatórios.' });
  }

  // Save to DB
  const res = await query(
    `INSERT INTO tag_requests (discord_id, username, full_name, nickname)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [interaction.user.id, interaction.user.username, fullName, nickname]
  );
  const requestId = res.rows[0].id;

  // Send approval embed to tag request channel
  const tagChannel = await interaction.client.channels.fetch(CONFIG.TAG_REQUEST_CHANNEL_ID).catch(() => null);
  if (!tagChannel) {
    return interaction.editReply({ content: 'Erro interno — canal de aprovação não encontrado.' });
  }

  const approvalEmbed = new EmbedBuilder()
    .setColor(0xF39C12)
    .setTitle('\uD83C\uDFF7\uFE0F Novo Pedido de Tag')
    .setThumbnail(interaction.user.displayAvatarURL({ size: 64 }))
    .addFields(
      { name: '\uD83D\uDC64 Discord', value: `<@${interaction.user.id}>\n\`${interaction.user.username}\``, inline: true },
      { name: '\uD83D\uDCDD Nome In-Game', value: `**${fullName}**`, inline: true },
      { name: '\uD83C\uDFAD Alcunha', value: `**${nickname}**`, inline: true },
      { name: '\uD83D\uDD16 Nickname Final', value: `\`${fullName} (${nickname})\``, inline: false },
    )
    .setFooter({ text: `Pedido #${requestId} — ${CONFIG.BOT_DISPLAY_NAME}` })
    .setTimestamp();

  const approvalRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`onboard::approve::${requestId}`)
      .setLabel('Aprovar')
      .setStyle(ButtonStyle.Success)
      .setEmoji('\u2705'),
    new ButtonBuilder()
      .setCustomId(`onboard::deny::${requestId}`)
      .setLabel('Negar')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('\u274C'),
  );

  const msg = await tagChannel.send({ embeds: [approvalEmbed], components: [approvalRow] });

  // Save message ID for future reference
  await query('UPDATE tag_requests SET message_id = $1 WHERE id = $2', [msg.id, requestId]);

  return interaction.editReply({
    content: `O teu pedido foi enviado! Aguarda pela aprovação.\n**Nome:** ${fullName} **(${nickname})**`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: Chefia aprova ou nega
// ═══════════════════════════════════════════════════════════════════════════

async function handleApproveButton(interaction, requestId) {
  if (isDuplicate(interaction.id)) return;

  if (!isChefeMoradores(interaction.member)) {
    return safeReply(interaction, { content: 'Não tens permissão para aprovar pedidos de tag.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const reqRes = await query('SELECT * FROM tag_requests WHERE id = $1', [requestId]);
  const tagReq = reqRes.rows[0];
  if (!tagReq) return interaction.editReply({ content: 'Pedido não encontrado.' });
  if (tagReq.status !== 'pending') return interaction.editReply({ content: 'Este pedido já foi processado.' });

  const { processApproval } = require('./onboardingEngine');
  const result = await processApproval(tagReq, interaction.member, interaction.client);

  // Update the original message to show approved
  if (tagReq.message_id) {
    const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x2ECC71)
      .setTitle('\u2705 Tag Aprovada')
      .addFields({ name: '\uD83D\uDC51 Aprovado por', value: `<@${interaction.user.id}>`, inline: true });

    await interaction.message.edit({ embeds: [approvedEmbed], components: [] }).catch(() => {});
  }

  return interaction.editReply({
    content: `Tag aprovada para **${tagReq.full_name} (${tagReq.nickname})**\n${result.channelCreated ? `Canal criado: <#${result.channelId}>` : 'Canal não criado (erro)'}${result.nicknameSet ? '' : '\n\u26A0\uFE0F Nickname não foi alterado (sem permissão)'}`,
  });
}

async function handleDenyButton(interaction, requestId) {
  if (isDuplicate(interaction.id)) return;

  if (!isChefeMoradores(interaction.member)) {
    return safeReply(interaction, { content: 'Não tens permissão para negar pedidos de tag.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const reqRes = await query('SELECT * FROM tag_requests WHERE id = $1', [requestId]);
  const tagReq = reqRes.rows[0];
  if (!tagReq) return interaction.editReply({ content: 'Pedido não encontrado.' });
  if (tagReq.status !== 'pending') return interaction.editReply({ content: 'Este pedido já foi processado.' });

  await query(
    `UPDATE tag_requests SET status = 'denied', denied_by = $1, resolved_at = NOW() WHERE id = $2`,
    [interaction.user.id, requestId]
  );

  await logAudit({
    action: 'tag_request_denied', entityType: 'member', entityId: tagReq.discord_id,
    actorId: interaction.user.id, actorName: interaction.user.username,
    afterState: { fullName: tagReq.full_name, nickname: tagReq.nickname },
  });

  // Update original message
  if (tagReq.message_id) {
    const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0xE74C3C)
      .setTitle('\u274C Tag Negada')
      .addFields({ name: '\uD83D\uDC51 Negado por', value: `<@${interaction.user.id}>`, inline: true });

    await interaction.message.edit({ embeds: [deniedEmbed], components: [] }).catch(() => {});
  }

  return interaction.editReply({ content: `Tag negada para **${tagReq.full_name} (${tagReq.nickname})**.` });
}

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL DO CANAL INDIVIDUAL (enhanced — 5 botões)
// ═══════════════════════════════════════════════════════════════════════════

function buildMoradorChannelPanel() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel('Registar Material').setStyle(ButtonStyle.Success).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('morador::encomendar').setLabel('Encomendar').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDED2'),
    new ButtonBuilder().setCustomId('morador::historico').setLabel('Meu Histórico').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCB'),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::progresso').setLabel('Meu Progresso').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCCA'),
    new ButtonBuilder().setCustomId('morador::top_semanal').setLabel('Top Semanal').setStyle(ButtonStyle.Secondary).setEmoji('\uD83C\uDFC6'),
  );

  return [row1, row2];
}

module.exports = {
  buildEntradaPanel,
  handlePedirTagButton,
  handleTagModal,
  handleApproveButton,
  handleDenyButton,
  buildMoradorChannelPanel,
};
