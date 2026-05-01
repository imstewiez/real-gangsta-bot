'use strict';
/**
 * Chefia panel — acções ligeiras do painel chefia:
 *   - listar_stickys
 *   - ver_tops
 *   - ver_logs
 *
 * Os restantes botões chefia (criar_saida, fechar_saida, registar_material,
 * gerir_materiais, etc.) vivem nos módulos de domínio respectivos.
 *
 * Disponibilidade diária é 100% automática via `availability_auto_publish`
 * (src/jobs/scheduler.js).
 *
 * Rádio tem painel sticky dedicado em RADIO_PANEL_CHANNEL_ID — publicado
 * pelo bootstrap de painéis. Sem botão chefia para publicar ad-hoc.
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, rankingEmbed } = require('../shared/embedBuilders');
const { ERRORS, EMOJI } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { requirePermission } = require('../shared/requirePermission');
const { stickyRepo } = require('../repositories');
const { getRecentLogs } = require('../audit/auditEngine');
const { weekBounds } = require('../util');
const { formatPtDate, formatPtDateOnly } = require('../shared/formatPtDate');
const CONFIG = require('../config');

async function listarStickys(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const all = await stickyRepo.listActive();
  if (!all.length) {
    return safeReply(interaction, { content: 'Sem stickys activas.' }, { messageClass: 'BANAL' });
  }
  const lines = all.map(s => `• <#${s.channel_id}> — \`${s.source_key}\` (${s.mode})`);
  return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { messageClass: 'BANAL' });
}

async function verTops(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { getCurrentWeekRanking } = require('../rankings/rankingEngine');
  const rankings = await getCurrentWeekRanking(10);
  const { start, end } = weekBounds();
  const weekLabel = `${formatPtDateOnly(start)} a ${formatPtDateOnly(end)}`;
  const embed = rankingEmbed('Top Semanal', rankings, weekLabel);
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

async function verLogs(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('ver logs'),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const logs = await getRecentLogs(15);
  if (!logs.length) {
    return safeReply(interaction, { content: 'Sem logs.' }, { messageClass: 'BANAL' });
  }
  const lines = logs.map(l => `\`${formatPtDate(l.created_at)}\` **${l.action}** — ${l.entity_type}`);
  const embed = brandEmbed().setTitle('Logs Recentes').setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

async function republicarDisponibilidade(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;

  const { createSession, closeSession } = require('../availability/availabilityEngine');
  const { availabilityRepo } = require('../repositories');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const channelId = CONFIG.AVAILABILITY_CHANNEL_ID;
  if (!channelId) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Canal de disponibilidade não configurado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }

  // Fechar sessão aberta actual (se existir)
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(new Date());
  const existing = await availabilityRepo.getOpenSession(channelId, date);
  let closedId = null;
  if (existing) {
    await closeSession({ client: interaction.client, sessionId: existing.id, actorId: interaction.user.id });
    closedId = existing.id;
  }

  // Criar nova sessão
  const { session, alreadyOpen } = await createSession({
    client: interaction.client,
    channelId,
    createdBy: interaction.user.id,
  });

  if (alreadyOpen) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Já existe uma sessão aberta para hoje (#${session.id}).`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  const lines = [
    `${EMOJI.OK} **Nova sessão de disponibilidade publicada.**`,
    `• Sessão: **#${session.id}**`,
    `• Canal: <#${channelId}>`,
  ];
  if (closedId) lines.push(`• Sessão anterior (#${closedId}) fechada.`);

  return safeReply(
    interaction,
    { content: lines.join('\n'), flags: MessageFlags.Ephemeral },
    { messageClass: 'BANAL' }
  );
}

async function republicarTodosPaineis(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;

  const { bootstrapAll } = require('../panelBootstrap');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const results = await bootstrapAll(interaction.client);

  const created = results.filter(r => r.status === 'created');
  const skipped = results.filter(r => r.status === 'skipped');
  const failed = results.filter(r => r.status === 'failed');

  const lines = [
    `${EMOJI.OK} **Painéis republicados.**`,
    `• ${created.length} publicados / ${skipped.length} skipped / ${failed.length} falhas`,
  ];
  if (created.length) {
    lines.push('', '🟢 **Publicados:**');
    for (const r of created) lines.push(`• ${r.key} → <#${r.channelId}>`);
  }
  if (skipped.length) {
    lines.push('', '⚪ **Skipped:**');
    for (const r of skipped.slice(0, 3)) lines.push(`• ${r.key}: ${r.reason}`);
    if (skipped.length > 3) lines.push(`• ... e mais ${skipped.length - 3}`);
  }
  if (failed.length) {
    lines.push('', '🔴 **Falhas:**');
    for (const r of failed) lines.push(`• ${r.key}: ${r.reason}`);
  }

  return safeReply(
    interaction,
    { content: lines.join('\n').slice(0, 1900), flags: MessageFlags.Ephemeral },
    { messageClass: 'BANAL' }
  );
}

module.exports = {
  listarStickys,
  verTops,
  verLogs,
  republicarDisponibilidade,
  republicarTodosPaineis,
};
