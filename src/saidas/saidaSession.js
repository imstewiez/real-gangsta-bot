'use strict';
/**
 * Sess├úo de sa├¡da ÔÇö embed interactivo com registo de participantes.
 *
 * Quando uma sa├¡da ├® criada, publica-se um embed p├║blico com:
 *   - detalhes da sa├¡da (spot, tipo, data, hora, l├¡der)
 *   - slots ocupados (X/12 caracterizados, Y trabalhadores)
 *   - lista de inscritos (separados por tipo)
 *   - bot├Áes: Caracterizado (self-serve arma), Trabalhador (1 click), Sair
 *
 * O embed ├® editado em tempo real ├á medida que membros se registam.
 *
 * Fluxo Caracterizado (self-serve ÔÇö participante escolhe a arma):
 *   1. Click `saida::session_caracterizado::<saidaId>`
 *      ÔåÆ ephemeral com 2 bot├Áes: Arma Pr├│pria / Pedir ├á Org
 *   2. Click `saida::source::<saidaId>::own|org`
 *      ÔåÆ ephemeral com StringSelect de armas da cat├ílogo (ou stock se org)
 *   3. Select `saida::weapon_pick::<saidaId>::own|org`
 *      ÔåÆ guarda weapon_item_id + regista participante
 *
 * Fluxo Trabalhador: click ÔåÆ regista directamente (n├úo precisa arma).
 *
 * CustomIds:
 *   saida::session_caracterizado::<saidaId>  - step 1 (abre source picker)
 *   saida::session_trabalhador::<saidaId>    - regista trabalhador directo
 *   saida::session_cancel::<saidaId>         - cancela registo
 *   saida::source::<saidaId>::<own|org>      - step 2 (abre weapon select)
 *   saida::weapon_pick::<saidaId>::<own|org> - step 3 (grava)
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const { saidaRepo, memberRepo, inventoryRepo } = require('../repositories');
const saidaEngine = require('./saidaEngine');
const { safeReply, safeUpdate, isDuplicate, scheduleDeleteInteractionReply } = require('../shared/interactionHelpers');
const { buildSearchableSelect } = require('../shared/selectSearch');
const { brandEmbed, COLOR, headerLine, progressBar } = require('../shared/embedBuilders');
const { EMOJI, SAIDA_TYPE } = require('../content');
const CONFIG = require('../config');
const { log, warn } = require('../logger');
const { formatPtDateOnly } = require('../shared/formatPtDate');
const { fmtSaidaStatus, fmtParticipantType } = require('../shared/labels');

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// BUILD SESSION EMBED + COMPONENTS
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

async function buildSessionEmbed(saidaId) {
  const saida = await saidaRepo.findById(saidaId);
  if (!saida) return null;

  const participants = await saidaRepo.getParticipants(saidaId);
  const characterized = participants.filter(p => p.participant_type === 'caracterizado');
  const workers = participants.filter(p => p.participant_type === 'trabalhador');
  const pending = participants.filter(p => p.participant_type === 'pending');
  const requested = participants.filter(p => p.participant_type === 'requested');
  const maxChar = saida.max_participants || 12;
  const slotsLeft = Math.max(0, maxChar - characterized.length);

  // Phase 1 (pre-start): admin ainda n├úo clicou "Iniciar Sess├úo". Inscritos
  // entram directo como caracterizado; Iniciar depois demite para trab se
  // houver > max_participants.
  // Phase 2 (post-start): admin iniciou, identificado por session_started_at.
  // Pedir para Juntar s├│ aparece aqui (requer approve).
  const isPreStart = !saida.session_started_at;

  const type = SAIDA_TYPE[saida.operation_type] || saida.operation_type;
  // Data no formato can├│nico dd/mm/yyyy. S├│ mostra hora se foi marcada
  // (scheduled_time !== null && !== '00:00'); evita mostrar "00:00" ├á toa
  // para sa├¡das onde a hora n├úo ├® relevante.
  let dateLine = formatPtDateOnly(saida.date);
  if (saida.scheduled_time) {
    const t = String(saida.scheduled_time).slice(0, 5);
    if (t && t !== '00:00') dateLine += ` ┬À ${t}`;
  }
  // L├¡der = sempre o criador da sa├¡da. operations.leader_id raramente ├®
  // preenchido (requeria UI de assign que n├úo existe); created_by (discord_id
  // do utilizador que abriu a sa├¡da) ├® o sinal fi├ível. Fallback para
  // leader_discord_id se created_by ausente em sa├¡das muito antigas.
  const leaderId = saida.created_by || saida.leader_discord_id;
  const leader = leaderId ? `<@${leaderId}>` : 'ÔÇö';

  const isClosed = saida.status === 'cancelada';
  const isConcluded = saida.status === 'concluida';
  const isInLiquidacao = saida.status === 'em_liquidacao';
  const isOpen = !isClosed && !isConcluded && !isInLiquidacao;

  const statusEmoji = isClosed
    ? EMOJI.ERRO
    : isConcluded
      ? EMOJI.FECHAR
      : isInLiquidacao
        ? EMOJI.LIQUIDACAO
        : slotsLeft === 0
          ? EMOJI.CHEIO
          : EMOJI.ABERTO;
  const statusLabel = isClosed
    ? 'Cancelada'
    : isConcluded
      ? 'Conclu├¡da'
      : isInLiquidacao
        ? 'Em liquida├º├úo'
        : slotsLeft === 0
          ? 'Cheio'
          : 'Inscri├º├Áes abertas';

  const lines = [
    `# ${EMOJI.SAIDA} Sa├¡da #${saida.id} ÔÇö ${type}`,
    '',
    `> ${statusEmoji} **${statusLabel}**`,
    '',
    `${EMOJI.ZONA} **${saida.spot || 'ÔÇö'}** ┬À ${EMOJI.CALENDARIO} ${dateLine} ┬À ${EMOJI.LIDER} ${leader}`,
  ];

  if (isPreStart) {
    // Phase 1: inscritos entram directos como caracts; Iniciar depois demite
    // para trab se > maxChar via auto-pick.
    const overflow =
      characterized.length > maxChar ? ` ┬À ${EMOJI.WARN} ${characterized.length - maxChar} ser├úo demitidos` : '';
    lines.push('', `${EMOJI.AUDIT} **Inscritos** ${characterized.length}${maxChar ? `/${maxChar}` : ''}${overflow}`);
  } else {
    lines.push(
      '',
      `${EMOJI.ARMA} **Caracterizados** ${characterized.length}/${maxChar} ┬À ${EMOJI.TRABALHADOR} **Trabalhadores** ${workers.length}`
    );
  }

  if (saida.notes) lines.push(`> ${EMOJI.AUDIT} _${saida.notes}_`);

  // Lista de inscritos com status da arma + nome espec├¡fico se escolheu
  const weaponIds = characterized.map(p => p.weapon_item_id).filter(Boolean);
  const weaponMap = new Map();
  if (weaponIds.length) {
    for (const wid of new Set(weaponIds)) {
      const it = await inventoryRepo.getItemById(wid).catch(() => null);
      if (it) weaponMap.set(wid, it.name);
    }
  }

  // Indicador de resultado individual (para estados em_liquidacao e concluida)
  const showResultStatus = isInLiquidacao || isConcluded;

  // Sanity cap ÔÇö kills ÔëÑ 20 s├úo flagged visualmente para chefia rever antes
  // de finalizar (provavelmente typo; o cap hard ├® 99 no modal).
  const KILLS_SANITY_THRESHOLD = 20;
  const formatResultMark = p => {
    if (!showResultStatus) return '';
    if (!p.individual_result_submitted) return ' ÔÅ│';
    const kills = p.kills || 0;
    const killsTag = kills > 0 ? ` ┬À ${kills}k${kills >= KILLS_SANITY_THRESHOLD ? EMOJI.WARN : ''}` : '';
    const diedTag = p.died ? ` ┬À ${EMOJI.MORTE}` : '';
    return ` ${EMOJI.OK}${killsTag}${diedTag}`;
  };

  if (characterized.length) {
    lines.push('', headerLine(EMOJI.ARMA, `Caracterizados  ${characterized.length}/${maxChar}`));
    for (const p of characterized) {
      const weaponName = p.weapon_item_id ? weaponMap.get(p.weapon_item_id) : null;
      const srcIcon = p.own_weapon ? EMOJI.ARMA : p.received_org_material ? EMOJI.MATERIAL : EMOJI.PENDENTE;
      const srcLabel = p.own_weapon ? 'pr├│pria' : p.received_org_material ? 'org' : 'sem arma';
      const weaponFull = weaponName ? `${srcIcon} ${weaponName} (${srcLabel})` : `${srcIcon} ${srcLabel}`;
      lines.push(`ÔÇó <@${p.discord_id}>  ┬À  ${weaponFull}${formatResultMark(p)}`);
    }
  }
  if (workers.length) {
    lines.push('', headerLine(EMOJI.TRABALHADOR, `Trabalhadores  ${workers.length}`));
    for (const p of workers) {
      lines.push(`ÔÇó <@${p.discord_id}>${formatResultMark(p)}`);
    }
  }
  // Pedidos de entrada em sess├úo activa (post-start) ÔÇö vis├¡veis para admin.
  if (requested.length) {
    lines.push('', headerLine(EMOJI.PENDENTE, `Pedidos pendentes  ${requested.length}`));
    for (const p of requested) {
      lines.push(`ÔÇó <@${p.discord_id}>  ÔÇö aguarda aprova├º├úo`);
    }
  }

  if (isClosed) {
    lines.push('', `${EMOJI.FECHAR} _Sa├¡da ${fmtSaidaStatus(saida.status)}. Registo encerrado._`);
  } else if (isInLiquidacao) {
    const submittedCount = participants.filter(p => p.individual_result_submitted).length;
    const totalCount = participants.length;
    const pendingList = participants.filter(p => !p.individual_result_submitted);
    const pendingWeapon = characterized.filter(p => p.weapon_return_status === 'declared_returned').length;
    const resultLabel =
      { vitoria: 'Vit├│ria', derrota: 'Derrota', empate: 'Empate', sem_conflito: 'Sem conflito', abortada: 'Abortada' }[
        saida.result
      ] || saida.result;

    lines.push('');
    lines.push(headerLine(EMOJI.LIQUIDACAO, 'Em liquida├º├úo'));
    lines.push(`${EMOJI.COMBATE} Resultado: **${resultLabel}**`);
    if (saida.enemy_name) lines.push(`${EMOJI.COMBATE} Contra: **${saida.enemy_name}**`);

    // Progress bar de preenchimento
    const pct = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0;
    lines.push(
      `${EMOJI.PENDENTE} Preenchimento: ${progressBar(submittedCount, totalCount, { width: 10 })}  **${submittedCount}/${totalCount}** (${pct}%)`
    );

    if (submittedCount >= totalCount && totalCount > 0) {
      if (pendingWeapon > 0) {
        lines.push(
          `${EMOJI.WARN} **Todos preencheram, mas faltam ${pendingWeapon} arma(s) a confirmar** ÔÇö chefia/oficial clica **"Confirmar Armas"** Ôåô`
        );
      } else {
        const lastSubmitAt = participants
          .map(p => (p.individual_result_at ? new Date(p.individual_result_at).getTime() : 0))
          .reduce((a, b) => Math.max(a, b), 0);
        const staleMs = lastSubmitAt ? Date.now() - lastSubmitAt : 0;
        const AUTO_FINALIZE_STALE_THRESHOLD = 5 * 60_000;
        if (staleMs > AUTO_FINALIZE_STALE_THRESHOLD) {
          lines.push(
            `${EMOJI.OK} **Todos preencheram!** Se o auto-finalize estiver preso (${Math.round(staleMs / 60_000)} min), clica **"Finalizar e Publicar"** Ôåô`
          );
        } else {
          lines.push(`${EMOJI.OK} **Todos preencheram!** Staff pode finalizar Ôåô`);
        }
      }
    } else {
      const aguarda = pendingList
        .slice(0, 10)
        .map(p => `<@${p.discord_id}>`)
        .join(', ');
      const extra = pendingList.length > 10 ? ` +${pendingList.length - 10}` : '';
      lines.push(`${EMOJI.PENDENTE} **Aguarda** (${pendingList.length}): ${aguarda}${extra}`);
      lines.push('_Participantes ÔÇö cliquem em **"Preencher o meu Resultado"** Ôåô_');
    }
    if (pendingWeapon > 0) lines.push(`${EMOJI.WARN} **${pendingWeapon}** devolu├º├úo(├Áes) de arma pendente(s)`);
  } else if (isConcluded) {
    const pendingWeapon = characterized.filter(p => p.weapon_return_status === 'declared_returned').length;
    const resultLabel =
      { vitoria: 'Vit├│ria', derrota: 'Derrota', empate: 'Empate', sem_conflito: 'Sem conflito', abortada: 'Abortada' }[
        saida.result
      ] || saida.result;
    const totalKills = participants.reduce((a, p) => a + (p.kills || 0), 0);
    const totalDeaths = participants.filter(p => p.died).length;
    const mvp = participants.find(p => p.mvp_flag);
    const vivos = participants.length - totalDeaths;

    lines.push('');
    lines.push(headerLine(EMOJI.FECHAR, 'Conclu├¡da'));
    lines.push(`${EMOJI.COMBATE} Resultado: **${resultLabel}**`);
    lines.push(
      `${EMOJI.KILL} **${totalKills}** kills  ┬À  ${EMOJI.MORTE} **${totalDeaths}** mortes  ┬À  ${EMOJI.OK} **${vivos}** vivos`
    );
    if (mvp) {
      const kScore = Math.round(mvp.performance_score || 0);
      const dScore = Math.round(mvp.discipline_score || 0);
      lines.push(
        `${EMOJI.MVP} MVP: **${mvp.display_name || 'Participante'}**  ┬À  ${mvp.kills || 0}k  ┬À  peso ${kScore}  ┬À  disc. ${dScore}%`
      );
    }
    if (pendingWeapon > 0) lines.push(`${EMOJI.WARN} **${pendingWeapon}** devolu├º├úo(├Áes) de arma pendente(s)`);
  }

  const embedColor = isClosed ? COLOR.MUTED : isConcluded ? COLOR.SUCCESS : isInLiquidacao ? COLOR.WARNING : COLOR.INFO;
  const embed = brandEmbed('MOVEMENT').setColor(embedColor).setDescription(lines.join('\n'));

  const components = [];

  if (isOpen && isPreStart) {
    // Phase 1 ÔÇö pr├®-start: single "Inscrever-me" button (saves as pending).
    // Admin v├¬ "Iniciar Sess├úo" que dispara auto-pick.
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_caracterizado::${saidaId}`)
          .setLabel(`${EMOJI.INSCREVER} Inscrever-me (${pending.length})`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`saida::session_cancel::${saidaId}`)
          .setLabel('Sair')
          .setStyle(ButtonStyle.Danger)
          .setEmoji(EMOJI.APAGAR)
      )
    );

    // Staff row ÔÇö Iniciar Sess├úo (no-op se Ôëñ maxChar; auto-pick demite se >) + Fechar.
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_iniciar::${saidaId}`)
          .setLabel(`${EMOJI.INICIAR} Iniciar Sess├úo (${characterized.length})`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(characterized.length === 0),
        new ButtonBuilder()
          .setCustomId(`saida::session_close_direct::${saidaId}`)
          .setLabel('Fechar Sess├úo')
          .setStyle(ButtonStyle.Danger)
          .setEmoji(EMOJI.FECHAR)
      )
    );
  } else if (isOpen) {
    // Phase 2 ÔÇö post-start: j├í n├úo h├í inscri├º├úo self-service por default.
    // Admin controla (swap, aprovar pedidos, fechar). User externo pode
    // "Pedir para Juntar" que cria um requested.
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_pedir_juntar::${saidaId}`)
          .setLabel('Pedir para Juntar')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(EMOJI.PRESENCA),
        new ButtonBuilder()
          .setCustomId(`saida::session_cancel::${saidaId}`)
          .setLabel('Sair')
          .setStyle(ButtonStyle.Danger)
          .setEmoji(EMOJI.APAGAR)
      )
    );

    // Admin row 1 ÔÇö gest├úo (swap + approve). Non-admins v├¬em mas s├úo rejeitados.
    const adminMgmtRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::session_swap_open::${saidaId}`)
        .setLabel('Trocar Caract Ôåö Trab')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(EMOJI.REFRESH)
        .setDisabled(characterized.length + workers.length === 0)
    );
    if (requested.length > 0) {
      adminMgmtRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_approve_open::${saidaId}`)
          .setLabel(`Aprovar Pedidos (${requested.length})`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji(EMOJI.OK)
      );
    }
    components.push(adminMgmtRow);

    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_close_direct::${saidaId}`)
          .setLabel('Fechar Sess├úo')
          .setStyle(ButtonStyle.Danger)
          .setEmoji(EMOJI.FECHAR)
      )
    );
  } else if (isInLiquidacao) {
    const submittedCount = participants.filter(p => p.individual_result_submitted).length;
    const totalCount = participants.length;
    const pendingCount = totalCount - submittedCount;
    const allDone = submittedCount >= totalCount && totalCount > 0;

    // Row 1 ÔÇö resultado individual (self-service, permite editar)
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::submit_result::${saidaId}`)
          .setLabel(`Preencher / Editar Resultado (${submittedCount}/${totalCount})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji(EMOJI.OK)
      )
    );

    // Row 2 ÔÇö staff: finalizar + confirmar armas
    const finalizeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::finalize::${saidaId}`)
        .setLabel(allDone ? 'Finalizar e Publicar' : `For├ºar Fecho (${pendingCount} sem resultado)`)
        .setStyle(allDone ? ButtonStyle.Success : ButtonStyle.Danger)
        .setEmoji(EMOJI.FECHAR),
      new ButtonBuilder()
        .setCustomId(`saida::weapon_queue::${saidaId}`)
        .setLabel('Confirmar Armas')
        .setStyle(ButtonStyle.Primary)
        .setEmoji(EMOJI.ARMA)
    );
    components.push(finalizeRow);

    // Row 3 ÔÇö staff: lembrar pendentes (s├│ aparece se h├í pendentes)
    if (pendingCount > 0) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`saida::reping::${saidaId}`)
            .setLabel(`Lembrar ${pendingCount} Pendente(s)`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(EMOJI.CONVOCAR)
        )
      );
    }
  } else if (isConcluded) {
    // Sess├úo conclu├¡da ÔÇö armas pendentes pode ainda precisar de confirma├º├úo
    const pendingWeapon = characterized.filter(p => p.weapon_return_status === 'declared_returned').length;
    if (pendingWeapon > 0) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`saida::weapon_queue::${saidaId}`)
            .setLabel(`Confirmar Armas (${pendingWeapon} pendentes)`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(EMOJI.ARMA)
        )
      );
    }
  }

  return { embed, components };
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// PUBLISH SESSION EMBED (chamado ao criar sa├¡da)
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

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
    log(`[SAIDA-SESSION] Embed publicado para sa├¡da #${saidaId} em ${channelId}.`);
    return msg;
  } catch (e) {
    warn(`[SAIDA-SESSION] Falha a publicar: ${e.message}`);
    return null;
  }
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// UPDATE SESSION EMBED (chamado ap├│s cada registo/cancelamento)
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

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

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// HANDLERS ÔÇö registo interactivo
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

// ÔöÇÔöÇ STEP 1: Caracterizado ÔåÆ ephemeral com 2 bot├Áes (origem da arma) ÔöÇÔöÇÔöÇÔöÇÔöÇ
async function handleSessionCaracterizado(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const saidaId = parseInt(interaction.customId.split('::')[2]);

  // Guard pr├®-fluxo: se j├í est├í inscrito, diz j├í aqui (n├úo deixa come├ºar
  // a escolher arma s├│ para apanhar erro no submit).
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (member) {
    const existing = (await saidaRepo.getParticipants(saidaId)).find(p => p.member_id === member.id);
    if (existing) {
      return safeReply(
        interaction,
        {
          content:
            `${EMOJI.BLOQUEADO} J├í est├ís inscrito como **${fmtParticipantType(existing.participant_type)}** na sa├¡da #${saidaId}. ` +
            'Usa **"Cancelar Registo"** no painel da sa├¡da se queres mudar.',
          flags: MessageFlags.Ephemeral,
        },
        { messageClass: 'WARN' }
      );
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`saida::source::${saidaId}::own`)
      .setLabel('Arma Pr├│pria')
      .setStyle(ButtonStyle.Primary)
      .setEmoji(EMOJI.ARMA),
    new ButtonBuilder()
      .setCustomId(`saida::source::${saidaId}::org`)
      .setLabel('Pedir ├á Org')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(EMOJI.FORNECER)
  );

  return safeReply(
    interaction,
    {
      content: `**Sa├¡da #${saidaId}** ÔÇö como te armas?\n\n${EMOJI.ARMA} **Arma Pr├│pria** ÔÇö j├í tens arma contigo\n${EMOJI.FORNECER} **Pedir ├á Org** ÔÇö a firma cede a arma do stock`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'FLOW' }
  );
}

// ÔöÇÔöÇ STEP 2: source picker ÔåÆ abre StringSelect com armas ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
async function handleCaracterizadoSource(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const source = parts[3]; // 'own' ou 'org'

  // Armas ÔÇö filtradas pela whitelist em `config/saida-weapons.json`.
  // Mesma lista para "Arma Pr├│pria" e "Pedir ├á Org": armas brancas + outras
  // fora da whitelist NUNCA aparecem. Ordem segue a do JSON (edit├ível sem
  // tocar em c├│digo).
  const items = await inventoryRepo.getItems(true);
  const { filterAndOrderForSaida } = require('./allowedWeapons');
  const weapons = filterAndOrderForSaida(items);

  if (source === 'org') {
    // Carrega stock por arma para label enriquecido. Ordem mant├®m-se
    // (n├úo reordena por stock ÔÇö quem sabe o que quer, clica).
    for (const w of weapons) {
      w._balance = Number(await inventoryRepo.getStockForItem(w.id).catch(() => 0)) || 0;
    }
  }

  if (weapons.length === 0) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Sem armas eleg├¡veis no cat├ílogo. Contacta a chefia.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  // Discord StringSelect: max 25 op├º├Áes. A whitelist tem 10 ÔåÆ sempre cabe.
  const options = weapons.slice(0, 25).map(w => {
    let label = w.name;
    if (source === 'org') {
      label = w._balance > 0 ? `${w.name} ┬À stock ${w._balance}` : `${w.name} ┬À sem stock`;
    }
    return new StringSelectMenuOptionBuilder()
      .setLabel(label.slice(0, 100))
      .setValue(String(w.id))
      .setEmoji(EMOJI.ARMA);
  });

  const rows = buildSearchableSelect({
    customId: `saida::weapon_pick::${saidaId}::${source}`,
    placeholder: source === 'org' ? 'Escolhe a arma da org' : 'Escolhe a tua arma',
    options,
    searchKey: `weapon::${interaction.user.id}::${saidaId}`,
    modalTitle: 'Pesquisar arma',
    messageClass: 'FLOW',
  });
  // safeUpdate substitui o ephemeral "como te armas?" (step 1) pelo select.
  // Antes era safeReply que criava um 2┬║ ephemeral ÔåÆ stacking vis├¡vel.
  return safeUpdate(
    interaction,
    {
      content:
        source === 'org'
          ? `**Sa├¡da #${saidaId}** ÔÇö escolhe a arma que queres da org.`
          : `**Sa├¡da #${saidaId}** ÔÇö diz qual ├® a tua arma.`,
      components: rows,
    },
    { messageClass: 'FLOW' }
  );
}

// ÔöÇÔöÇ STEP 3: weapon pick ÔåÆ grava participante + refresh embed ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
async function handleCaracterizadoWeaponPick(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate();

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const source = parts[3]; // 'own' ou 'org'
  const weaponItemId = parseInt(interaction.values[0]);

  try {
    const item = await inventoryRepo.getItemById(weaponItemId);
    // Guarda directo como 'caracterizado' ÔÇö user pede que quem se inscreve
    // no in├¡cio entre j├í a lutar. S├│ no Iniciar Sess├úo ├® que, se houver mais
    // de maxChar (default 12), o bot demite os piores para trabalhador via
    // auto-pick.
    await saidaEngine.addParticipant(
      saidaId,
      interaction.user.id,
      {
        participantType: 'caracterizado',
        ownWeapon: source === 'own',
        broughtOwn: source === 'own',
        receivedOrgMaterial: source === 'org',
        weaponItemId,
        notes: '',
      },
      interaction.user.id,
      interaction.guild
    );

    const weaponName = item?.name || 'arma';
    const srcLabel = source === 'own' ? 'pr├│pria' : 'da org';
    await interaction.editReply({
      content: `${EMOJI.OK} Inscrito como **caracterizado** na sa├¡da #${saidaId} ÔÇö arma ${srcLabel}: **${weaponName}**.`,
      components: [],
    });
    // Auto-delete informativo ÔÇö 10s.
    scheduleDeleteInteractionReply(interaction, 10_000);

    refreshSessionEmbed(interaction.client, saidaId).catch(() => {});
  } catch (e) {
    await interaction.editReply({
      content: `${EMOJI.ERRO} ${e.message}`,
      components: [],
    });
    scheduleDeleteInteractionReply(interaction, 10_000);
  }
}

// ÔöÇÔöÇ Trabalhador: click ├║nico ÔåÆ regista directamente ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
async function handleSessionTrabalhador(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2]);

  // Guard pr├®-fluxo (igual ao caracterizado)
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (member) {
    const existing = (await saidaRepo.getParticipants(saidaId)).find(p => p.member_id === member.id);
    if (existing) {
      return safeReply(
        interaction,
        {
          content:
            `${EMOJI.BLOQUEADO} J├í est├ís inscrito como **${fmtParticipantType(existing.participant_type)}** na sa├¡da #${saidaId}. ` +
            'Usa **"Cancelar Registo"** se queres mudar.',
        },
        { messageClass: 'WARN' }
      );
    }
  }

  try {
    await saidaEngine.addParticipant(
      saidaId,
      interaction.user.id,
      {
        participantType: 'trabalhador',
        ownWeapon: false,
        broughtOwn: false,
        receivedOrgMaterial: false,
        notes: '',
      },
      interaction.user.id,
      interaction.guild
    );

    await safeReply(
      interaction,
      {
        content: `${EMOJI.OK} Registado como **trabalhador** na sa├¡da #${saidaId}.`,
      },
      { messageClass: 'BANAL' }
    );

    refreshSessionEmbed(interaction.client, saidaId).catch(() => {});
  } catch (e) {
    await safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }
}

async function handleSessionCancel(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2]);
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} N├úo est├ís registado no sistema.` },
      { messageClass: 'ERROR' }
    );
  }

  const participants = await saidaRepo.getParticipants(saidaId);
  const existing = participants.find(p => p.discord_id === interaction.user.id);
  if (!existing) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} N├úo est├ís inscrito nesta sa├¡da.` },
      { messageClass: 'ERROR' }
    );
  }

  // N├úo permite cancelar se j├í liquidado/settled
  if (existing.settled) {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} J├í foste liquidado ÔÇö n├úo podes cancelar.` },
      { messageClass: 'BANAL' }
    );
  }

  // Remove participant
  const { query } = require('../db');
  await query('DELETE FROM operation_participants WHERE operation_id = $1 AND member_id = $2', [saidaId, member.id]);

  const { logAudit } = require('../audit/auditEngine');
  await logAudit({
    action: 'saida_participant_removed',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId: interaction.user.id,
    afterState: { memberId: member.id, displayName: member.display_name, reason: 'auto-cancelamento' },
  });

  await safeReply(
    interaction,
    {
      content: `${EMOJI.OK} Registo cancelado na sa├¡da **#${saidaId}**.`,
    },
    { messageClass: 'BANAL' }
  );

  refreshSessionEmbed(interaction.client, saidaId).catch(() => {});
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// Phase 2 handlers ÔÇö Iniciar Sess├úo (auto-pick) + Pedir para Juntar
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

async function handleSessionIniciar(interaction) {
  if (isDuplicate(interaction.id)) return;
  const { isChefia } = require('../permissions/permissionEngine');
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} S├│ chefia pode iniciar a sess├úo.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'WARN' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const saidaId = parseInt(interaction.customId.split('::')[2]);

  const saida = await saidaRepo.findById(saidaId);
  if (!saida || saida.status !== 'criada') {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Sa├¡da #${saidaId} n├úo est├í aberta.` },
      { messageClass: 'ERROR' }
    );
  }

  const allParts = await saidaRepo.getParticipants(saidaId);
  const inscritos = allParts.filter(p => p.participant_type === 'caracterizado' || p.participant_type === 'pending');
  if (!inscritos.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Ningu├®m inscrito ainda. Espera que algu├®m clique "Inscrever-me".` },
      { messageClass: 'BANAL' }
    );
  }

  const maxChar = saida.max_participants || 12;
  const { queryWithTransaction } = require('../db');
  const { autoPickCaracterizados } = require('./autoPickCaracterizados');

  // Sempre corre auto-pick ÔÇö internamente protege chefia + patrao_di_zona
  // (lugar reservado, nunca v├úo para trabalhador). Bairristas/oficiais
  // competem pelos slots restantes por KDA/MVP/arma/material.
  const { caracterizados, trabalhadores, scored } = await autoPickCaracterizados(inscritos, maxChar);

  // At├│mico: bulk updates + session_started_at num s├│ BEGIN/COMMIT. Se falha
  // a meio (ex.: coluna inexistente, constraint violation), rollback deixa
  // a sa├¡da intacta. Antes podia ficar metade promovido / session_started_at
  // n├úo gravado.
  try {
    await queryWithTransaction(async client => {
      for (const p of caracterizados) {
        if (p.participant_type !== 'caracterizado') {
          await client.query(
            `UPDATE operation_participants SET participant_type = 'caracterizado'
              WHERE operation_id = $1 AND member_id = $2`,
            [saidaId, p.member_id]
          );
        }
      }
      for (const p of trabalhadores) {
        await client.query(
          `UPDATE operation_participants
              SET participant_type = 'trabalhador',
                  own_weapon = FALSE,
                  brought_own_material = FALSE,
                  received_org_material = FALSE,
                  weapon_item_id = NULL
            WHERE operation_id = $1 AND member_id = $2`,
          [saidaId, p.member_id]
        );
      }
      await client.query('UPDATE operations SET session_started_at = NOW() WHERE id = $1', [saidaId]);
    });
  } catch (e) {
    warn(`[SAIDA] Iniciar sess├úo #${saidaId} falhou (rollback): ${e.message}`);
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Falha a iniciar sess├úo ÔÇö tenta outra vez. (${e.message})` },
      { messageClass: 'ERROR' }
    );
  }

  // Audit trail ÔÇö regista a decis├úo completa (promo├º├Áes/despromo├º├Áes + scores)
  // para que "porque ├® que fui trabalhador?" tenha resposta rastre├ível.
  const { logAudit } = require('../audit/auditEngine');
  logAudit({
    action: 'saida_session_started',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId: interaction.user.id,
    afterState: {
      maxChar,
      totalInscritos: inscritos.length,
      caracterizados: scored
        .filter(s => caracterizados.some(c => c.member_id === s.participant.member_id))
        .map(s => ({
          memberId: s.participant.member_id,
          displayName: s.participant.display_name,
          score: s.protected ? 'protected' : Number(s.score.toFixed(2)),
          role: s.participant.member_role,
        })),
      trabalhadores: scored
        .filter(s => trabalhadores.some(t => t.member_id === s.participant.member_id))
        .map(s => ({
          memberId: s.participant.member_id,
          displayName: s.participant.display_name,
          score: Number(s.score.toFixed(2)),
          role: s.participant.member_role,
        })),
    },
  }).catch(() => {});

  log(
    `[SAIDA] Iniciar sess├úo #${saidaId} por ${interaction.user.tag}: ${caracterizados.length} caract, ${trabalhadores.length} trab (total ${inscritos.length}).`
  );

  refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

  // DM s├│ a quem passou para trabalhador (quem ficou caract j├í sabia).
  if (trabalhadores.length > 0) {
    (async () => {
      for (const p of trabalhadores) {
        try {
          const user = await interaction.client.users.fetch(p.discord_id).catch(() => null);
          if (!user) continue;
          await user
            .send({
              content:
                `${EMOJI.INFO} Sa├¡da #${saidaId} iniciada ÔÇö ficas como **trabalhador** (havia mais de ${maxChar} inscritos).\n` +
                `Bot escolheu os ${maxChar} melhores por KDA/MVP/arma/material (chefia + patr├úo di zona t├¬m lugar reservado).\n` +
                'A chefia pode trocar manualmente no painel se precisar.',
            })
            .catch(() => {});
        } catch {
          /* ignore */
        }
      }
    })().catch(() => {});
  }

  const summary =
    trabalhadores.length > 0
      ? `${EMOJI.OK} **Sess├úo #${saidaId} iniciada.** ${inscritos.length} inscritos, ${maxChar} slots para caract:\n` +
        `${EMOJI.ARMA} **${caracterizados.length}** caracterizados (chefia + patr├úo t├¬m lugar reservado) ┬À ${EMOJI.TRABALHADOR} **${trabalhadores.length}** trabalhadores (auto-pick por KDA).\n` +
        '_Trabalhadores receberam DM. Podes trocar manualmente no painel._'
      : `${EMOJI.OK} **Sess├úo #${saidaId} iniciada.** ${caracterizados.length} caracterizados (todos cabem).`;

  return safeReply(interaction, { content: summary }, { messageClass: 'BANAL' });
}

async function handleSessionPedirJuntar(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const saidaId = parseInt(interaction.customId.split('::')[2]);

  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (!member) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} N├úo est├ís registado na firma.` },
      { messageClass: 'ERROR' }
    );
  }

  const participants = await saidaRepo.getParticipants(saidaId);
  const existing = participants.find(p => p.member_id === member.id);
  if (existing) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.BLOQUEADO} J├í est├ís na sa├¡da como **${fmtParticipantType(existing.participant_type)}**.`,
      },
      { messageClass: 'WARN' }
    );
  }

  try {
    await saidaEngine.addParticipant(
      saidaId,
      interaction.user.id,
      {
        participantType: 'requested',
        ownWeapon: false,
        broughtOwn: false,
        receivedOrgMaterial: false,
        notes: '',
      },
      interaction.user.id,
      interaction.guild
    );
    refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

    // Se o novo pedido tem score superior ao pior caracterizado actual,
    // avisa o creator por DM ÔÇö pode valer a pena swap. Evita que um
    // bairrista com KDA alto fique de fora s├│ porque chegou tarde.
    // Fire-and-forget ÔÇö falhar aqui n├úo afecta o pedido.
    (async () => {
      try {
        const saida = await saidaRepo.findById(saidaId);
        if (!saida?.created_by) return;
        const all = await saidaRepo.getParticipants(saidaId);
        const currentCaracs = all.filter(p => p.participant_type === 'caracterizado');
        if (!currentCaracs.length) return;

        const { autoPickCaracterizados } = require('./autoPickCaracterizados');
        const newRow = all.find(p => p.member_id === member.id);
        if (!newRow) return;
        const hypothetical = [...currentCaracs, newRow];
        const { caracterizados: hypoWinners } = await autoPickCaracterizados(
          hypothetical,
          saida.max_participants || 12
        );
        const wouldBeat = hypoWinners.some(w => w.member_id === member.id);
        if (!wouldBeat) return;

        // Qual caract seria deslocado na hip├│tese ÔåÆ nome para a DM
        const deslocado = currentCaracs.find(c => !hypoWinners.some(w => w.member_id === c.member_id));

        const creator = await interaction.client.users.fetch(saida.created_by).catch(() => null);
        if (!creator) return;
        await creator
          .send({
            content:
              `${EMOJI.WARN} Sa├¡da **#${saidaId}** ÔÇö **${member.display_name}** pediu para juntar-se e ` +
              `tem score superior a **${deslocado?.display_name || 'um caracterizado actual'}**.\n` +
              'Podes considerar aprovar e fazer swap manualmente pelo painel (**"Trocar Caract Ôåö Trab"**).',
          })
          .catch(() => {});
      } catch (e) {
        warn(`[SAIDA] Alerta-creator falhou para #${saidaId}: ${e.message}`);
      }
    })().catch(() => {});

    return safeReply(
      interaction,
      {
        content:
          `${EMOJI.OK} Pedido enviado ├á chefia.\n` +
          'Se for aprovado, entras como **trabalhador** (chefia pode trocar para caracterizado).',
      },
      { messageClass: 'BANAL' }
    );
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// Phase 2 handlers ÔÇö Admin swap + approve/reject requests
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

async function handleSessionSwapOpen(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { isChefia } = require('../permissions/permissionEngine');
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} S├│ chefia pode trocar participantes.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'WARN' }
    );
  }

  const saidaId = parseInt(interaction.customId.split('::')[2]);
  const participants = await saidaRepo.getParticipants(saidaId);
  const swappable = participants.filter(p => ['caracterizado', 'trabalhador'].includes(p.participant_type));
  if (!swappable.length) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.INFO} Sem participantes para trocar ainda.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  const options = swappable.slice(0, 25).map(p => {
    const from = p.participant_type === 'caracterizado' ? `${EMOJI.ARMA} Caract` : `${EMOJI.TRABALHADOR} Trab`;
    const to = p.participant_type === 'caracterizado' ? `${EMOJI.TRABALHADOR} Trab` : `${EMOJI.ARMA} Caract`;
    return new StringSelectMenuOptionBuilder()
      .setLabel(`${p.display_name || 'Participante'} ┬À ${from} ÔåÆ ${to}`.slice(0, 100))
      .setValue(String(p.member_id));
  });

  const rows = buildSearchableSelect({
    customId: `saida::session_swap_pick::${saidaId}`,
    placeholder: 'Escolhe quem trocar',
    options,
    searchKey: `swap::${interaction.user.id}::${saidaId}`,
    modalTitle: 'Pesquisar participante',
    messageClass: 'FLOW',
  });

  return safeReply(
    interaction,
    {
      content: `**Sa├¡da #${saidaId}** ÔÇö trocar caract Ôåö trab.\nO tipo vai inverter para quem escolheres.`,
      components: rows,
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'FLOW' }
  );
}

async function handleSessionSwapPick(interaction) {
  if (isDuplicate(interaction.id)) return;
  const { isChefia } = require('../permissions/permissionEngine');
  if (!isChefia(interaction.member)) return;
  await interaction.deferUpdate();

  const saidaId = parseInt(interaction.customId.split('::')[2]);
  const memberId = parseInt(interaction.values[0]);

  const participants = await saidaRepo.getParticipants(saidaId);
  const p = participants.find(x => x.member_id === memberId);
  if (!p) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Participante n├úo encontrado.`, components: [] },
      { messageClass: 'WARN' }
    );
  }

  const previousType = p.participant_type;
  const newType = previousType === 'caracterizado' ? 'trabalhador' : 'caracterizado';
  const updates = { participant_type: newType };
  if (newType === 'trabalhador') {
    // Demote ÔåÆ strip weapon info (trab n├úo carrega arma).
    updates.own_weapon = false;
    updates.brought_own_material = false;
    updates.received_org_material = false;
    updates.weapon_item_id = null;
  }
  await saidaRepo.updateParticipant(saidaId, memberId, updates);
  log(`[SAIDA] Swap por ${interaction.user.tag}: ${p.display_name} ÔåÆ ${newType} (sa├¡da #${saidaId}).`);

  const { logAudit } = require('../audit/auditEngine');
  logAudit({
    action: 'saida_participant_swapped',
    entityType: 'saida',
    entityId: String(saidaId),
    actorId: interaction.user.id,
    beforeState: { memberId, displayName: p.display_name, participantType: previousType },
    afterState: { memberId, displayName: p.display_name, participantType: newType },
  }).catch(() => {});

  refreshSessionEmbed(interaction.client, saidaId).catch(() => {});
  await interaction.editReply({
    content: `${EMOJI.OK} **${p.display_name}** agora ├® **${newType}**.`,
    components: [],
  });
  scheduleDeleteInteractionReply(interaction, 10_000);
}

async function handleSessionApproveOpen(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { isChefia } = require('../permissions/permissionEngine');
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} S├│ chefia pode aprovar pedidos.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'WARN' }
    );
  }

  const saidaId = parseInt(interaction.customId.split('::')[2]);
  const participants = await saidaRepo.getParticipants(saidaId);
  const requested = participants.filter(p => p.participant_type === 'requested');
  if (!requested.length) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.INFO} Sem pedidos pendentes.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }

  const options = requested
    .slice(0, 25)
    .map(p =>
      new StringSelectMenuOptionBuilder()
        .setLabel(`${p.display_name || 'Participante'}`.slice(0, 100))
        .setValue(String(p.member_id))
    );

  const rows = buildSearchableSelect({
    customId: `saida::session_approve_pick::${saidaId}`,
    placeholder: 'Escolhe quem aprovar / rejeitar',
    options,
    searchKey: `approve::${interaction.user.id}::${saidaId}`,
    modalTitle: 'Pesquisar pedido',
    messageClass: 'FLOW',
  });

  return safeReply(
    interaction,
    {
      content: `**Sa├¡da #${saidaId}** ÔÇö ${requested.length} pedido(s) pendente(s). Escolhe um para decidir.`,
      components: rows,
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'FLOW' }
  );
}

async function handleSessionApprovePick(interaction) {
  if (isDuplicate(interaction.id)) return;
  const { isChefia } = require('../permissions/permissionEngine');
  if (!isChefia(interaction.member)) return;
  await interaction.deferUpdate();

  const saidaId = parseInt(interaction.customId.split('::')[2]);
  const memberId = parseInt(interaction.values[0]);

  const participants = await saidaRepo.getParticipants(saidaId);
  const p = participants.find(x => x.member_id === memberId && x.participant_type === 'requested');
  if (!p) {
    return safeUpdate(
      interaction,
      { content: `${EMOJI.ERRO} Pedido j├í tratado por outro admin.`, components: [] },
      { messageClass: 'WARN' }
    );
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`saida::session_approve_decide::${saidaId}::${memberId}::approve`)
      .setLabel('Aprovar (ÔåÆ trabalhador)')
      .setStyle(ButtonStyle.Success)
      .setEmoji(EMOJI.OK),
    new ButtonBuilder()
      .setCustomId(`saida::session_approve_decide::${saidaId}::${memberId}::reject`)
      .setLabel('Rejeitar (remover)')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(EMOJI.ERRO)
  );
  return safeUpdate(
    interaction,
    {
      content: `**Pedido:** <@${p.discord_id}> (**${p.display_name || 'ÔÇö'}**)\nEntra como trabalhador? Podes trocar para caract depois via "Trocar Caract Ôåö Trab".`,
      components: [row],
    },
    { messageClass: 'FLOW' }
  );
}

async function handleSessionApproveDecide(interaction) {
  if (isDuplicate(interaction.id)) return;
  const { isChefia } = require('../permissions/permissionEngine');
  if (!isChefia(interaction.member)) return;
  await interaction.deferUpdate();

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const memberId = parseInt(parts[3]);
  const decision = parts[4]; // 'approve' | 'reject'

  const participants = await saidaRepo.getParticipants(saidaId);
  const p = participants.find(x => x.member_id === memberId && x.participant_type === 'requested');
  if (!p) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Pedido j├í tratado.`, components: [] },
      { messageClass: 'BANAL' }
    );
  }

  if (decision === 'approve') {
    await saidaRepo.updateParticipant(saidaId, memberId, { participant_type: 'trabalhador' });
    log(`[SAIDA] Pedido aprovado por ${interaction.user.tag}: ${p.display_name} ÔåÆ trabalhador (sa├¡da #${saidaId}).`);
    // DM ao user a avisar.
    try {
      const user = await interaction.client.users.fetch(p.discord_id).catch(() => null);
      if (user) {
        await user
          .send({ content: `${EMOJI.OK} Pedido aceite ÔÇö entras como **trabalhador** na sa├¡da #${saidaId}.` })
          .catch(() => {});
      }
    } catch {
      /* ignore */
    }
    refreshSessionEmbed(interaction.client, saidaId).catch(() => {});
    await interaction.editReply({
      content: `${EMOJI.OK} **${p.display_name}** aprovado como trabalhador.`,
      components: [],
    });
  } else {
    // reject ÔÇö remove o participant record inteiro.
    const { query } = require('../db');
    await query('DELETE FROM operation_participants WHERE operation_id = $1 AND member_id = $2', [saidaId, memberId]);
    log(`[SAIDA] Pedido rejeitado por ${interaction.user.tag}: ${p.display_name} (sa├¡da #${saidaId}).`);
    refreshSessionEmbed(interaction.client, saidaId).catch(() => {});
    await interaction.editReply({
      content: `${EMOJI.OK} Pedido de **${p.display_name}** rejeitado.`,
      components: [],
    });
  }
  scheduleDeleteInteractionReply(interaction, 10_000);
}

module.exports = {
  buildSessionEmbed,
  publishSessionEmbed,
  refreshSessionEmbed,
  handleSessionCaracterizado,
  handleCaracterizadoSource,
  handleCaracterizadoWeaponPick,
  handleSessionTrabalhador,
  handleSessionCancel,
  handleSessionIniciar,
  handleSessionPedirJuntar,
  handleSessionSwapOpen,
  handleSessionSwapPick,
  handleSessionApproveOpen,
  handleSessionApprovePick,
  handleSessionApproveDecide,
};
