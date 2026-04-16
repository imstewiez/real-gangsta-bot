'use strict';
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags, EmbedBuilder,
} = require('discord.js');
const CONFIG = require('../config');
const { safeReply, safeShowModal, getModalField, isDuplicate, lockMessageComponents } = require('../shared/interactionHelpers');
const { brandEmbed, successEmbed, applyLogo } = require('../shared/embedBuilders');
const { EMOJI, PANELS, BUTTONS, MODALS, ONBOARDING, ERRORS } = require('../content');
const { isChefeMoradores } = require('../permissions/permissionEngine');
const { query } = require('../db');
const { logAudit, sendAuditToChannel } = require('../audit/auditEngine');

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL DE ENTRADA — botão "Pedir Tag"
// ═══════════════════════════════════════════════════════════════════════════

function buildEntradaPanel() {
  const embed = applyLogo(brandEmbed('SHORT')
    .setTitle(PANELS.ENTRADA.TITLE)
    .setDescription(PANELS.ENTRADA.DESCRIPTION));

  const b = BUTTONS.ENTRADA.PEDIR_TAG;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('onboard::pedir_tag')
      .setLabel(b.label)
      .setStyle(ButtonStyle[b.style])
      .setEmoji(b.emoji),
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
      content: `${EMOJI.PENDENTE} Já tens pedido em análise. Espera — o oficial vai ler.`,
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }

  // Check if already a bairrista
  const bairristaRoleIds = CONFIG.BAIRRISTA_TIER_ROLE_IDS;
  const hasRole = bairristaRoleIds.some(id => interaction.member.roles.cache.has(id));
  if (hasRole) {
    return safeReply(interaction, {
      content: `${EMOJI.WARN} Já estás na casa — não precisas de pedir outra vez.`,
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('onboard::modal_tag')
    .setTitle('Pedir Tag de Bairrista')
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
    return safeReply(interaction, { content: 'Nome e alcunha são obrigatórios.' }, { dismissible: true });
  }

  // Save to DB. Dedup por UNIQUE INDEX `uq_tag_requests_pending_per_user` —
  // se já tiver pedido pendente, apanhamos o erro e avisamos.
  let requestId;
  try {
    const res = await query(
      `INSERT INTO tag_requests (discord_id, username, full_name, nickname)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [interaction.user.id, interaction.user.username, fullName, nickname]
    );
    requestId = res.rows[0].id;
  } catch (e) {
    if (e.code === '23505') {
      return safeReply(interaction, {
        content: `${EMOJI.PENDENTE} Já tens um pedido pendente. Espera que alguém da firma valide.`,
      }, { dismissible: true });
    }
    throw e;
  }

  // Send approval embed to tag request channel
  const tagChannel = await interaction.client.channels.fetch(CONFIG.TAG_REQUEST_CHANNEL_ID).catch(() => null);
  if (!tagChannel) {
    return safeReply(interaction, { content: 'Erro interno — canal de aprovação não encontrado.' }, { dismissible: true });
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

  return safeReply(interaction, {
    content: `O teu pedido foi enviado! Aguarda pela aprovação.\n**Nome:** ${fullName} **(${nickname})**`,
  }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: Chefia aprova ou nega
// ═══════════════════════════════════════════════════════════════════════════

async function handleApproveButton(interaction, requestId) {
  if (isDuplicate(interaction.id)) return;

  if (!isChefeMoradores(interaction.member)) {
    return safeReply(interaction, { content: 'Não tens permissão para aprovar pedidos de tag.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const reqRes = await query('SELECT * FROM tag_requests WHERE id = $1', [requestId]);
  const tagReq = reqRes.rows[0];
  if (!tagReq) return safeReply(interaction, { content: 'Pedido não encontrado.' }, { dismissible: true });
  if (tagReq.status !== 'pending') return safeReply(interaction, { content: 'Este pedido já foi processado.' }, { dismissible: true });

  const { processApproval } = require('./onboardingEngine');
  const result = await processApproval(tagReq, interaction.member, interaction.client);

  // Update the original message to show approved + lock buttons
  if (tagReq.message_id) {
    const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x2ECC71)
      .setTitle('\u2705 Tag Aprovada')
      .addFields({ name: '\uD83D\uDC51 Aprovado por', value: `<@${interaction.user.id}>`, inline: true });

    await interaction.message.edit({ embeds: [approvedEmbed], components: [] }).catch(() => {});
  }

  return safeReply(interaction, {
    content: `Tag aprovada para **${tagReq.full_name} (${tagReq.nickname})**\n${result.channelCreated ? `Canal criado: <#${result.channelId}>` : 'Canal não criado (erro)'}${result.nicknameSet ? '' : '\n\u26A0\uFE0F Nickname não foi alterado (sem permissão)'}`,
  }, { dismissible: true });
}

async function handleDenyButton(interaction, requestId) {
  if (isDuplicate(interaction.id)) return;

  if (!isChefeMoradores(interaction.member)) {
    return safeReply(interaction, { content: 'Não tens permissão para negar pedidos de tag.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const reqRes = await query('SELECT * FROM tag_requests WHERE id = $1', [requestId]);
  const tagReq = reqRes.rows[0];
  if (!tagReq) return safeReply(interaction, { content: 'Pedido não encontrado.' }, { dismissible: true });
  if (tagReq.status !== 'pending') return safeReply(interaction, { content: 'Este pedido já foi processado.' }, { dismissible: true });

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

  return safeReply(interaction, { content: `Tag negada para **${tagReq.full_name} (${tagReq.nickname})**.` }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL DO CANAL INDIVIDUAL (enhanced — 5 botões)
// ═══════════════════════════════════════════════════════════════════════════

function buildBairristaChannelPanel() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::registar_material').setLabel('Registar Material').setStyle(ButtonStyle.Success).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('morador::encomendar').setLabel('Encomendar').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDED2'),
    new ButtonBuilder().setCustomId('morador::historico').setLabel('Histórico').setStyle(ButtonStyle.Secondary).setEmoji('\uD83D\uDCCB'),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::progresso').setLabel('Progresso').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCCA'),
    new ButtonBuilder().setCustomId('morador::top_semanal').setLabel('Top Semanal').setStyle(ButtonStyle.Secondary).setEmoji('\uD83C\uDFC6'),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('morador::my_performance').setLabel('Performance').setStyle(ButtonStyle.Primary).setEmoji('\uD83C\uDFAF'),
    new ButtonBuilder().setCustomId('morador::my_material').setLabel('Meu Material').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCE6'),
    new ButtonBuilder().setCustomId('morador::my_profit').setLabel('Meu Lucro').setStyle(ButtonStyle.Primary).setEmoji('\uD83D\uDCB0'),
  );

  return [row1, row2, row3];
}

module.exports = {
  buildEntradaPanel,
  handlePedirTagButton,
  handleTagModal,
  handleApproveButton,
  handleDenyButton,
  buildBairristaChannelPanel,
  buildMoradorChannelPanel: buildBairristaChannelPanel, // legacy alias
};
