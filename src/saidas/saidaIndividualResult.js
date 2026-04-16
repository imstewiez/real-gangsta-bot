'use strict';
/**
 * Resultado individual do participante (self-service) + confirmação de
 * devolução de arma por staff OG+.
 *
 * Fluxos:
 *
 *  A. Participante → saida::submit_result::<saidaId>
 *     abre modal:
 *       · Sobrevivi / Morri
 *       · Kills
 *       · Devolvi arma? (S/N)   [ignorado se morreu]
 *       · Notas
 *     → actualiza operation_participants:
 *         individual_result_submitted = true
 *         died, kills, notes
 *         weapon_return_status =
 *            "not_applicable"      se own_weapon=true (levou arma própria)
 *            "confirmed_not_returned" se died=true
 *            "declared_returned"   se declarou devolução (pendente OG+)
 *            "none"                se declarou não devolveu
 *
 *  B. Staff OG+ → saida::weapon_queue::<saidaId>
 *     mostra lista de participantes com weapon_return_status = declared_returned.
 *     Por cada um, select com:
 *       · ✅ Confirmar devolução
 *       · ⛔ Rejeitar (não devolveu)
 *       · ⏱️ Marcar inconclusivo
 *     → actualiza weapon_return_status + disciplina/stats
 *     → emite eventos weapon.return_confirmed / weapon.return_rejected
 */

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, MessageFlags,
} = require('discord.js');

const { query } = require('../db');
const { saidaRepo, memberRepo } = require('../repositories');
const {
  safeReply, safeShowModal, getModalField, isDuplicate,
} = require('../shared/interactionHelpers');
const { brandEmbed } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { formatPtDate } = require('../shared/formatPtDate');
const { isChefia, isOficial } = require('../permissions/permissionEngine');
const { logAudit } = require('../audit/auditEngine');
const eventBus = require('../core/eventBus');
const { warn, log } = require('../logger');

// ═══════════════════════════════════════════════════════════════════════════
// A. RESULTADO INDIVIDUAL (participante)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handler do botão "Preencher o meu Resultado" no painel da sessão.
 * Verifica:
 *   - user é participante desta saída
 *   - saida está concluida
 *   - ainda não submeteu resultado
 */
async function handleOpenSubmitResult(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.customId.split('::')[2], 10);

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(interaction, {
      content: `${EMOJI.ERRO} Não estás registado na firma.`,
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

  const participants = await saidaRepo.getParticipants(saidaId);
  const me = participants.find(p => p.member_id === member.id);
  if (!me) {
    return safeReply(interaction, {
      content: `${EMOJI.ERRO} Não fizeste parte desta saída.`,
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

  const saida = await saidaRepo.findById(saidaId);
  if (saida?.status !== 'concluida') {
    return safeReply(interaction, {
      content: `${EMOJI.BLOQUEADO} A sessão ainda não foi fechada pela staff.`,
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

  if (me.individual_result_submitted) {
    return safeReply(interaction, {
      content: `${EMOJI.OK} Já preencheste o teu resultado nesta saída.`,
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'BANAL' });
  }

  // Modal — 4 campos, simples
  const modal = new ModalBuilder()
    .setCustomId(`saida::submit_result_modal::${saidaId}`)
    .setTitle(`Resultado — Saída #${saidaId}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('survived')
          .setLabel('Sobrevivi? (S/N) · N = morri')
          .setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(3).setPlaceholder('S')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('kills')
          .setLabel('Kills que fiz')
          .setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(3).setPlaceholder('0')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('returned_weapon')
          .setLabel('Devolvi a arma? (S/N) · ignora se morri')
          .setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(3).setPlaceholder('S')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes')
          .setLabel('Notas (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false).setMaxLength(300)),
    );
  await safeShowModal(interaction, modal);
}

function _yesNo(raw, defaultValue = false) {
  const v = String(raw || '').toLowerCase().trim();
  if (!v) return defaultValue;
  return v.startsWith('s') || v.startsWith('y') || v === '1';
}

/**
 * Handler do submit do modal.
 */
async function handleSubmitResultModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2], 10);
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(interaction, {
      content: `${EMOJI.ERRO} Não estás registado.`,
    }, { messageClass: 'WARN' });
  }

  const participants = await saidaRepo.getParticipants(saidaId);
  const me = participants.find(p => p.member_id === member.id);
  if (!me) {
    return safeReply(interaction, {
      content: `${EMOJI.ERRO} Não és participante desta saída.`,
    }, { messageClass: 'WARN' });
  }

  const survived = _yesNo(getModalField(interaction, 'survived'), true);
  const died = !survived;
  const killsRaw = String(getModalField(interaction, 'kills') || '0').trim();
  const kills = Math.max(0, Math.min(99, parseInt(killsRaw, 10) || 0));
  const declaredReturn = _yesNo(getModalField(interaction, 'returned_weapon'), true);
  const notes = String(getModalField(interaction, 'notes') || '').slice(0, 300);

  // ── Regras de weapon_return_status ─────────────────────────────────────
  // 1. Trabalhador OU arma própria → not_applicable (não há arma da casa)
  // 2. Morreu → confirmed_not_returned (automático — perdeu arma)
  // 3. Disse que devolveu → declared_returned (pendente OG+)
  // 4. Disse que não devolveu → confirmed_not_returned (já é definitivo)
  let weaponReturnStatus;
  if (me.participant_type === 'trabalhador' || me.own_weapon) {
    weaponReturnStatus = 'not_applicable';
  } else if (died) {
    weaponReturnStatus = 'confirmed_not_returned';
  } else if (declaredReturn) {
    weaponReturnStatus = 'declared_returned';
  } else {
    weaponReturnStatus = 'confirmed_not_returned';
  }

  // Persiste
  await query(`
    UPDATE operation_participants
       SET kills = $3,
           died  = $4,
           survived = $5,
           notes = COALESCE(NULLIF($6, ''), notes),
           individual_result_submitted = TRUE,
           individual_result_at = NOW(),
           weapon_return_status = $7
     WHERE operation_id = $1 AND member_id = $2
  `, [saidaId, member.id, kills, died, survived, notes, weaponReturnStatus]);

  await logAudit({
    action: 'saida_individual_result',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId: interaction.user.id,
    afterState: { memberId: member.id, kills, died, weaponReturnStatus, notes },
  });

  // Event — invalida tabs Sheets + potencial routing
  eventBus.emitAsync('saida.individual_result', {
    saidaId, memberId: member.id, discordId: interaction.user.id,
    kills, died, weaponReturnStatus, at: new Date(),
  }).catch(() => {});

  // Refresh da session embed
  const saidaSession = require('./saidaSession');
  saidaSession.refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

  const lines = [
    `${EMOJI.OK} Resultado registado na **Saída #${saidaId}**.`,
    '',
    `• ${died ? `${EMOJI.MORTE} Morreste` : `${EMOJI.OK} Sobreviveste`}`,
    `• ${EMOJI.KILL} **${kills}** kill(s)`,
  ];
  if (weaponReturnStatus === 'declared_returned') {
    lines.push(`• 🔫 Declaraste que devolveste a arma — **pendente de confirmação OG+**`);
  } else if (weaponReturnStatus === 'confirmed_not_returned') {
    lines.push(`• 🔫 Arma não devolvida (${died ? 'morreste' : 'declaraste'})`);
  } else if (weaponReturnStatus === 'not_applicable') {
    lines.push(`• 🔫 Arma própria — sem devolução à casa`);
  }

  return safeReply(interaction, { content: lines.join('\n') }, { messageClass: 'RESULT' });
}

// ═══════════════════════════════════════════════════════════════════════════
// B. WEAPON RETURN QUEUE (staff OG+)
// ═══════════════════════════════════════════════════════════════════════════

function _canConfirmWeapon(member) {
  return isChefia(member) || isOficial(member);
}

/**
 * Handler do botão "Confirmar Devoluções de Arma" no painel da sessão.
 * Mostra lista de devoluções pendentes com select por participante.
 */
async function handleOpenWeaponQueue(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!_canConfirmWeapon(interaction.member)) {
    return safeReply(interaction, {
      content: `${EMOJI.BLOQUEADO} Apenas staff OG+ pode confirmar devoluções.`,
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2], 10);
  const participants = await saidaRepo.getParticipants(saidaId);
  const pending = participants.filter(p => p.weapon_return_status === 'declared_returned');

  const embed = brandEmbed('MOVEMENT')
    .setColor(0xF39C12)
    .setTitle(`🔫 Devoluções pendentes — Saída #${saidaId}`);

  if (!pending.length) {
    embed.setDescription(
      'Não há devoluções pendentes de confirmação para esta saída.\n' +
      'Todas as armas já foram marcadas ou os participantes ainda não preencheram resultado.'
    );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  }

  const lines = pending.map(p =>
    `• <@${p.discord_id}> — ${p.display_name || ''} · declarou devolução em \`${formatPtDate(p.individual_result_at)}\``
  );
  embed.setDescription(lines.join('\n'));

  // Select para escolher participante
  const options = pending.slice(0, 25).map(p => ({
    label: (p.display_name || `Membro ${p.member_id}`).slice(0, 100),
    description: `Declarou em ${formatPtDate(p.individual_result_at)}`.slice(0, 100),
    value: String(p.member_id),
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`saida::weapon_confirm_pick::${saidaId}`)
      .setPlaceholder('Escolhe participante para decidir')
      .setMinValues(1).setMaxValues(1)
      .addOptions(options),
  );

  return safeReply(interaction, { embeds: [embed], components: [row] }, { messageClass: 'COCKPIT' });
}

/**
 * Handler do select "escolhe participante" → mostra botões de decisão.
 */
async function handleWeaponConfirmPick(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!_canConfirmWeapon(interaction.member)) return;

  await interaction.deferUpdate().catch(() => {});
  const saidaId = parseInt(interaction.customId.split('::')[2], 10);
  const memberId = parseInt(interaction.values[0], 10);

  const participants = await saidaRepo.getParticipants(saidaId);
  const p = participants.find(x => x.member_id === memberId);
  if (!p) {
    return safeReply(interaction, {
      content: `${EMOJI.ERRO} Participante não encontrado.`,
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

  const embed = brandEmbed('MOVEMENT')
    .setColor(0x3498DB)
    .setTitle(`🔫 Decisão — <@${p.discord_id}>`)
    .setDescription(
      `**${p.display_name || 'Participante'}** declarou devolução em ` +
      `\`${formatPtDate(p.individual_result_at)}\`.\n` +
      'Escolhe a decisão:',
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`saida::weapon_decide::${saidaId}::${memberId}::confirmed`)
      .setLabel('Confirmar devolução')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`saida::weapon_decide::${saidaId}::${memberId}::rejected`)
      .setLabel('Não devolveu')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⛔'),
    new ButtonBuilder()
      .setCustomId(`saida::weapon_decide::${saidaId}::${memberId}::inconclusive`)
      .setLabel('Inconclusivo')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⏱️'),
  );

  return safeReply(interaction, { embeds: [embed], components: [row] }, { messageClass: 'COCKPIT' });
}

/**
 * Handler da decisão — aplica status + emite evento.
 */
async function handleWeaponDecide(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!_canConfirmWeapon(interaction.member)) {
    return safeReply(interaction, {
      content: `${EMOJI.BLOQUEADO} Sem permissão.`,
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2], 10);
  const memberId = parseInt(parts[3], 10);
  const decision = parts[4]; // confirmed | rejected | inconclusive

  const statusMap = {
    confirmed:    'confirmed_returned',
    rejected:     'confirmed_not_returned',
    inconclusive: 'inconclusive',
  };
  const newStatus = statusMap[decision];
  if (!newStatus) {
    return safeReply(interaction, { content: 'Decisão inválida.' }, { messageClass: 'ERROR' });
  }

  await query(`
    UPDATE operation_participants
       SET weapon_return_status = $3,
           weapon_return_confirmed_by = $4,
           weapon_return_confirmed_at = NOW()
     WHERE operation_id = $1 AND member_id = $2
  `, [saidaId, memberId, newStatus, `discord:${interaction.user.id}`]);

  await logAudit({
    action: 'weapon_return_decided',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId: interaction.user.id,
    afterState: { memberId, decision, newStatus },
  });

  // Emite evento
  const eventName = decision === 'confirmed' ? 'weapon.return_confirmed'
                  : decision === 'rejected'  ? 'weapon.return_rejected'
                  : 'weapon.return_inconclusive';
  eventBus.emitAsync(eventName, {
    saidaId, memberId, actorId: interaction.user.id, at: new Date(),
  }).catch(() => {});

  // Refresh session embed
  const saidaSession = require('./saidaSession');
  saidaSession.refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

  const decisionLabel = {
    confirmed:    '✅ **Confirmada** — arma devolvida',
    rejected:     '⛔ **Rejeitada** — não devolveu',
    inconclusive: '⏱️ **Inconclusivo** — precisa rever',
  }[decision];

  log(`[WEAPON-RETURN] saida #${saidaId} member=${memberId} decision=${decision} by=${interaction.user.id}`);
  return safeReply(interaction, {
    content: `${decisionLabel} — registado na saída #${saidaId}.`,
  }, { messageClass: 'BANAL' });
}

module.exports = {
  handleOpenSubmitResult,
  handleSubmitResultModal,
  handleOpenWeaponQueue,
  handleWeaponConfirmPick,
  handleWeaponDecide,
};
