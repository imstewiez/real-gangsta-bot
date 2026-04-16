'use strict';
/**
 * Sessão de saída — embed interactivo com registo de participantes.
 *
 * Quando uma saída é criada, publica-se um embed público com:
 *   - detalhes da saída (spot, tipo, data, hora, líder)
 *   - slots ocupados (X/12 caracterizados, Y trabalhadores)
 *   - lista de inscritos (separados por tipo)
 *   - botões: Registar-me (caracterizado), Registar como Trabalhador, Cancelar Registo
 *
 * O embed é editado em tempo real à medida que membros se registam.
 *
 * CustomIds:
 *   saida::session_caracterizado::<saidaId>  - registar como caracterizado
 *   saida::session_trabalhador::<saidaId>    - registar como trabalhador
 *   saida::session_cancel::<saidaId>         - cancelar registo
 *   saida::session_weapon_modal::<saidaId>   - modal arma/notas
 */

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { saidaRepo, memberRepo } = require('../repositories');
const saidaEngine = require('./saidaEngine');
const { safeReply, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed, applyLogo, rankBadge } = require('../shared/embedBuilders');
const { EMOJI, SAIDA_TYPE } = require('../content');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { formatPtDate, formatPtDateOnly } = require('../shared/formatPtDate');

// ═══════════════════════════════════════════════════════════════════════════
// BUILD SESSION EMBED + COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

async function buildSessionEmbed(saidaId) {
  const saida = await saidaRepo.findById(saidaId);
  if (!saida) return null;

  const participants = await saidaRepo.getParticipants(saidaId);
  const characterized = participants.filter(p => p.participant_type === 'caracterizado');
  const workers = participants.filter(p => p.participant_type === 'trabalhador');
  const maxChar = saida.max_participants || 12;
  const slotsLeft = Math.max(0, maxChar - characterized.length);

  const type = SAIDA_TYPE[saida.operation_type] || saida.operation_type;
  // Data no formato canónico dd/mm/yyyy. Só mostra hora se foi marcada
  // (scheduled_time !== null && !== '00:00'); evita mostrar "00:00" à toa
  // para saídas onde a hora não é relevante.
  let dateLine = formatPtDateOnly(saida.date);
  if (saida.scheduled_time) {
    const t = String(saida.scheduled_time).slice(0, 5);
    if (t && t !== '00:00') dateLine += ` · ${t}`;
  }
  const leader = saida.leader_name ? `<@${saida.leader_discord_id}>` : '—';

  const isClosed = saida.status === 'cancelada';
  const isConcluded = saida.status === 'concluida';
  const isOpen = !isClosed && !isConcluded;

  const lines = [
    `${EMOJI.SAIDA} **Saída #${saida.id}** — ${type}`,
    '',
    `${EMOJI.ZONA} **Spot:** ${saida.spot || '—'}`,
    `📅 **Data:** ${dateLine}`,
    `${EMOJI.LIDER} **Líder:** ${leader}`,
    '',
    `${EMOJI.PARTICIPANTE} **Caracterizados:** ${characterized.length}/${maxChar} ${slotsLeft === 0 ? '(cheio)' : `(${slotsLeft} vagas)`}`,
    `${EMOJI.CRAFT} **Trabalhadores:** ${workers.length} (sem limite)`,
  ];

  if (saida.notes) lines.push(`\n${EMOJI.AUDIT} **Notas:** ${saida.notes}`);

  // Lista de inscritos com status da arma
  if (characterized.length) {
    lines.push('', `**── Caracterizados ──**`);
    for (const p of characterized) {
      const weapon = p.own_weapon ? '🔫 própria'
        : (p.received_org_material ? '📦 org' : '⏳ sem arma definida');
      const resultMark = p.individual_result_submitted ? ' ✅' : (isConcluded ? ' ⏳ resultado' : '');
      lines.push(`• <@${p.discord_id}> · ${weapon}${resultMark}`);
    }
  }
  if (workers.length) {
    lines.push('', `**── Trabalhadores ──**`);
    for (const p of workers) {
      const resultMark = p.individual_result_submitted ? ' ✅' : (isConcluded ? ' ⏳ resultado' : '');
      lines.push(`• <@${p.discord_id}>${resultMark}`);
    }
  }

  if (isClosed) {
    lines.push('', `${EMOJI.FECHAR} _Saída ${saida.status}. Registo encerrado._`);
  } else if (isConcluded) {
    const pendingResult = participants.filter(p => !p.individual_result_submitted).length;
    const pendingWeapon = characterized.filter(p => p.weapon_return_status === 'declared_returned').length;
    lines.push('', `${EMOJI.FECHAR} _Sessão concluída. Participantes — preencham o vosso resultado ↓_`);
    if (pendingResult > 0) lines.push(`⏳ **${pendingResult}** resultado(s) por preencher`);
    if (pendingWeapon > 0) lines.push(`${EMOJI.WARN} **${pendingWeapon}** devolução(ões) de arma pendente(s) de confirmação`);
  }

  const embedColor = isClosed ? 0x95A5A6 : (isConcluded ? 0xF39C12 : 0x3498DB);
  const embed = brandEmbed('MOVEMENT')
    .setColor(embedColor)
    .setDescription(lines.join('\n'));

  const components = [];

  if (isOpen) {
    // Row 1 — inscrição self-service
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::session_caracterizado::${saidaId}`)
        .setLabel(`Caracterizado (${characterized.length}/${maxChar})`)
        .setStyle(slotsLeft > 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji(EMOJI.SAIDA)
        .setDisabled(slotsLeft === 0),
      new ButtonBuilder()
        .setCustomId(`saida::session_trabalhador::${saidaId}`)
        .setLabel(`Trabalhador (${workers.length})`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji(EMOJI.CRAFT),
      new ButtonBuilder()
        .setCustomId(`saida::session_cancel::${saidaId}`)
        .setLabel('Cancelar Registo')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.APAGAR),
    ));

    // Row 2 — staff (permissão verificada no handler)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`session::issue_material::${saidaId}`)
        .setLabel('Staff: Fornecer Arma/Material')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(EMOJI.FORNECER),
      new ButtonBuilder()
        .setCustomId(`session::close::${saidaId}`)
        .setLabel('Staff: Fechar Sessão')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.FECHAR),
    ));
  } else if (isConcluded) {
    // Row 1 — resultado individual (self-service pós-fecho)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::submit_result::${saidaId}`)
        .setLabel('Preencher o meu Resultado')
        .setStyle(ButtonStyle.Success)
        .setEmoji(EMOJI.OK),
    ));

    // Row 2 — staff OG+ confirma devoluções
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::weapon_queue::${saidaId}`)
        .setLabel('Staff: Confirmar Devoluções de Arma')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔫'),
    ));
  }

  return { embed, components };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH SESSION EMBED (chamado ao criar saída)
// ═══════════════════════════════════════════════════════════════════════════

async function publishSessionEmbed(client, saidaId) {
  const channelId = CONFIG.SAIDA_SESSION_CHANNEL_ID || CONFIG.SAIDA_RESULTS_CHANNEL_ID;
  if (!channelId || !client) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) return null;

  const session = await buildSessionEmbed(saidaId);
  if (!session) return null;

  try {
    const msg = await channel.send({
      embeds: [session.embed],
      components: session.components,
      allowedMentions: { parse: [] },
    });
    await saidaRepo.updateSessionMessage(saidaId, msg.id, channelId);
    log(`[SAIDA-SESSION] Embed publicado para saída #${saidaId} em ${channelId}.`);
    return msg;
  } catch (e) {
    warn(`[SAIDA-SESSION] Falha a publicar: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE SESSION EMBED (chamado após cada registo/cancelamento)
// ═══════════════════════════════════════════════════════════════════════════

async function refreshSessionEmbed(client, saidaId) {
  const saida = await saidaRepo.findById(saidaId);
  if (!saida?.session_message_id || !saida?.session_channel_id) return;
  if (!client) return;

  try {
    const channel = await client.channels.fetch(saida.session_channel_id).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(saida.session_message_id).catch(() => null);
    if (!msg) return;

    const session = await buildSessionEmbed(saidaId);
    if (!session) return;

    await msg.edit({
      embeds: [session.embed],
      components: session.components,
    });
  } catch (e) {
    warn(`[SAIDA-SESSION] Refresh falhou: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS — registo interactivo
// ═══════════════════════════════════════════════════════════════════════════

async function handleSessionCaracterizado(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.customId.split('::')[2]);
  return _openRegistrationModal(interaction, saidaId, 'caracterizado');
}

async function handleSessionTrabalhador(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.customId.split('::')[2]);
  return _openRegistrationModal(interaction, saidaId, 'trabalhador');
}

async function _openRegistrationModal(interaction, saidaId, participantType) {
  const typeLabel = participantType === 'caracterizado' ? 'Caracterizado' : 'Trabalhador';
  const modal = new ModalBuilder()
    .setCustomId(`saida::session_weapon_modal::${saidaId}::${participantType}`)
    .setTitle(`Registar — ${typeLabel}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('own_weapon')
          .setLabel('Arma própria? (S/N)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(3).setPlaceholder('N')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes')
          .setLabel('Notas (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false).setMaxLength(300)),
    );
  await safeShowModal(interaction, modal);
}

async function handleRegistrationModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const participantType = parts[3]; // 'caracterizado' ou 'trabalhador'

  const ownWeaponRaw = getModalField(interaction, 'own_weapon').toLowerCase().trim();
  const ownWeapon = ownWeaponRaw.startsWith('s') || ownWeaponRaw.startsWith('y') || ownWeaponRaw === '1';
  const notes = getModalField(interaction, 'notes') || '';

  try {
    await saidaEngine.addParticipant(saidaId, interaction.user.id, {
      participantType,
      ownWeapon,
      broughtOwn: ownWeapon,
      notes,
    }, interaction.user.id, interaction.guild);

    const typeLabel = participantType === 'caracterizado' ? 'caracterizado' : 'trabalhador';
    const weaponLabel = ownWeapon ? 'arma própria' : 'sem arma própria';

    await safeReply(interaction, {
      content: `${EMOJI.OK} Registado na saída **#${saidaId}** como **${typeLabel}** (${weaponLabel}).`,
    }, { dismissible: true });

    // Refresh session embed
    refreshSessionEmbed(interaction.client, saidaId).catch(() => {});
  } catch (e) {
    await safeReply(interaction, {
      content: `${EMOJI.ERRO} ${e.message}`,
    }, { dismissible: true });
  }
}

async function handleSessionCancel(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2]);
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} Não estás registado no sistema.` }, { dismissible: true });
  }

  const participants = await saidaRepo.getParticipants(saidaId);
  const existing = participants.find(p => p.discord_id === interaction.user.id);
  if (!existing) {
    return safeReply(interaction, { content: `${EMOJI.INFO} Não estás inscrito nesta saída.` }, { dismissible: true });
  }

  // Não permite cancelar se já liquidado/settled
  if (existing.settled) {
    return safeReply(interaction, { content: `${EMOJI.BLOQUEADO} Já foste liquidado — não podes cancelar.` }, { dismissible: true });
  }

  // Remove participant
  const { query } = require('../db');
  await query(`DELETE FROM operation_participants WHERE operation_id = $1 AND member_id = $2`, [saidaId, member.id]);

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'saida_participant_removed',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId: interaction.user.id,
    afterState: { memberId: member.id, displayName: member.display_name, reason: 'auto-cancelamento' },
  });

  await safeReply(interaction, {
    content: `${EMOJI.OK} Registo cancelado na saída **#${saidaId}**.`,
  }, { dismissible: true });

  refreshSessionEmbed(interaction.client, saidaId).catch(() => {});
}

module.exports = {
  buildSessionEmbed,
  publishSessionEmbed,
  refreshSessionEmbed,
  handleSessionCaracterizado,
  handleSessionTrabalhador,
  handleRegistrationModal,
  handleSessionCancel,
};
