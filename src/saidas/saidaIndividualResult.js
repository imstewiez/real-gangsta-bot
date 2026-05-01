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
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');

const { query } = require('../db');
const { saidaRepo, memberRepo } = require('../repositories');
const { safeReply, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { brandEmbed, errorEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { formatPtDate } = require('../shared/formatPtDate');
const { isChefia, isOficial } = require('../permissions/permissionEngine');
const { logAudit } = require('../audit/auditEngine');
const eventBus = require('../core/eventBus');
const { warn, log } = require('../logger');

// ═══════════════════════════════════════════════════════════════════════════
// A. RESULTADO INDIVIDUAL (participante) — 1 STEP: botão → modal directo
// ═══════════════════════════════════════════════════════════════════════════

// Normalizador S/N para campos de texto do modal
function _parseSN(value) {
  const v = (value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ['s', 'sim', 'yes', '1', 'y', 'true'].includes(v);
}

/**
 * Handler do botão "Preencher o meu Resultado" — abre modal DIRECTO.
 * Sem botões intermediários. Tudo num só modal de 3-5 campos.
 */
async function handleOpenSubmitResult(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.customId.split('::')[2], 10);

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Não estás registado na firma.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  const participants = await saidaRepo.getParticipants(saidaId);
  const me = participants.find(p => p.member_id === member.id);
  if (!me) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Não fizeste parte desta saída.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  const saida = await saidaRepo.findById(saidaId);
  if (!saida || !['em_liquidacao', 'concluida'].includes(saida.status)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.BLOQUEADO} A sessão ainda não foi fechada pela staff.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  // Se já submeteu e a saída está concluida → bloqueia (scoring já feito).
  // Se já submeteu mas está em em_liquidacao → permite editar (scoring ainda não correu).
  if (me.individual_result_submitted && saida.status === 'concluida') {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.OK} Já preencheste o teu resultado e a saída já foi finalizada — não pode ser alterado.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  const isEdit = me.individual_result_submitted;

  // Determinar se precisa da pergunta da arma
  const needsWeaponQ = me.received_org_material && !me.own_weapon;
  // Flag no customId: 'w' = needs weapon question, 'n' = no weapon question
  const wFlag = needsWeaponQ ? 'w' : 'n';

  // Pré-preencher com valores anteriores se for edição
  const prevSurvived = isEdit ? (me.survived ? 'S' : 'N') : '';
  const prevKills = isEdit ? String(me.kills || 0) : '0';
  const prevNotes = isEdit ? me.notes || '' : '';

  const fields = [
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('survived')
        .setLabel('Sobreviveste? (S ou N)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3)
        .setPlaceholder('S ou N')
        .setValue(prevSurvived)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('kills')
        .setLabel('Quantos kills fizeste?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3)
        .setPlaceholder('0')
        .setValue(prevKills)
    ),
  ];

  if (needsWeaponQ) {
    const prevWeapon = isEdit
      ? ['declared_returned', 'confirmed_returned'].includes(me.weapon_return_status)
        ? 'S'
        : 'N'
      : '';
    fields.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('weapon_returned')
          .setLabel('Devolveste a arma da org? (S ou N)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(3)
          .setPlaceholder('S ou N')
          .setValue(prevWeapon)
      )
    );
  }

  fields.push(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Notas (opcional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(300)
        .setValue(prevNotes)
    )
  );

  const modalTitle = isEdit ? `Editar Resultado — #${saidaId}` : `Resultado — Saída #${saidaId}`;
  const modal = new ModalBuilder()
    .setCustomId(`saida::submit_result_modal::${saidaId}::${wFlag}`)
    .setTitle(modalTitle.slice(0, 45))
    .addComponents(...fields);

  await safeShowModal(interaction, modal);
}

/**
 * Handler do submit do modal unificado.
 * Formato: saida::submit_result_modal::<saidaId>::<wFlag>
 * wFlag: 'w' = had weapon question, 'n' = no weapon question
 */
async function handleSubmitResultModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2], 10);
  const wFlag = parts[3]; // 'w' ou 'n'

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Não estás registado.`,
      },
      { messageClass: 'WARN' }
    );
  }

  const participants = await saidaRepo.getParticipants(saidaId);
  const me = participants.find(p => p.member_id === member.id);
  if (!me) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Não és participante desta saída.`,
      },
      { messageClass: 'WARN' }
    );
  }

  // Parse dos campos do modal
  const survived = _parseSN(getModalField(interaction, 'survived'));
  const died = !survived;
  const killsRaw = String(getModalField(interaction, 'kills') || '0').trim();
  const kills = Math.max(0, Math.min(99, parseInt(killsRaw, 10) || 0));
  const notes = String(getModalField(interaction, 'notes') || '').slice(0, 300);

  // Weapon return status
  let weaponReturnStatus = 'not_applicable';
  if (wFlag === 'w') {
    // Tinham arma da org
    if (died) {
      weaponReturnStatus = 'confirmed_not_returned'; // morreu → arma perdida
    } else {
      const returned = _parseSN(getModalField(interaction, 'weapon_returned'));
      weaponReturnStatus = returned ? 'declared_returned' : 'confirmed_not_returned';
    }
  } else if (me.own_weapon) {
    weaponReturnStatus = 'not_applicable';
  }

  // Verificar se a saída ainda permite edição (em_liquidacao = sim, concluida = não)
  const saida = await saidaRepo.findById(saidaId);
  const allowEdit = saida?.status === 'em_liquidacao';

  // Persiste — se em_liquidacao permite overwrite (edição); se concluida só aceita primeiro submit
  const upd = await query(
    `
    UPDATE operation_participants
       SET kills = $3,
           died  = $4,
           survived = $5,
           deaths_count = CASE WHEN $4 = TRUE THEN 1 ELSE 0 END,
           notes = $6,
           individual_result_submitted = TRUE,
           individual_result_at = NOW(),
           weapon_return_status = $7
     WHERE operation_id = $1 AND member_id = $2
       AND ($8 = TRUE OR individual_result_submitted = FALSE)
     RETURNING id
  `,
    [saidaId, member.id, kills, died, survived, notes, weaponReturnStatus, allowEdit]
  );

  if (upd.rowCount === 0) {
    return safeReply(
      interaction,
      {
        embeds: [errorEmbed('Não foi possível', 'A saída já foi finalizada — o resultado não pode ser alterado.')],
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  const isEdit = me.individual_result_submitted;

  await logAudit({
    action: 'saida_individual_result',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId: interaction.user.id,
    afterState: { memberId: member.id, kills, died, weaponReturnStatus, notes },
  });

  eventBus
    .emitAsync('saida.individual_result', {
      saidaId,
      memberId: member.id,
      discordId: interaction.user.id,
      kills,
      died,
      weaponReturnStatus,
      at: new Date(),
    })
    .catch(() => {});

  // Refresh session embed
  const saidaSession = require('./saidaSession');
  saidaSession.refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

  // Feedback ao participante
  const lines = [
    `${EMOJI.OK} Resultado ${isEdit ? '**editado**' : 'registado'} na **Saída #${saidaId}**.`,
    '',
    `• ${died ? `${EMOJI.MORTE} Morreste` : `${EMOJI.OK} Sobreviveste`}`,
    `• ${EMOJI.KILL} **${kills}** kill(s)`,
  ];
  if (weaponReturnStatus === 'declared_returned') {
    lines.push(`• ${EMOJI.ARMA} Declaraste que devolveste a arma — **pendente de confirmação staff**`);
  } else if (weaponReturnStatus === 'confirmed_not_returned') {
    lines.push(`• ${EMOJI.ARMA} Arma não devolvida (${died ? 'morreste com ela' : 'declaraste'})`);
  }

  // Auto-check: se todos preencheram, notificar staff
  _checkAllResultsSubmitted(interaction.client, saidaId).catch(() => {});

  return safeReply(interaction, { content: lines.join('\n') }, { messageClass: 'RESULT' });
}

/**
 * Handler do botão "Lembrar Pendentes" — re-pinga participantes que faltam.
 */
async function handleRepingPendentes(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!isChefia(interaction.member) && !isOficial(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.BLOQUEADO} Apenas staff pode lembrar pendentes.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const saidaId = parseInt(interaction.customId.split('::')[2], 10);

  const saida = await saidaRepo.findById(saidaId);
  if (!saida || saida.status !== 'em_liquidacao') {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Saída não está em liquidação.`,
      },
      { messageClass: 'BANAL' }
    );
  }

  const participants = await saidaRepo.getParticipants(saidaId);
  const pending = participants.filter(p => !p.individual_result_submitted);

  if (!pending.length) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.OK} Todos os participantes já preencheram!`,
      },
      { messageClass: 'BANAL' }
    );
  }

  // Enviar nova mensagem no canal da sessão com @ dos pendentes
  const channelId = saida.session_channel_id;
  if (!channelId) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Canal de sessão não configurado.`,
      },
      { messageClass: 'BANAL' }
    );
  }

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Canal de sessão não acessível.`,
      },
      { messageClass: 'BANAL' }
    );
  }

  const discordIds = pending.map(p => p.discord_id).filter(Boolean);
  const mentions = discordIds.map(id => `<@${id}>`).join(' ');

  const pendingLines = pending.map(p => {
    const typeTag =
      p.participant_type === 'trabalhador' ? `${EMOJI.TRABALHADOR} trabalhador` : `${EMOJI.ARMA} caracterizado`;
    const weaponTag = !p.own_weapon && p.received_org_material ? ` · ${EMOJI.MATERIAL} arma da org` : '';
    return `• ${EMOJI.PENDENTE} <@${p.discord_id}> — ${typeTag}${weaponTag}`;
  });

  const { brandEmbed: bEmbed } = require('../shared/embedBuilders');
  const embed = bEmbed('MOVEMENT')
    .setColor(COLOR.DANGER)
    .setTitle(`${EMOJI.WARN} Saída #${saidaId} — Faltam ${pending.length} resultado(s)!`)
    .setDescription(
      `**Preencham o vosso resultado!** Cliquem no botão **"${EMOJI.OK} Preencher o meu Resultado"** acima ↑\n\n` +
        pendingLines.join('\n') +
        '\n\n_A sessão não fecha sem os vossos dados._'
    );

  await channel
    .send({
      content: `${EMOJI.WARN} **Lembrete** — ${mentions}`,
      embeds: [embed],
      allowedMentions: { users: discordIds },
    })
    .catch(() => {});

  return safeReply(
    interaction,
    {
      content: `${EMOJI.OK} Lembrete enviado para **${pending.length}** participante(s) pendente(s).`,
    },
    { messageClass: 'BANAL' }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// B. WEAPON RETURN QUEUE (staff OG+)
// ═══════════════════════════════════════════════════════════════════════════

function _canConfirmWeapon(member) {
  return isOficial(member);
}

/**
 * Handler do botão "Confirmar Devoluções de Arma" no painel da sessão.
 * Mostra lista de devoluções pendentes com select por participante.
 */
async function handleOpenWeaponQueue(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!_canConfirmWeapon(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.BLOQUEADO} Apenas staff OG+ pode confirmar devoluções.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2], 10);
  const participants = await saidaRepo.getParticipants(saidaId);
  const pending = participants.filter(p => p.weapon_return_status === 'declared_returned');

  const embed = brandEmbed('MOVEMENT')
    .setColor(COLOR.WARNING_SOFT)
    .setTitle(`${EMOJI.ARMA} Devoluções pendentes — Saída #${saidaId}`);

  if (!pending.length) {
    embed.setDescription(
      'Não há devoluções pendentes de confirmação para esta saída.\n' +
        'Todas as armas já foram marcadas ou os participantes ainda não preencheram resultado.'
    );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  }

  const lines = pending.map(
    p =>
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
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
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
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} Participante não encontrado.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  const embed = brandEmbed('MOVEMENT')
    .setColor(COLOR.INFO)
    .setTitle(`${EMOJI.ARMA} Decisão — <@${p.discord_id}>`)
    .setDescription(
      `**${p.display_name || 'Participante'}** declarou devolução em ` +
        `\`${formatPtDate(p.individual_result_at)}\`.\n` +
        'Escolhe a decisão:'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`saida::weapon_decide::${saidaId}::${memberId}::confirmed`)
      .setLabel('Confirmar devolução')
      .setStyle(ButtonStyle.Success)
      .setEmoji(EMOJI.OK),
    new ButtonBuilder()
      .setCustomId(`saida::weapon_decide::${saidaId}::${memberId}::rejected`)
      .setLabel('Não devolveu')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(EMOJI.ERRO),
    new ButtonBuilder()
      .setCustomId(`saida::weapon_decide::${saidaId}::${memberId}::inconclusive`)
      .setLabel('Inconclusivo')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(EMOJI.TEMPO)
  );

  return safeReply(interaction, { embeds: [embed], components: [row] }, { messageClass: 'COCKPIT' });
}

/**
 * Handler da decisão — aplica status + emite evento.
 */
async function handleWeaponDecide(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!_canConfirmWeapon(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.BLOQUEADO} Sem permissão.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2], 10);
  const memberId = parseInt(parts[3], 10);
  const decision = parts[4]; // confirmed | rejected | inconclusive

  const statusMap = {
    confirmed: 'confirmed_returned',
    rejected: 'confirmed_not_returned',
    inconclusive: 'inconclusive',
  };
  const newStatus = statusMap[decision];
  if (!newStatus) {
    return safeReply(interaction, { content: 'Decisão inválida.' }, { messageClass: 'ERROR' });
  }

  // Guard: só podemos confirmar/rejeitar/inconclusivo se houve, de facto,
  // arma emitida pela org. Se o participante foi com arma própria
  // (own_weapon=true) ou se não recebeu material, não há arma a devolver.
  const partRow = await query(
    `SELECT own_weapon, received_org_material, weapon_return_status
       FROM operation_participants WHERE operation_id = $1 AND member_id = $2`,
    [saidaId, memberId]
  );
  const part = partRow.rows[0];
  if (!part) {
    return safeReply(
      interaction,
      {
        embeds: [errorEmbed('Participante não encontrado', 'Esta pessoa já não está inscrita na saída.')],
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }
  if (part.own_weapon || !part.received_org_material) {
    return safeReply(
      interaction,
      {
        embeds: [
          errorEmbed(
            'Sem arma a devolver',
            'Este participante foi com arma própria ou não recebeu material da org — nada a confirmar.'
          ),
        ],
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  const upd = await query(
    `
    UPDATE operation_participants
       SET weapon_return_status = $3,
           weapon_return_confirmed_by = $4,
           weapon_return_confirmed_at = NOW()
     WHERE operation_id = $1 AND member_id = $2
       AND weapon_return_status NOT IN ('confirmed_returned','confirmed_not_returned','inconclusive')
     RETURNING id
  `,
    [saidaId, memberId, newStatus, `discord:${interaction.user.id}`]
  );

  if (upd.rowCount === 0) {
    return safeReply(
      interaction,
      {
        embeds: [errorEmbed('Já resolvido', 'A devolução deste participante já foi confirmada por outro oficial.')],
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  await logAudit({
    action: 'weapon_return_decided',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId: interaction.user.id,
    afterState: { memberId, decision, newStatus },
  });

  // Emite evento
  const eventName =
    decision === 'confirmed'
      ? 'weapon.return_confirmed'
      : decision === 'rejected'
        ? 'weapon.return_rejected'
        : 'weapon.return_inconclusive';
  eventBus
    .emitAsync(eventName, {
      saidaId,
      memberId,
      actorId: interaction.user.id,
      at: new Date(),
    })
    .catch(() => {});

  // Refresh session embed
  const saidaSession = require('./saidaSession');
  saidaSession.refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

  // Uma confirmação de arma pode ter sido a última peça em falta — se todos
  // submeteram E já não há declared_returned, o auto-finalize devia arrancar
  // aqui. Antes só arrancava em handleSubmitResultModal, deixando saídas
  // em limbo se o último resultado submetido tinha arma a confirmar.
  _checkAllResultsSubmitted(interaction.client, saidaId).catch(() => {});

  const decisionLabel = {
    confirmed: `${EMOJI.OK} **Confirmada** — arma devolvida`,
    rejected: `${EMOJI.ERRO} **Rejeitada** — não devolveu`,
    inconclusive: `${EMOJI.TEMPO} **Inconclusivo** — precisa rever`,
  }[decision];

  log(`[WEAPON-RETURN] saida #${saidaId} member=${memberId} decision=${decision} by=${interaction.user.id}`);
  return safeReply(
    interaction,
    {
      content: `${decisionLabel} — registado na saída #${saidaId}.`,
    },
    { messageClass: 'BANAL' }
  );
}

/**
 * _checkAllResultsSubmitted — quando o último participante submete,
 * finaliza automaticamente a saída (antes era trigger de embed "todos
 * preencheram"; agora é auto-finalize).
 *
 * Fluxo novo:
 *   - após cada submit, chama getResultProgress
 *   - se allDone e saída ainda em_liquidacao → finalizeSaida com actor 'system:auto'
 *   - finalize corre scoring, publica embed de resultados, e deleta o
 *     session_message (cleanup do canal operacional)
 */
async function _checkAllResultsSubmitted(client, saidaId) {
  try {
    const saida = await saidaRepo.findById(saidaId);
    if (!saida) {
      warn(`[AUTO-FINALIZE] Saída #${saidaId} não encontrada.`);
      return;
    }
    if (saida.status !== 'em_liquidacao') {
      log(`[AUTO-FINALIZE] Saída #${saidaId} status=${saida.status}, skip (já tratada ou não em liquidação).`);
      return;
    }

    const saidaEngine = require('./saidaEngine');
    const progress = await saidaEngine.getResultProgress(saidaId);
    log(
      `[AUTO-FINALIZE] Saída #${saidaId} progress: ${progress.submitted}/${progress.total} pendingWeapons=${progress.pendingWeapons} allDone=${progress.allDone}`
    );
    if (!progress.allDone) {
      // Caso específico: todos submeteram mas há armas em declared_returned
      // à espera de confirmação OG+. Não auto-finalize — staff tem de
      // confirmar armas primeiro via "Confirmar Armas".
      if (progress.submitted >= progress.total && progress.pendingWeapons > 0) {
        log(
          `[AUTO-FINALIZE] Saída #${saidaId} tem ${progress.pendingWeapons} arma(s) por confirmar — skip auto-finalize.`
        );
      }
      return;
    }

    log(`[AUTO-FINALIZE] Saída #${saidaId} — a finalizar (todos submeteram + armas confirmadas).`);
    await saidaEngine.finalizeSaida(saidaId, 'system:auto');
    log(`[AUTO-FINALIZE] Saída #${saidaId} finalizada com sucesso.`);
  } catch (e) {
    // Log verboso para diagnosticar erros de auto-finalize que antes eram
    // engolidos silenciosamente (.catch(() => {}) no call site).
    warn(`[AUTO-FINALIZE] Saída #${saidaId} falhou: ${e.message}\n${e.stack || ''}`);
  }
}

/**
 * dmParticipantsForResults — envia DM a cada participante da saída com um
 * botão para preencher o resultado. Chamado pelo handleCloseSaidaModal
 * em vez do antigo ping público (removido em phase 4).
 *
 * Cada DM tem um embed com o resultado (Vitória/Derrota/…) e um botão
 * `saida::submit_result::<saidaId>`. Mesmo customId do botão no painel
 * da sessão — handler único (handleOpenSubmitResult).
 *
 * Se o user tiver DMs desligadas, a mensagem falha silenciosamente — o
 * user pode sempre usar o painel da sessão no canal.
 */
async function dmParticipantsForResults(client, saidaId, resultLabel) {
  if (!client) return;
  const saida = await saidaRepo.findById(saidaId);
  if (!saida) return;
  const participants = await saidaRepo.getParticipants(saidaId);
  if (!participants.length) return;

  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const { brandEmbed } = require('../shared/embedBuilders');

  for (const p of participants) {
    if (!p.discord_id) continue;
    try {
      const user = await client.users.fetch(p.discord_id).catch(() => null);
      if (!user) continue;
      const embed = brandEmbed('MOVEMENT')
        .setColor(COLOR.WARNING)
        .setTitle(`${EMOJI.SAIDA} Saída #${saidaId} — ${resultLabel}`)
        .setDescription(
          `A sessão **#${saidaId}** (spot: **${saida.spot || '—'}**) foi fechada pela chefia.\n\n` +
            'Preenche o teu resultado individual aqui — o modal pergunta:\n' +
            '• **Sobreviveste?**\n• **Quantas kills fizeste?**\n' +
            (p.received_org_material && !p.own_weapon ? '• **Arma devolvida?** (tinhas arma da org)\n' : '') +
            '\nQuando todos submetem, a saída fecha-se automaticamente.'
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::submit_result::${saidaId}`)
          .setLabel('Preencher o meu Resultado')
          .setStyle(ButtonStyle.Primary)
          .setEmoji(EMOJI.OK)
      );
      await user.send({ embeds: [embed], components: [row] }).catch(() => {});
    } catch (e) {
      warn(`[DM-RESULTS] DM a ${p.discord_id} falhou: ${e.message}`);
    }
  }
}

module.exports = {
  handleOpenSubmitResult,
  handleSubmitResultModal,
  handleRepingPendentes,
  handleOpenWeaponQueue,
  handleWeaponConfirmPick,
  handleWeaponDecide,
  dmParticipantsForResults,
};
