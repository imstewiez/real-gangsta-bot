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
const { ERRORS } = require('../content');
const { isChefia } = require('../permissions/permissionEngine');
const { stickyRepo } = require('../repositories');
const { getRecentLogs } = require('../audit/auditEngine');
const { weekBounds } = require('../util');
const { formatPtDate, formatPtDateOnly } = require('../shared/formatPtDate');

async function listarStickys(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const all = await stickyRepo.listActive();
  if (!all.length) {
    return safeReply(interaction, { content: 'Sem stickys activas.' }, { messageClass: 'BANAL' });
  }
  const lines = all.map(s => `• <#${s.channel_id}> — \`${s.source_key}\` (${s.mode})`);
  return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { messageClass: 'BANAL' });
}

async function verTops(interaction) {
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

module.exports = {
  listarStickys,
  verTops,
  verLogs,
};
