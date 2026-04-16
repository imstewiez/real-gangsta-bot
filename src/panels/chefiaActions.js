'use strict';
/**
 * Chefia panel — acções de botão que não pertencem a módulos maiores.
 *
 * Cobre os 5 botões mais leves do painel chefia:
 *   - abrir_disponibilidade
 *   - publicar_radio
 *   - listar_stickys
 *   - ver_tops
 *   - ver_logs
 *
 * Os restantes botões chefia (criar_saida, fechar_saida, registar_material,
 * gerir_materiais, etc.) vivem nos módulos de domínio respectivos.
 */

const { MessageFlags } = require('discord.js');
const CONFIG = require('../config');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, rankingEmbed } = require('../shared/embedBuilders');
const { ERRORS, EMOJI } = require('../content');
const { isChefia, isPatraoDiZona } = require('../permissions/permissionEngine');
const { radioRepo, stickyRepo } = require('../repositories');
const { getRecentLogs } = require('../audit/auditEngine');
const { weekBounds } = require('../util');

async function abrirDisponibilidade(interaction) {
  if (!isChefia(interaction.member) && !isPatraoDiZona(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('disponibilidade'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channelId = CONFIG.AVAILABILITY_CHANNEL_ID;
  if (!channelId) {
    return safeReply(interaction, {
      content: 'Define `AVAILABILITY_CHANNEL_ID` no .env primeiro.',
    }, { dismissible: true });
  }
  try {
    const { createSession } = require('../availability/availabilityEngine');
    const { session, alreadyOpen } = await createSession({
      client: interaction.client,
      channelId,
      createdBy: interaction.user.id,
    });
    if (alreadyOpen) {
      return safeReply(interaction, {
        content: `Já existe sessão #${session.id} aberta hoje.`,
      }, { dismissible: true });
    }
    return safeReply(interaction, {
      content: `${EMOJI.OK} Sessão #${session.id} publicada em <#${channelId}>.`,
    }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
  }
}

async function publicarRadio(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const states = await radioRepo.getAllStates();
  const { buildEmbed, buildComponents } = require('../radio/radioEngine');
  const client = interaction.client;
  const targetCh = CONFIG.RADIO_PUBLISH_CHANNEL_ID
    ? await client.channels.fetch(CONFIG.RADIO_PUBLISH_CHANNEL_ID).catch(() => null)
    : interaction.channel;
  if (!targetCh?.isTextBased?.()) {
    return safeReply(interaction, {
      content: 'Canal de publicação não disponível.',
    }, { dismissible: true });
  }
  await targetCh.send({ embeds: [buildEmbed(states)], components: buildComponents() });
  return safeReply(interaction, {
    content: `📻 Painel publicado em <#${targetCh.id}>.`,
  }, { dismissible: true });
}

async function listarStickys(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const all = await stickyRepo.listActive();
  if (!all.length) {
    return safeReply(interaction, { content: 'Sem stickys activas.' }, { dismissible: true });
  }
  const lines = all.map(s => `• <#${s.channel_id}> — \`${s.source_key}\` (${s.mode})`);
  return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
}

async function verTops(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { getCurrentWeekRanking } = require('../rankings/rankingEngine');
  const rankings = await getCurrentWeekRanking(10);
  const { start, end } = weekBounds();
  const weekLabel = `${start.toISOString().split('T')[0]} a ${end.toISOString().split('T')[0]}`;
  const embed = rankingEmbed('Top Semanal', rankings, weekLabel);
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

async function verLogs(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('ver logs'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const logs = await getRecentLogs(15);
  if (!logs.length) {
    return safeReply(interaction, { content: 'Sem logs.' }, { dismissible: true });
  }
  const lines = logs.map(l => `\`${l.created_at?.toISOString?.()?.split('T')[0] || ''}\` **${l.action}** — ${l.entity_type}`);
  const embed = brandEmbed().setTitle('Logs Recentes').setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = {
  abrirDisponibilidade,
  publicarRadio,
  listarStickys,
  verTops,
  verLogs,
};
