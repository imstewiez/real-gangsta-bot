'use strict';
/**
 * Resultado individual do participante (self-service) + confirma├º├úo de
 * devolu├º├úo de arma por staff OG+.
 *
 * Fluxos:
 *
 *  A. Participante ÔåÆ saida::submit_result::<saidaId>
 *     abre modal:
 *       ┬À Sobrevivi / Morri
 *       ┬À Kills
 *       ┬À Devolvi arma? (S/N)   [ignorado se morreu]
 *       ┬À Notas
 *     ÔåÆ actualiza operation_participants:
 *         individual_result_submitted = true
 *         died, kills, notes
 *         weapon_return_status =
 *            "not_applicable"      se own_weapon=true (levou arma pr├│pria)
 *            "confirmed_not_returned" se died=true
 *            "declared_returned"   se declarou devolu├º├úo (pendente OG+)
 *            "none"                se declarou n├úo devolveu
 *
 *  B. Staff OG+ ÔåÆ saida::weapon_queue::<saidaId>
 *     mostra lista de participantes com weapon_return_status = declared_returned.
 *     Por cada um, select com:
 *       ┬À Ô£à Confirmar devolu├º├úo
 *       ┬À Ôøö Rejeitar (n├úo devolveu)
 *       ┬À ÔÅ▒´©Å Marcar inconclusivo
 *     ÔåÆ actualiza weapon_return_status + disciplina/stats
 *     ÔåÆ emite eventos weapon.return_confirmed / weapon.return_rejected
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

const { query } = require('../db');
const { saidaRepo, memberRepo } = require('../repositories');
const { safeReply, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { buildSearchableSelect } = require('../shared/selectSearch');
const { brandEmbed, errorEmbed, successEmbed, COLOR, headerLine } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { formatPtDate } = require('../shared/formatPtDate');
const { isChefia, isOficial } = require('../permissions/permissionEngine');
const { logAudit } = require('../audit/auditEngine');
const eventBus = require('../core/eventBus');
const { warn, log } = require('../logger');

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// A. RESULTADO INDIVIDUAL (participante) ÔÇö 1 STEP: bot├úo ÔåÆ modal directo
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

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
 * Handler do bot├úo "Preencher o meu Resultado" ÔÇö abre modal DIRECTO.
 * Sem bot├Áes intermedi├írios. Tudo num s├│ modal de 3-5 campos.
 */
async function handleOpenSubmitResult(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.customId.split('::')[2], 10);

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.ERRO} N├úo est├ís registado na firma.`,
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
        content: `${EMOJI.ERRO} N├úo fizeste parte desta sa├¡da.`,
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
        content: `${EMOJI.BLOQUEADO} A sess├úo ainda n├úo foi fechada pela staff.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  // Se j├í submeteu e a sa├¡da est├í concluida ÔåÆ bloqueia (scoring j├í feito).
  // Se j├í submeteu mas est├í em em_liquidacao ÔåÆ permite editar (scoring ainda n├úo correu).
  if (me.individual_result_submitted && saida.status === 'concluida') {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.OK} J├í preencheste o teu resultado e a sa├¡da j├í foi finalizada ÔÇö n├úo pode ser alterado.`,
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

  // Pr├®-preencher com valores anteriores se for edi├º├úo
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

  const modalTitle = isEdit ? `Editar Resultado ÔÇö #${saidaId}` : `Resultado ÔÇö Sa├¡da #${saidaId}`;
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
        content: `${EMOJI.ERRO} N├úo est├ís registado.`,
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
        content: `${EMOJI.ERRO} N├úo ├®s participante desta sa├¡da.`,
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
      weaponReturnStatus = 'confirmed_not_returned'; // morreu ÔåÆ arma perdida
    } else {
      const returned = _parseSN(getModalField(interaction, 'weapon_returned'));
      weaponReturnStatus = returned ? 'declared_returned' : 'confirmed_not_returned';
    }
  } else if (me.own_weapon) {
    weaponReturnStatus = 'not_applicable';
  }

  // Verificar se a sa├¡da ainda permite edi├º├úo (em_liquidacao = sim, concluida = n├úo)
  const saida = await saidaRepo.findById(saidaId);
  const allowEdit = saida?.status === 'em_liquidacao';

  // Persiste ÔÇö se em_liquidacao permite overwrite (edi├º├úo); se concluida s├│ aceita primeiro submit
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
        embeds: [
          errorEmbed('N├úo foi poss├¡vel', 'A sa├¡da j├í foi finalizada ÔÇö o resultado n├úo pode ser alterado.'),
        ],
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

  // Feedback ao participante ÔÇö embed rico
  const lines = [
    `${died ? `${EMOJI.MORTE} Morreste` : `${EMOJI.OK} Sobreviveste`}`,
    `${EMOJI.KILL} **${kills}** kill${kills === 1 ? '' : 's'}`,
  ];
  if (weaponReturnStatus === 'declared_returned') {
    lines.push(`${EMOJI.ARMA} Arma declarada devolvida ÔÇö **aguarda confirma├º├úo staff**`);
  } else if (weaponReturnStatus === 'confirmed_not_returned') {
    lines.push(`${EMOJI.ARMA} Arma n├úo devolvida (${died ? 'morreste com ela' : 'declaraste'})`);
  }

  const feedbackEmbed = successEmbed(
    `${EMOJI.OK} Resultado ${isEdit ? 'editado' : 'registado'} ÔÇö Sa├¡da #${saidaId}`,
    lines.join('\n')
  );

  // Auto-check: se todos preencheram, notificar staff
  _checkAllResultsSubmitted(interaction.client, saidaId).catch(() => {});

  return safeReply(interaction, { embeds: [feedbackEmbed] }, { messageClass: 'RESULT' });
}

/**
 * Handler do bot├úo "Lembrar Pendentes" ÔÇö re-pinga participantes que faltam.
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
        content: `${EMOJI.WARN} Sa├¡da n├úo est├í em liquida├º├úo.`,
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
        content: `${EMOJI.OK} Todos os participantes j├í preencheram!`,
      },
      { messageClass: 'BANAL' }
    );
  }

  // Enviar nova mensagem no canal da sess├úo com @ dos pendentes
  const channelId = saida.session_channel_id;
  if (!channelId) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Canal de sess├úo n├úo configurado.`,
      },
      { messageClass: 'BANAL' }
    );
  }

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Canal de sess├úo n├úo acess├¡vel.`,
      },
      { messageClass: 'BANAL' }
    );
  }

  const discordIds = pending.map(p => p.discord_id).filter(Boolean);
  const mentions = discordIds.map(id => `<@${id}>`).join(' ');

  const pendingLines = pending.map(p => {
    const typeTag =
      p.participant_type === 'trabalhador' ? `${EMOJI.TRABALHADOR} trabalhador` : `${EMOJI.ARMA} caracterizado`;
    const weaponTag = !p.own_weapon && p.received_org_material ? ` ┬À ${EMOJI.MATERIAL} arma da org` : '';
    return `ÔÇó ${EMOJI.PENDENTE} <@${p.discord_id}> ÔÇö ${typeTag}${weaponTag}`;
  });

  const { brandEmbed: bEmbed } = require('../shared/embedBuilders');
  const embed = bEmbed('MOVEMENT')
    .setColor(COLOR.DANGER)
    .setTitle(`${EMOJI.WARN} Sa├¡da #${saidaId} ÔÇö Faltam ${pending.length} resultado(s)!`)
    .setDescription(
      `**Preencham o vosso resultado!** Cliquem no bot├úo **"${EMOJI.OK} Preencher o meu Resultado"** acima Ôåæ\n` +
        headerLine(EMOJI.PENDENTE, 'Pendentes') +
        pendingLines.join('\n') +
        '\n\n_A sess├úo n├úo fecha sem os vossos dados._'
    );

  await channel
    .send({
      content: `${EMOJI.WARN} **Lembrete** ÔÇö ${mentions}`,
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

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// B. WEAPON RETURN QUEUE (staff OG+)
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

function _canConfirmWeapon(member) {
  return isOficial(member);
}

/**
 * Handler do bot├úo "Confirmar Devolu├º├Áes de Arma" no painel da sess├úo.
 * Mostra lista de devolu├º├Áes pendentes com select por participante.
 */
async function handleOpenWeaponQueue(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!_canConfirmWeapon(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.BLOQUEADO} Apenas staff OG+ pode confirmar devolu├º├Áes.`,
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
    .setTitle(`${EMOJI.ARMA} Devolu├º├Áes pendentes ÔÇö Sa├¡da #${saidaId}`);

  if (!pending.length) {
    embed.setDescription(
      'N├úo h├í devolu├º├Áes pendentes de confirma├º├úo para esta sa├¡da.\n' +
        'Todas as armas j├í foram marcadas ou os participantes ainda n├úo preencheram resultado.'
    );
    return safeReply(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  }

  const lines = pending.map(
    p =>
      `ÔÇó <@${p.discord_id}> ÔÇö ${p.display_name || ''} ┬À declarou devolu├º├úo em \`${formatPtDate(p.individual_result_at)}\``
  );
  embed.setDescription(lines.join('\n'));

  // Select para escolher participante
  const options = pending.slice(0, 25).map(p => ({
    label: (p.display_name || `Membro ${p.member_id}`).slice(0, 100),
    description: `Declarou em ${formatPtDate(p.individual_result_at)}`.slice(0, 100),
    value: String(p.member_id),
  }));

  const rows = buildSearchableSelect({
    customId: `saida::weapon_confirm_pick::${saidaId}`,
    placeholder: 'Escolhe participante para decidir',
    options,
    searchKey: `weaponConfirm::${saidaId}`,
    modalTitle: 'Pesquisar participante',
    messageClass: 'COCKPIT',
  });

  return safeReply(interaction, { embeds: [embed], components: rows }, { messageClass: 'COCKPIT' });
}

/**
 * Handler do select "escolhe participante" ÔåÆ mostra bot├Áes de decis├úo.
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
        content: `${EMOJI.ERRO} Participante n├úo encontrado.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  const embed = brandEmbed('MOVEMENT')
    .setColor(COLOR.INFO)
    .setTitle(`${EMOJI.ARMA} Decis├úo ÔÇö <@${p.discord_id}>`)
    .setDescription(
      `**${p.display_name || 'Participante'}** declarou devolu├º├úo em ` +
        `\`${formatPtDate(p.individual_result_at)}\`.\n` +
        'Escolhe a decis├úo:'
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`saida::weapon_decide::${saidaId}::${memberId}::confirmed`)
      .setLabel('Confirmar devolu├º├úo')
      .setStyle(ButtonStyle.Success)
      .setEmoji(EMOJI.OK),
    new ButtonBuilder()
      .setCustomId(`saida::weapon_decide::${saidaId}::${memberId}::rejected`)
      .setLabel('N├úo devolveu')
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
 * Handler da decis├úo ÔÇö aplica status + emite evento.
 */
async function handleWeaponDecide(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!_canConfirmWeapon(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.BLOQUEADO} Sem permiss├úo.`,
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
    return safeReply(interaction, { content: 'Decis├úo inv├ílida.' }, { messageClass: 'ERROR' });
  }

  // Guard: s├│ podemos confirmar/rejeitar/inconclusivo se houve, de facto,
  // arma emitida pela org. Se o participante foi com arma pr├│pria
  // (own_weapon=true) ou se n├úo recebeu material, n├úo h├í arma a devolver.
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
        embeds: [errorEmbed('Participante n├úo encontrado', 'Esta pessoa j├í n├úo est├í inscrita na sa├¡da.')],
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
            'Este participante foi com arma pr├│pria ou n├úo recebeu material da org ÔÇö nada a confirmar.'
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
        embeds: [errorEmbed('J├í resolvido', 'A devolu├º├úo deste participante j├í foi confirmada por outro oficial.')],
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

  // Uma confirma├º├úo de arma pode ter sido a ├║ltima pe├ºa em falta ÔÇö se todos
  // submeteram E j├í n├úo h├í declared_returned, o auto-finalize devia arrancar
  // aqui. Antes s├│ arrancava em handleSubmitResultModal, deixando sa├¡das
  // em limbo se o ├║ltimo resultado submetido tinha arma a confirmar.
  _checkAllResultsSubmitted(interaction.client, saidaId).catch(() => {});

  const decisionLabel = {
    confirmed: `${EMOJI.OK} **Confirmada** ÔÇö arma devolvida`,
    rejected: `${EMOJI.ERRO} **Rejeitada** ÔÇö n├úo devolveu`,
    inconclusive: `${EMOJI.TEMPO} **Inconclusivo** ÔÇö precisa rever`,
  }[decision];

  log(`[WEAPON-RETURN] saida #${saidaId} member=${memberId} decision=${decision} by=${interaction.user.id}`);
  return safeReply(
    interaction,
    {
      content: `${decisionLabel} ÔÇö registado na sa├¡da #${saidaId}.`,
    },
    { messageClass: 'BANAL' }
  );
}

/**
 * _checkAllResultsSubmitted ÔÇö quando o ├║ltimo participante submete,
 * finaliza automaticamente a sa├¡da (antes era trigger de embed "todos
 * preencheram"; agora ├® auto-finalize).
 *
 * Fluxo novo:
 *   - ap├│s cada submit, chama getResultProgress
 *   - se allDone e sa├¡da ainda em_liquidacao ÔåÆ finalizeSaida com actor 'system:auto'
 *   - finalize corre scoring, publica embed de resultados, e deleta o
 *     session_message (cleanup do canal operacional)
 */
async function _checkAllResultsSubmitted(client, saidaId) {
  try {
    const saida = await saidaRepo.findById(saidaId);
    if (!saida) {
      warn(`[AUTO-FINALIZE] Sa├¡da #${saidaId} n├úo encontrada.`);
      return;
    }
    if (saida.status !== 'em_liquidacao') {
      log(`[AUTO-FINALIZE] Sa├¡da #${saidaId} status=${saida.status}, skip (j├í tratada ou n├úo em liquida├º├úo).`);
      return;
    }

    const saidaEngine = require('./saidaEngine');
    const progress = await saidaEngine.getResultProgress(saidaId);
    log(
      `[AUTO-FINALIZE] Sa├¡da #${saidaId} progress: ${progress.submitted}/${progress.total} pendingWeapons=${progress.pendingWeapons} allDone=${progress.allDone}`
    );
    if (!progress.allDone) {
      // Caso espec├¡fico: todos submeteram mas h├í armas em declared_returned
      // ├á espera de confirma├º├úo OG+. N├úo auto-finalize ÔÇö staff tem de
      // confirmar armas primeiro via "Confirmar Armas".
      if (progress.submitted >= progress.total && progress.pendingWeapons > 0) {
        log(
          `[AUTO-FINALIZE] Sa├¡da #${saidaId} tem ${progress.pendingWeapons} arma(s) por confirmar ÔÇö skip auto-finalize.`
        );
      }
      return;
    }

    log(`[AUTO-FINALIZE] Sa├¡da #${saidaId} ÔÇö a finalizar (todos submeteram + armas confirmadas).`);
    await saidaEngine.finalizeSaida(saidaId, 'system:auto');
    log(`[AUTO-FINALIZE] Sa├¡da #${saidaId} finalizada com sucesso.`);
  } catch (e) {
    // Log verboso para diagnosticar erros de auto-finalize que antes eram
    // engolidos silenciosamente (.catch(() => {}) no call site).
    warn(`[AUTO-FINALIZE] Sa├¡da #${saidaId} falhou: ${e.message}\n${e.stack || ''}`);
  }
}

/**
 * dmParticipantsForResults ÔÇö envia DM a cada participante da sa├¡da com um
 * bot├úo para preencher o resultado. Chamado pelo handleCloseSaidaModal
 * em vez do antigo ping p├║blico (removido em phase 4).
 *
 * Cada DM tem um embed com o resultado (Vit├│ria/Derrota/ÔÇª) e um bot├úo
 * `saida::submit_result::<saidaId>`. Mesmo customId do bot├úo no painel
 * da sess├úo ÔÇö handler ├║nico (handleOpenSubmitResult).
 *
 * Se o user tiver DMs desligadas, a mensagem falha silenciosamente ÔÇö o
 * user pode sempre usar o painel da sess├úo no canal.
 */
async function dmParticipantsForResults(client, saidaId, resultLabel) {
  if (!client) return;
  const saida = await saidaRepo.findById(saidaId);
  if (!saida) return;
  const participants = await saidaRepo.getParticipants(saidaId);
  if (!participants.length) return;

  for (const p of participants) {
    if (!p.discord_id) continue;
    try {
      const user = await client.users.fetch(p.discord_id).catch(() => null);
      if (!user) continue;
      const embed = brandEmbed('MOVEMENT')
        .setColor(COLOR.WARNING)
        .setTitle(`${EMOJI.SAIDA} Sa├¡da #${saidaId} ÔÇö ${resultLabel}`)
        .setDescription(
          `A sess├úo **#${saidaId}** (spot: **${saida.spot || 'ÔÇö'}**) foi fechada pela chefia.\n\n` +
            'Preenche o teu resultado individual aqui ÔÇö o modal pergunta:\n' +
            'ÔÇó **Sobreviveste?**\nÔÇó **Quantas kills fizeste?**\n' +
            (p.received_org_material && !p.own_weapon ? 'ÔÇó **Arma devolvida?** (tinhas arma da org)\n' : '') +
            '\nQuando todos submetem, a sa├¡da fecha-se automaticamente.'
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
