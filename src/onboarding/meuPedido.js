'use strict';
/**
 * Consulta do estado do pedido de tag do próprio user.
 * Partilhado entre:
 *   - Botão `onboard::meu_pedido` no painel de entrada
 *   - Slash command `/rg-meu-pedido`
 *
 * Devolve embed efémero com o estado do pedido mais recente:
 *   - sem pedidos   → info com CTA para "Dar a Cara"
 *   - pendente      → tempo desde submit, "a chefia vai ler"
 *   - aprovado      → data + canal individual (se ainda activo)
 *   - negado        → data + razão (se houver)
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { ONBOARDING, EMOJI } = require('../content');
const { formatPtDate } = require('../shared/formatPtDate');
const { query } = require('../db');

async function handleMeuPedido(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const r = await query(
    `SELECT status, full_name, nickname, created_at, resolved_at, denial_reason,
            channel_create_failed,
            (SELECT channel_id FROM members WHERE discord_id = $1 AND status='ativo' LIMIT 1) AS member_channel
       FROM tag_requests
      WHERE discord_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [interaction.user.id]
  );

  if (r.rows.length === 0) {
    return safeReply(interaction, { content: ONBOARDING.MY_REQUEST_NONE }, { messageClass: 'BANAL' });
  }

  const req = r.rows[0];

  if (req.status === 'pending') {
    const embed = brandEmbed('SHORT')
      .setColor(COLOR.WARNING_SOFT)
      .setTitle(ONBOARDING.MY_REQUEST_PENDING_TITLE)
      .setDescription(
        `Pediste em **${formatPtDate(req.created_at)}**.\n` +
          `Nome: **${req.full_name}** _(${req.nickname})_\n` +
          '\n' +
          `${EMOJI.PENDENTE} Estado: **a aguardar chefia**.\n` +
          'Vais receber DM assim que houver decisão — se tiveres DMs fechados, passamos no canal de entrada com menção.'
      );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
  }

  if (req.status === 'approved') {
    const channelLine = req.member_channel ? `\nCanal individual: <#${req.member_channel}>` : '';
    const warnLine = req.channel_create_failed
      ? `\n${EMOJI.WARN} _Canal individual ainda não existe — fala com a chefia._`
      : '';
    const embed = brandEmbed('SHORT')
      .setColor(COLOR.SUCCESS)
      .setTitle(ONBOARDING.MY_REQUEST_APPROVED_TITLE)
      .setDescription(
        `Aprovado em **${formatPtDate(req.resolved_at)}**.` +
          `\nNome: **${req.full_name}** _(${req.nickname})_` +
          channelLine +
          warnLine
      );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
  }

  if (req.status === 'denied') {
    const reasonLine = req.denial_reason ? `\n\n**Razão:** ${req.denial_reason}` : '';
    const embed = brandEmbed('SHORT')
      .setColor(COLOR.DANGER)
      .setTitle(ONBOARDING.MY_REQUEST_DENIED_TITLE)
      .setDescription(
        `Negado em **${formatPtDate(req.resolved_at)}**.\n` +
          `Pedido: **${req.full_name}** _(${req.nickname})_${reasonLine}\n` +
          '\n' +
          '_Para reapelar, fala directo com a chefia._'
      );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
  }

  // Estados desconhecidos ou cancelled — fallback genérico.
  return safeReply(
    interaction,
    { content: `${EMOJI.WARN} Estado desconhecido: **${req.status}**. Fala com a chefia.` },
    { messageClass: 'BANAL' }
  );
}

module.exports = { handleMeuPedido };
