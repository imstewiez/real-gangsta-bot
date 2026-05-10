'use strict';
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const CONFIG = require('../config');
const { safeReply, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed, successEmbed, errorEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI, PANELS, BUTTONS, MODALS, ONBOARDING, ERRORS } = require('../content');
const { isPatraoDiZona } = require('../permissions/permissionEngine');
const { query } = require('../db');
const { logAudit } = require('../audit/auditEngine');
const { tryDmOrFallback } = require('../shared/dm');
const rateLimiter = require('../shared/rateLimiter');
const { warn } = require('../logger');
const { formatPtDate } = require('../shared/formatPtDate');

// ═══════════════════════════════════════════════════════════════════════════
// Entry panel — botão principal "Dar a Cara" + 1 botão secundário (Código).
// O botão Código aponta para o sticky/pinned do canal de leis; se não
// existir, cai silenciosamente (só o botão principal fica).
// ═══════════════════════════════════════════════════════════════════════════

function buildEntradaPanel() {
  const embed = applyLogo(
    brandEmbed('SHORT')
      .setColor(COLOR.SUCCESS)
      .setTitle(PANELS.ENTRADA.TITLE)
      .setDescription(PANELS.ENTRADA.DESCRIPTION)
      .addFields({
        name: `${EMOJI.OK} Como funciona?`,
        value:
          '1. Clica em **Dar a Cara** e preenche o modal\n2. Aguarda aprovação da chefia\n3. Recebe a tua tag e canal individual',
        inline: false,
      })
  );

  const bPrimary = BUTTONS.ENTRADA.PEDIR_TAG;
  const bSecondary = BUTTONS.ENTRADA.MEU_PEDIDO;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('onboard::pedir_tag')
      .setLabel(bPrimary.label)
      .setStyle(ButtonStyle[bPrimary.style])
      .setEmoji(bPrimary.emoji),
    new ButtonBuilder()
      .setCustomId('onboard::meu_pedido')
      .setLabel(bSecondary.label)
      .setStyle(ButtonStyle[bSecondary.style])
      .setEmoji(bSecondary.emoji)
  );

  return { embeds: [embed], components: [row] };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: User clica "Pedir Tag" → guards + modal
// ═══════════════════════════════════════════════════════════════════════════

async function handlePedirTagButton(interaction) {
  const discordId = interaction.user.id;

  // Guard 0: cooldown anti-spam — 5 tentativas em 5 min por user.
  // Evita DDOS humano (clicar como um doido) sem fricção para 99% dos users.
  if (!rateLimiter.allow(discordId, 'onboard::pedir_tag', { limit: 5, windowMs: 5 * 60_000 })) {
    return safeReply(
      interaction,
      { content: ONBOARDING.COOLDOWN, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  // Guard 1: pedido pendente
  const existing = await query("SELECT id FROM tag_requests WHERE discord_id = $1 AND status = 'pending'", [discordId]);
  if (existing.rows.length > 0) {
    return safeReply(
      interaction,
      { content: ONBOARDING.HAS_PENDING, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  // Guard 2: já é bairrista via role Discord
  const bairristaRoleIds = CONFIG.BAIRRISTA_TIER_ROLE_IDS;
  const staffRoleIds = [...CONFIG.COMMAND_ROLE_IDS, ...CONFIG.SUPERVISOR_ROLE_IDS, ...CONFIG.PATRAO_DI_ZONA_ROLE_IDS];
  const hasAnyMemberRole = [...bairristaRoleIds, CONFIG.BAIRRISTAS_BASE_ROLE_ID, ...staffRoleIds]
    .filter(Boolean)
    .some(id => interaction.member.roles.cache.has(id));
  if (hasAnyMemberRole) {
    return safeReply(
      interaction,
      { content: ONBOARDING.ALREADY_IN_HOUSE, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  // Guard 3: já existe record de member activo na DB.
  const memberRecord = await query(
    "SELECT id, role, status FROM members WHERE discord_id = $1 AND status = 'ativo' LIMIT 1",
    [discordId]
  );
  if (memberRecord.rows.length > 0) {
    return safeReply(
      interaction,
      { content: ONBOARDING.HAS_ACTIVE_RECORD(memberRecord.rows[0].role), flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  // Guard 4: já teve tag aprovada alguma vez.
  const priorApproved = await query(
    `SELECT id, resolved_at FROM tag_requests
      WHERE discord_id = $1 AND status = 'approved'
      ORDER BY resolved_at DESC LIMIT 1`,
    [discordId]
  );
  if (priorApproved.rows.length > 0) {
    return safeReply(
      interaction,
      { content: ONBOARDING.HAS_PRIOR_APPROVED, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
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
      )
    );

  await safeShowModal(interaction, modal);
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: Modal submetido → DB + rich approval card no canal de staff
// ═══════════════════════════════════════════════════════════════════════════

async function handleTagModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const fullName = getModalField(interaction, 'full_name').trim();
  const nickname = getModalField(interaction, 'nickname').trim();

  if (!fullName || !nickname) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Nome e alcunha são obrigatórios.` },
      { messageClass: 'BANAL' }
    );
  }

  // Save to DB. Dedup por UNIQUE INDEX `uq_tag_requests_pending_per_user`.
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
      return safeReply(interaction, { content: ONBOARDING.HAS_PENDING }, { messageClass: 'BANAL' });
    }
    throw e;
  }

  // ── Enriquecer approval card com contexto da chefia ──
  const memberCtx = await _buildMemberContext(interaction, fullName, nickname);

  const tagChannel = await interaction.client.channels.fetch(CONFIG.TAG_REQUEST_CHANNEL_ID).catch(() => null);
  if (!tagChannel) {
    return safeReply(
      interaction,
      { content: ERRORS.GENERIC() + ' Canal de aprovação em falta.' },
      { messageClass: 'ERROR' }
    );
  }

  const approvalEmbed = brandEmbed('SHORT')
    .setColor(COLOR.WARNING_SOFT)
    .setTitle(ONBOARDING.TAG_PENDING_TITLE)
    .setThumbnail(interaction.user.displayAvatarURL({ size: 64 }))
    .addFields(
      { name: 'Discord', value: `<@${interaction.user.id}>\n\`${interaction.user.username}\``, inline: true },
      { name: 'Nome', value: `**${fullName}**`, inline: true },
      { name: 'Alcunha', value: `**${nickname}**`, inline: true },
      { name: 'Nickname final', value: `\`${fullName} (${nickname})\``, inline: false }
    );

  if (memberCtx.contextFields.length) {
    approvalEmbed.addFields(...memberCtx.contextFields);
  }

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
      .setEmoji(dBtn.emoji)
  );

  const msg = await tagChannel.send({ embeds: [approvalEmbed], components: [approvalRow] });
  await query('UPDATE tag_requests SET message_id = $1 WHERE id = $2', [msg.id, requestId]);

  // ── Confirmação visual ao user com o ticker de próximos passos ──
  const confirmEmbed = brandEmbed('SHORT')
    .setColor(COLOR.WARNING_SOFT)
    .setTitle(ONBOARDING.REQUEST_RECEIVED_TITLE)
    .setDescription(ONBOARDING.REQUEST_RECEIVED_BODY(fullName, nickname));

  return safeReply(interaction, { embeds: [confirmEmbed] }, { messageClass: 'BANAL' });
}

/**
 * Recolhe contexto sobre o candidato para mostrar à chefia no approval card.
 * - Tempo no server
 * - Idade da conta Discord (<7 dias é suspeito)
 * - Histórico de pedidos anteriores (aprovados/negados)
 * - Conflito de alcunha com bairrista activo
 */
async function _buildMemberContext(interaction, _fullName, nickname) {
  const out = { contextFields: [] };

  // Tempo no server + idade da conta
  try {
    const gm = interaction.member;
    const accountAgeMs = Date.now() - (gm.user.createdTimestamp || Date.now());
    const joinedAgeMs = Date.now() - (gm.joinedTimestamp || Date.now());
    const days = ms => Math.floor(ms / 86_400_000);
    const ageLine =
      `No server há **${days(joinedAgeMs)}d** · ` +
      `conta Discord há **${days(accountAgeMs)}d**` +
      (days(accountAgeMs) < 7 ? ' ⚠️ _conta nova_' : '');
    out.contextFields.push({ name: 'Contexto', value: ageLine, inline: false });
  } catch (_) {
    /* non-fatal */
  }

  // Histórico de pedidos
  try {
    const history = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'denied')::int   AS denied,
         COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
         MAX(resolved_at) FILTER (WHERE status = 'denied') AS last_denied,
         (SELECT denial_reason FROM tag_requests WHERE discord_id = $1 AND status = 'denied'
            ORDER BY resolved_at DESC LIMIT 1) AS last_denial_reason
       FROM tag_requests WHERE discord_id = $1`,
      [interaction.user.id]
    );
    const h = history.rows[0] || {};
    const count = (h.denied || 0) + (h.approved || 0);
    if (count > 0) {
      let line = '';
      if (h.denied) line += `**${h.denied}** pedido(s) negado(s)`;
      if (h.approved) line += `${line ? ' · ' : ''}**${h.approved}** aprovado(s)`;
      if (h.last_denied) line += `\n_Último negado: ${formatPtDate(h.last_denied)}_`;
      if (h.last_denial_reason) line += `\n_Razão: "${String(h.last_denial_reason).slice(0, 100)}"_`;
      out.contextFields.push({ name: 'Histórico', value: line, inline: false });
    }
  } catch (_) {
    /* non-fatal */
  }

  // Conflito de alcunha
  try {
    const conflict = await query(
      `SELECT display_name FROM members
         WHERE nickname ILIKE $1 AND status = 'ativo' AND discord_id <> $2
         LIMIT 1`,
      [nickname, interaction.user.id]
    );
    if (conflict.rows.length > 0) {
      out.contextFields.push({
        name: 'Alcunha',
        value: `⚠️ _já existe bairrista activo com essa alcunha (${conflict.rows[0].display_name})._`,
        inline: false,
      });
    }
  } catch (_) {
    /* non-fatal */
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3a: Aprovação
// ═══════════════════════════════════════════════════════════════════════════

async function handleApproveButton(interaction, requestId) {
  if (isDuplicate(interaction.id)) return;

  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('aprovar tags'), flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Claim atómico via `approved_by` (lock token). Race-safe para 2 staff a
  // clicar ao mesmo tempo. Ver onboardingHandlers histórico.
  const claim = await query(
    `UPDATE tag_requests SET approved_by = $1
      WHERE id = $2 AND status = 'pending' AND approved_by IS NULL
      RETURNING *`,
    [interaction.user.id, requestId]
  );
  const tagReq = claim.rows[0];
  if (!tagReq) {
    const check = await query('SELECT status FROM tag_requests WHERE id = $1', [requestId]);
    if (check.rows.length === 0) {
      return safeReply(
        interaction,
        { content: `${EMOJI.NOT_FOUND} Pedido não encontrado.` },
        { messageClass: 'ERROR' }
      );
    }
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} Este pedido já foi tratado por outro oficial.` },
      { messageClass: 'BANAL' }
    );
  }

  const { processApproval } = require('./onboardingEngine');
  let result;
  try {
    result = await processApproval(tagReq, interaction.member, interaction.client);
  } catch (e) {
    // Engine falhou inteira — liberta o claim para staff re-tentar.
    await query("UPDATE tag_requests SET approved_by = NULL WHERE id = $1 AND status = 'pending'", [requestId]).catch(
      () => {}
    );
    throw e;
  }

  // Actualiza mensagem original com estado aprovado + assina quem aprovou.
  if (tagReq.message_id && interaction.message?.embeds?.[0]) {
    try {
      const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(COLOR.SUCCESS)
        .setTitle(ONBOARDING.TAG_APPROVED_TITLE)
        .addFields({ name: 'Aprovado por', value: `<@${interaction.user.id}>`, inline: true });
      await interaction.message.edit({ embeds: [approvedEmbed], components: [] });
    } catch (_) {
      /* message may have been deleted */
    }
  }

  // Reply rico ao staff com surface explícito de falhas + entrega DM.
  const body = _buildStaffApprovalReply(tagReq, result);
  return safeReply(interaction, { embeds: [body] }, { messageClass: 'BANAL' });
}

function _buildStaffApprovalReply(tagReq, result) {
  const lines = [];
  lines.push(
    ONBOARDING.TAG_APPROVED_STAFF_BODY(
      `<@${tagReq.discord_id}>`,
      tagReq.nickname,
      result.channelId ? `<#${result.channelId}>` : null
    )
  );

  // Warnings de falhas parciais — não matam a operação mas staff tem de ver.
  for (const err of result.errors || []) {
    if (err.phase === 'nickname') lines.push(`\n${EMOJI.WARN} Nickname não alterado _(${err.message})_.`);
    else if (err.phase === 'channel') lines.push(`\n${EMOJI.ERRO} Canal individual **falhou** — ${err.message}.`);
    else if (err.phase === 'roles') lines.push(`\n${EMOJI.ERRO} Roles parcial — ${err.message}.`);
    else lines.push(`\n${EMOJI.WARN} ${err.phase}: ${err.message}`);
  }

  // Entrega DM — informa a chefia se foi DM, fallback, ou falhou.
  if (result.dmDelivery) {
    if (result.dmDelivery.delivered === 'dm') lines.push(`\n${EMOJI.OK} DM enviada ao user.`);
    else if (result.dmDelivery.delivered === 'channel')
      lines.push(`\n${EMOJI.WARN} DMs fechados — mensagem postada no canal de entrada com menção.`);
    else lines.push(`\n${EMOJI.ERRO} Não foi possível notificar o user _(nem DM nem fallback)_.`);
  }

  const hasErr = (result.errors || []).length > 0;
  return hasErr ? errorEmbed('Aprovado com avisos', lines.join('\n')) : successEmbed('Aprovado', lines.join('\n'));
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3b: Negação — agora com modal para razão (opcional)
// ═══════════════════════════════════════════════════════════════════════════

async function handleDenyButton(interaction, requestId) {
  if (isDuplicate(interaction.id)) return;

  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('negar tags'), flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  // Verifica que o pedido existe antes de abrir modal — evita modal fantasma.
  const r = await query('SELECT status FROM tag_requests WHERE id = $1', [requestId]);
  if (r.rows.length === 0) {
    return safeReply(
      interaction,
      { content: `${EMOJI.NOT_FOUND} Pedido não encontrado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'ERROR' }
    );
  }
  if (r.rows[0].status !== 'pending') {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} Este pedido já foi tratado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const modal = new ModalBuilder()
    .setCustomId(`onboard::modal_deny::${requestId}`)
    .setTitle('Negar Pedido de Tag')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Razão (opcional, chega ao user por DM)')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Ex: contexto ou nome inadequado, necessitas de mais informação, etc.')
          .setRequired(false)
          .setMaxLength(500)
      )
    );

  await safeShowModal(interaction, modal);
}

async function handleDenyModalSubmit(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(interaction, { content: ERRORS.NO_PERMISSION('negar tags') }, { messageClass: 'BANAL' });
  }

  const requestId = parseInt(interaction.customId.split('::')[2], 10);
  if (Number.isNaN(requestId)) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} Pedido inválido.` }, { messageClass: 'BANAL' });
  }
  const reason = (getModalField(interaction, 'reason') || '').trim() || null;

  // Claim atómico — primeiro que submete ganha.
  const claim = await query(
    `UPDATE tag_requests
        SET status = 'denied',
            denied_by = $1,
            denial_reason = $2,
            resolved_at = NOW(),
            processed_at = NOW()
      WHERE id = $3 AND status = 'pending'
      RETURNING *`,
    [interaction.user.id, reason, requestId]
  );
  const tagReq = claim.rows[0];
  if (!tagReq) {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} Pedido já foi tratado ou não existe.` },
      { messageClass: 'BANAL' }
    );
  }

  await logAudit({
    action: 'tag_request_denied',
    entityType: 'member',
    entityId: tagReq.discord_id,
    actorId: interaction.user.id,
    actorName: interaction.user.username,
    afterState: { fullName: tagReq.full_name, nickname: tagReq.nickname, denial_reason: reason },
  });

  // Atualiza a mensagem original — mostra estado denied com razão se houver.
  if (tagReq.message_id) {
    try {
      const msg = await interaction.channel?.messages.fetch(tagReq.message_id).catch(() => null);
      if (msg?.embeds?.[0]) {
        const deniedEmbed = EmbedBuilder.from(msg.embeds[0])
          .setColor(COLOR.DANGER)
          .setTitle(ONBOARDING.TAG_DENIED_TITLE)
          .addFields({ name: 'Negado por', value: `<@${interaction.user.id}>`, inline: true });
        if (reason) deniedEmbed.addFields({ name: 'Razão', value: reason, inline: false });
        await msg.edit({ embeds: [deniedEmbed], components: [] }).catch(() => {});
      }
    } catch (_) {
      /* message may have been deleted */
    }
  }

  // DM ao user (ou fallback).
  let dmDelivery = { delivered: 'none' };
  try {
    const guild = interaction.guild;
    const guildName = guild?.name || CONFIG.BOT_DISPLAY_NAME;
    const user = await interaction.client.users.fetch(tagReq.discord_id).catch(() => null);
    if (user) {
      const dmEmbed = applyLogo(
        brandEmbed('SHORT')
          .setColor(COLOR.DANGER)
          .setTitle(ONBOARDING.DM_DENIED_TITLE)
          .setDescription(ONBOARDING.DM_DENIED_BODY(guildName, reason))
      );
      const entradaChannel = CONFIG.PANEL_ENTRADA_CHANNEL_ID
        ? await interaction.client.channels.fetch(CONFIG.PANEL_ENTRADA_CHANNEL_ID).catch(() => null)
        : null;
      dmDelivery = await tryDmOrFallback({
        user,
        payload: { embeds: [dmEmbed] },
        fallbackChannel: entradaChannel,
        fallbackMention: true,
      });
    }
  } catch (e) {
    warn(`[ONBOARDING] DM denial falhou para ${tagReq.discord_id}: ${e.message}`);
  }

  const lines = [ONBOARDING.TAG_DENIED_STAFF_BODY(tagReq.full_name, tagReq.nickname, reason)];
  if (dmDelivery.delivered === 'dm') lines.push(`\n${EMOJI.OK} DM enviada ao user.`);
  else if (dmDelivery.delivered === 'channel')
    lines.push(`\n${EMOJI.WARN} DMs fechados — fallback no canal de entrada.`);
  else lines.push(`\n${EMOJI.ERRO} Não foi possível notificar o user.`);

  return safeReply(interaction, { embeds: [errorEmbed('Pedido negado', lines.join('\n'))] }, { messageClass: 'ERROR' });
}

// ═══════════════════════════════════════════════════════════════════════════
// Painel do canal individual (welcome + CTAs após aprovação)
// ═══════════════════════════════════════════════════════════════════════════

function buildBairristaChannelPanel() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bairrista::registar_material')
      .setLabel('Registar Material')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📦'),
    new ButtonBuilder()
      .setCustomId('bairrista::movimento')
      .setLabel('Movimento no Bairro')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔥'),
    new ButtonBuilder()
      .setCustomId('bairrista::ranking')
      .setLabel('Ranking')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🥇'),
    new ButtonBuilder()
      .setCustomId('perfil::encomendas')
      .setLabel('Encomendas')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋')
  );

  return [row1];
}

module.exports = {
  buildEntradaPanel,
  handlePedirTagButton,
  handleTagModal,
  handleApproveButton,
  handleDenyButton,
  handleDenyModalSubmit,
  buildBairristaChannelPanel,
};
