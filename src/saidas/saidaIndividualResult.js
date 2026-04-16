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
const { brandEmbed, errorEmbed } = require('../shared/embedBuilders');
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

  // STEP 1 — ephemeral: escolhe Sobrevivi / Morri via botão.
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`saida::res_outcome::${saidaId}::survived`)
      .setLabel('Sobrevivi')
      .setStyle(ButtonStyle.Success)
      .setEmoji(EMOJI.OK),
    new ButtonBuilder()
      .setCustomId(`saida::res_outcome::${saidaId}::died`)
      .setLabel('Morri')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(EMOJI.MORTE),
  );

  return safeReply(interaction, {
    content: `**Saída #${saidaId}** — o que te aconteceu?`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  }, { messageClass: 'FLOW' });
}

// STEP 2 — clicou Sobrevivi/Morri. Se era caracterizado com arma da org
// e sobreviveu, vai para step 3 (perguntar devolução). Caso contrário,
// salta para o modal de kills/notes.
async function handleResOutcome(interaction) {
  if (isDuplicate(interaction.id)) return;
  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2], 10);
  const outcome = parts[3]; // 'survived' | 'died'

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  const participants = await saidaRepo.getParticipants(saidaId);
  const me = participants.find(p => p.member_id === member?.id);
  if (!me) {
    return safeReply(interaction, {
      content: `${EMOJI.ERRO} Não és participante desta saída.`,
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

  const hadOrgWeapon = me.received_org_material && !me.own_weapon;
  const needsWeaponQuestion = outcome === 'survived' && hadOrgWeapon;

  if (needsWeaponQuestion) {
    // STEP 3 — ephemeral: devolveste a arma?
    await interaction.deferUpdate();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::res_weapon::${saidaId}::survived::returned`)
        .setLabel('Devolvi a arma')
        .setStyle(ButtonStyle.Success)
        .setEmoji(EMOJI.DEVOLVER),
      new ButtonBuilder()
        .setCustomId(`saida::res_weapon::${saidaId}::survived::not_returned`)
        .setLabel('Não devolvi')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.ERRO),
      new ButtonBuilder()
        .setCustomId(`saida::res_weapon::${saidaId}::survived::lost`)
        .setLabel('Perdi na rua')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(EMOJI.PERDIDO),
    );
    return interaction.editReply({
      content: `**Saída #${saidaId}** — e a arma da org que levaste?`,
      components: [row],
    });
  }

  // Saltou o passo da arma (morreu ou não tinha arma da org).
  // Abrir modal directamente — weapon decision encoded como "skip".
  const weaponDecision = outcome === 'died' ? 'died_auto' : 'no_org_weapon';
  return _openResultModal(interaction, saidaId, outcome, weaponDecision);
}

// STEP 3 — clicou decisão da arma. Abre modal para kills + notes.
async function handleResWeapon(interaction) {
  if (isDuplicate(interaction.id)) return;
  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2], 10);
  const outcome = parts[3]; // 'survived' (morri não chega aqui)
  const weaponDecision = parts[4]; // 'returned' | 'not_returned' | 'lost'
  return _openResultModal(interaction, saidaId, outcome, weaponDecision);
}

async function _openResultModal(interaction, saidaId, outcome, weaponDecision) {
  const modal = new ModalBuilder()
    .setCustomId(`saida::submit_result_modal::${saidaId}::${outcome}::${weaponDecision}`)
    .setTitle(`Resultado — Saída #${saidaId}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('kills')
          .setLabel('Kills que fiz')
          .setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(3).setPlaceholder('0').setValue('0')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes')
          .setLabel('Notas (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false).setMaxLength(300)),
    );
  await safeShowModal(interaction, modal);
}

/**
 * Handler do submit do modal. CustomId encoda outcome + weaponDecision
 * que vieram dos botões dos steps 2 e 3 (sem S/N text).
 * Formato: saida::submit_result_modal::<saidaId>::<outcome>::<weaponDecision>
 */
async function handleSubmitResultModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2], 10);
  const outcome = parts[3];          // 'survived' | 'died'
  const weaponDecision = parts[4];   // 'returned' | 'not_returned' | 'lost' | 'died_auto' | 'no_org_weapon'

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

  const survived = outcome === 'survived';
  const died = !survived;
  const killsRaw = String(getModalField(interaction, 'kills') || '0').trim();
  const kills = Math.max(0, Math.min(99, parseInt(killsRaw, 10) || 0));
  const notes = String(getModalField(interaction, 'notes') || '').slice(0, 300);

  // ── Regras de weapon_return_status ─────────────────────────────────────
  // Decisão vem directa dos botões (no text parse).
  const WEAPON_STATUS_MAP = {
    died_auto:       'confirmed_not_returned', // morreu → arma perdida auto
    no_org_weapon:   'not_applicable',          // trabalhador ou arma própria
    returned:        'declared_returned',       // pendente confirmação OG+
    not_returned:    'confirmed_not_returned',  // admissão definitiva
    lost:            'confirmed_not_returned',  // perdida na rua = não devolvida
  };
  const weaponReturnStatus = WEAPON_STATUS_MAP[weaponDecision] || 'not_applicable';

  // Persiste — UPDATE idempotente: só aceita se `individual_result_submitted`
  // ainda é FALSE. Duplo-clique / race condition não sobrepõe o resultado
  // já submetido.
  const upd = await query(`
    UPDATE operation_participants
       SET kills = $3,
           died  = $4,
           survived = $5,
           notes = COALESCE(NULLIF($6, ''), notes),
           individual_result_submitted = TRUE,
           individual_result_at = NOW(),
           weapon_return_status = $7
     WHERE operation_id = $1 AND member_id = $2
       AND individual_result_submitted = FALSE
     RETURNING id
  `, [saidaId, member.id, kills, died, survived, notes, weaponReturnStatus]);

  if (upd.rowCount === 0) {
    return safeReply(interaction, {
      embeds: [errorEmbed('Já submetido', 'O teu resultado já foi registado. Não pode ser alterado.')],
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

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
    return safeReply(interaction, {
      embeds: [errorEmbed('Participante não encontrado', 'Esta pessoa já não está inscrita na saída.')],
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }
  if (part.own_weapon || !part.received_org_material) {
    return safeReply(interaction, {
      embeds: [errorEmbed('Sem arma a devolver', 'Este participante foi com arma própria ou não recebeu material da org — nada a confirmar.')],
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

  const upd = await query(`
    UPDATE operation_participants
       SET weapon_return_status = $3,
           weapon_return_confirmed_by = $4,
           weapon_return_confirmed_at = NOW()
     WHERE operation_id = $1 AND member_id = $2
       AND weapon_return_status NOT IN ('confirmed_returned','confirmed_not_returned','inconclusive')
     RETURNING id
  `, [saidaId, memberId, newStatus, `discord:${interaction.user.id}`]);

  if (upd.rowCount === 0) {
    return safeReply(interaction, {
      embeds: [errorEmbed('Já resolvido', 'A devolução deste participante já foi confirmada por outro oficial.')],
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

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
  handleResOutcome,
  handleResWeapon,
  handleSubmitResultModal,
  handleOpenWeaponQueue,
  handleWeaponConfirmPick,
  handleWeaponDecide,
};
