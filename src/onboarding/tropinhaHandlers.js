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
const { safeReply, safeShowModal, getModalField } = require('../shared/interactionHelpers');
const { BUTTONS, MODALS, ONBOARDING, ERRORS, EMOJI } = require('../content');
const { canManageOnboarding } = require('../permissions/permissionEngine');
const { query } = require('../db');
const rateLimiter = require('../shared/rateLimiter');

async function getLogoUrl() {
  try {
    const { resolveLogoUrl } = require('../panels/entradaPanel');
    return (await resolveLogoUrl()) || '';
  } catch (_) {
    return CONFIG.BALLAS_GANG_LOGO_URL || CONFIG.BOT_LOGO_URL || '';
  }
}

function footer(logoUrl) {
  return { text: '— Ballas Gang', iconURL: logoUrl || undefined };
}

async function handlePedirTropinhaButton(interaction) {
  const discordId = interaction.user.id;

  if (!rateLimiter.allow(discordId, 'onboard::tropinha', { limit: 5, windowMs: 5 * 60_000 })) {
    return safeReply(
      interaction,
      { content: ONBOARDING.COOLDOWN, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const existing = await query("SELECT id FROM tag_requests WHERE discord_id = $1 AND status = 'pending'", [discordId]);
  if (existing.rows.length > 0) {
    return safeReply(
      interaction,
      { content: ONBOARDING.HAS_PENDING, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const operationalRoleIds = [
    ...CONFIG.BAIRRISTA_TIER_ROLE_IDS,
    ...CONFIG.COMMAND_ROLE_IDS,
    ...CONFIG.SUPERVISOR_ROLE_IDS,
    ...CONFIG.PATRAO_DI_ZONA_ROLE_IDS,
  ].filter(Boolean);
  if (operationalRoleIds.some(id => interaction.member.roles.cache.has(id))) {
    return safeReply(
      interaction,
      { content: ONBOARDING.ALREADY_IN_HOUSE, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const memberRecord = await query(
    `SELECT id, role, status
       FROM members
      WHERE discord_id = $1
        AND deleted_at IS NULL
        AND coalesce(lifecycle_state::text, status, 'active') IN ('active','ativo','promoted')
      LIMIT 1`,
    [discordId]
  );
  if (memberRecord.rows.length > 0) {
    return safeReply(
      interaction,
      { content: ONBOARDING.HAS_ACTIVE_RECORD(memberRecord.rows[0].role), flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  const M = MODALS.TAG_REQUEST;
  const modal = new ModalBuilder()
    .setCustomId('onboard::modal_tropinha')
    .setTitle('Pedido: Tag Tropinha')
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

async function handleTropinhaModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const fullName = getModalField(interaction, 'full_name').trim();
  const nickname = getModalField(interaction, 'nickname').trim();
  const logoUrl = await getLogoUrl();

  if (!fullName || !nickname) {
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Nome e alcunha são obrigatórios.` },
      { messageClass: 'BANAL' }
    );
  }

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

  const tagChannel = await interaction.client.channels.fetch(CONFIG.TAG_REQUEST_CHANNEL_ID).catch(() => null);
  if (!tagChannel) {
    return safeReply(
      interaction,
      { content: ERRORS.GENERIC() + ' Canal de aprovação em falta.' },
      { messageClass: 'ERROR' }
    );
  }

  const embed = new EmbedBuilder()
    .setColor(0x7b2cbf)
    .setTitle('💜 Pedido: Tag Tropinha')
    .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
    .setFooter(footer(logoUrl))
    .addFields(
      { name: 'Pedido', value: '**Tag Tropinha**', inline: true },
      { name: 'Discord', value: `<@${interaction.user.id}>\n\`${interaction.user.username}\``, inline: true },
      { name: 'Nome', value: `**${fullName}**`, inline: true },
      { name: 'Alcunha', value: `**${nickname}**`, inline: true },
      { name: 'Tag a atribuir', value: '**Tropinha di Zona**', inline: true },
      { name: 'Nickname final', value: `\`${fullName} (${nickname})\``, inline: false }
    );

  const aBtn = BUTTONS.ONBOARDING.APROVAR;
  const dBtn = BUTTONS.ONBOARDING.NEGAR;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`onboard::approve_tropinha::${requestId}`)
      .setLabel(aBtn.label)
      .setStyle(ButtonStyle[aBtn.style])
      .setEmoji(aBtn.emoji),
    new ButtonBuilder()
      .setCustomId(`onboard::deny::${requestId}`)
      .setLabel(dBtn.label)
      .setStyle(ButtonStyle[dBtn.style])
      .setEmoji(dBtn.emoji)
  );

  const msg = await tagChannel.send({ embeds: [embed], components: [row] });
  await query('UPDATE tag_requests SET message_id = $1 WHERE id = $2', [msg.id, requestId]);

  const confirm = new EmbedBuilder()
    .setColor(0x7b2cbf)
    .setTitle('💜 Pedido recebido')
    .setDescription(
      `Recebemos o teu pedido de **Tag Tropinha** para **${fullName}** _(${nickname})_.\n\nA equipa vai analisar e responder assim que possível.`
    )
    .setFooter(footer(logoUrl));

  return safeReply(interaction, { embeds: [confirm] }, { messageClass: 'BANAL' });
}

async function handleApproveTropinhaButton(interaction) {
  if (!canManageOnboarding(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('aprovar tags'), flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const requestId = parseInt(interaction.customId.split('::')[2], 10);
  if (Number.isNaN(requestId)) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} Pedido inválido.` }, { messageClass: 'BANAL' });
  }

  const logoUrl = await getLogoUrl();
  const claim = await query(
    `UPDATE tag_requests SET approved_by = $1
      WHERE id = $2 AND status = 'pending' AND approved_by IS NULL
      RETURNING *`,
    [interaction.user.id, requestId]
  );
  const tagReq = claim.rows[0];
  if (!tagReq) {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} Este pedido já foi tratado ou não existe.` },
      { messageClass: 'BANAL' }
    );
  }
  tagReq.request_type = 'tropinha';

  const { processApproval } = require('./onboardingEngine');
  let result;
  try {
    result = await processApproval(tagReq, interaction.member, interaction.client);
  } catch (e) {
    await query("UPDATE tag_requests SET approved_by = NULL WHERE id = $1 AND status = 'pending'", [requestId]).catch(
      () => {}
    );
    throw e;
  }

  if (interaction.message?.embeds?.[0]) {
    const approved = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x2ecc71)
      .setTitle('✅ Tag Tropinha aprovada')
      .setFooter(footer(logoUrl))
      .addFields({ name: 'Aprovado por', value: `<@${interaction.user.id}>`, inline: true });
    await interaction.message.edit({ embeds: [approved], components: [] }).catch(() => {});
  }

  const lines = [`<@${tagReq.discord_id}> foi aprovado com **Tropinha di Zona**.`];
  for (const err of result.errors || []) {
    lines.push(`\n${EMOJI.WARN} ${err.phase}: ${err.message}`);
  }
  if (result.dmDelivery?.delivered === 'dm') lines.push(`\n${EMOJI.OK} DM enviada ao user.`);

  const reply = new EmbedBuilder()
    .setColor((result.errors || []).length ? 0xf39c12 : 0x2ecc71)
    .setTitle((result.errors || []).length ? 'Aprovado com avisos' : 'Aprovado')
    .setDescription(lines.join('\n'))
    .setFooter(footer(logoUrl));

  return safeReply(interaction, { embeds: [reply] }, { messageClass: 'BANAL' });
}

module.exports = { handlePedirTropinhaButton, handleTropinhaModal, handleApproveTropinhaButton };
