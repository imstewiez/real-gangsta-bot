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
      content: ONBOARDING.ALREADY_IN_HOUSE,
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }

  const M = MODALS.TAG_REQUEST;
  const modal = new ModalBuilder()
    .setCustomId('onboard::modal_tag')
    .setTitle(M.TITLE)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('full_name')
          .setLabel(M.FIELDS.full_name.label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(M.FIELDS.full_name.placeholder)
          .setRequired(M.FIELDS.full_name.required)
          .setMinLength(3)
          .setMaxLength(M.FIELDS.full_name.maxLength)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nickname')
          .setLabel(M.FIELDS.nickname.label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(M.FIELDS.nickname.placeholder)
          .setRequired(M.FIELDS.nickname.required)
          .setMinLength(2)
          .setMaxLength(M.FIELDS.nickname.maxLength)
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
    return safeReply(interaction, { content: `${EMOJI.WARN} Nome e alcunha são obrigatórios.` }, { dismissible: true });
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
    return safeReply(interaction, { content: ERRORS.GENERIC() + ' Canal de aprovação em falta.' }, { dismissible: true });
  }

  const approvalEmbed = brandEmbed('SHORT')
    .setColor(0xF39C12)
    .setTitle(ONBOARDING.TAG_PENDING_TITLE)
    .setThumbnail(interaction.user.displayAvatarURL({ size: 64 }))
    .addFields(
      { name: 'Discord',     value: `<@${interaction.user.id}>\n\`${interaction.user.username}\``, inline: true },
      { name: 'Nome',        value: `**${fullName}**`, inline: true },
      { name: 'Alcunha',     value: `**${nickname}**`, inline: true },
      { name: 'Nickname final', value: `\`${fullName} (${nickname})\``, inline: false },
    );

  const aBtn = BUTTONS.ONBOARDING.APROVAR;
  const dBtn = BUTTONS.ONBOARDING.NEGAR;
  const approvalRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`onboard::approve::${requestId}`)
      .setLabel(aBtn.label)
      .setStyle(ButtonStyle[aBtn.style])
      .setEmoji(aBtn.emoji),
    new ButtonBuilder()
      .setCustomId(`onboard::deny::${requestId}`)
      .setLabel(dBtn.label)
      .setStyle(ButtonStyle[dBtn.style])
      .setEmoji(dBtn.emoji),
  );

  const msg = await tagChannel.send({ embeds: [approvalEmbed], components: [approvalRow] });

  // Save message ID for future reference
  await query('UPDATE tag_requests SET message_id = $1 WHERE id = $2', [msg.id, requestId]);

  return safeReply(interaction, {
    embeds: [successEmbed('Pedido enviado', `Nome: **${fullName}** *(${nickname})*\nAguarda — alguém da firma vai ler.`)],
  }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: Chefia aprova ou nega
// ═══════════════════════════════════════════════════════════════════════════

async function handleApproveButton(interaction, requestId) {
  if (isDuplicate(interaction.id)) return;

  if (!isChefeMoradores(interaction.member)) {
    return safeReply(interaction, { content: ERRORS.NO_PERMISSION('aprovar tags'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const reqRes = await query('SELECT * FROM tag_requests WHERE id = $1', [requestId]);
  const tagReq = reqRes.rows[0];
  if (!tagReq) return safeReply(interaction, { content: `${EMOJI.NOT_FOUND} Pedido não encontrado.` }, { dismissible: true });
  if (tagReq.status !== 'pending') return safeReply(interaction, { content: `${EMOJI.BLOQUEADO} Este pedido já foi tratado.` }, { dismissible: true });

  const { processApproval } = require('./onboardingEngine');
  const result = await processApproval(tagReq, interaction.member, interaction.client);

  // Update the original message to show approved + lock buttons
  if (tagReq.message_id) {
    const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x2ECC71)
      .setTitle(ONBOARDING.TAG_APPROVED_TITLE)
      .addFields({ name: 'Aprovado por', value: `<@${interaction.user.id}>`, inline: true });

    await interaction.message.edit({ embeds: [approvedEmbed], components: [] }).catch(() => {});
  }

  const body = ONBOARDING.TAG_APPROVED_BODY(
    `<@${tagReq.discord_id}>`,
    tagReq.nickname,
    result.channelId ? `<#${result.channelId}>` : null,
  ) + (result.nicknameSet ? '' : `\n${EMOJI.WARN} Nickname não alterado (sem permissão).`);

  return safeReply(interaction, {
    embeds: [successEmbed('Feito', body)],
  }, { dismissible: true });
}

async function handleDenyButton(interaction, requestId) {
  if (isDuplicate(interaction.id)) return;

  if (!isChefeMoradores(interaction.member)) {
    return safeReply(interaction, { content: ERRORS.NO_PERMISSION('negar tags'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const reqRes = await query('SELECT * FROM tag_requests WHERE id = $1', [requestId]);
  const tagReq = reqRes.rows[0];
  if (!tagReq) return safeReply(interaction, { content: `${EMOJI.NOT_FOUND} Pedido não encontrado.` }, { dismissible: true });
  if (tagReq.status !== 'pending') return safeReply(interaction, { content: `${EMOJI.BLOQUEADO} Este pedido já foi tratado.` }, { dismissible: true });

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
      .setTitle(ONBOARDING.TAG_DENIED_TITLE)
      .addFields({ name: 'Negado por', value: `<@${interaction.user.id}>`, inline: true });

    await interaction.message.edit({ embeds: [deniedEmbed], components: [] }).catch(() => {});
  }

  return safeReply(interaction, {
    embeds: [successEmbed('Negado', `Tag negada para **${tagReq.full_name}** *(${tagReq.nickname})*.`)],
  }, { dismissible: true });
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
