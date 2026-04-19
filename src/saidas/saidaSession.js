'use strict';
/**
 * Sessão de saída — embed interactivo com registo de participantes.
 *
 * Quando uma saída é criada, publica-se um embed público com:
 *   - detalhes da saída (spot, tipo, data, hora, líder)
 *   - slots ocupados (X/12 caracterizados, Y trabalhadores)
 *   - lista de inscritos (separados por tipo)
 *   - botões: Caracterizado (self-serve arma), Trabalhador (1 click), Sair
 *
 * O embed é editado em tempo real à medida que membros se registam.
 *
 * Fluxo Caracterizado (self-serve — participante escolhe a arma):
 *   1. Click `saida::session_caracterizado::<saidaId>`
 *      → ephemeral com 2 botões: Arma Própria / Pedir à Org
 *   2. Click `saida::source::<saidaId>::own|org`
 *      → ephemeral com StringSelect de armas da catálogo (ou stock se org)
 *   3. Select `saida::weapon_pick::<saidaId>::own|org`
 *      → guarda weapon_item_id + regista participante
 *
 * Fluxo Trabalhador: click → regista directamente (não precisa arma).
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
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const { saidaRepo, memberRepo, inventoryRepo } = require('../repositories');
const saidaEngine = require('./saidaEngine');
const { safeReply, safeUpdate, isDuplicate, scheduleDeleteInteractionReply } = require('../shared/interactionHelpers');
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
  const pending = participants.filter(p => p.participant_type === 'pending');
  const requested = participants.filter(p => p.participant_type === 'requested');
  const maxChar = saida.max_participants || 12;
  const slotsLeft = Math.max(0, maxChar - characterized.length);

  // Phase 1 (pre-start): admin ainda não clicou "Iniciar Sessão". Inscritos
  // entram directo como caracterizado; Iniciar depois demite para trab se
  // houver > max_participants.
  // Phase 2 (post-start): admin iniciou, identificado por session_started_at.
  // Pedir para Juntar só aparece aqui (requer approve).
  const isPreStart = !saida.session_started_at;

  const type = SAIDA_TYPE[saida.operation_type] || saida.operation_type;
  // Data no formato canónico dd/mm/yyyy. Só mostra hora se foi marcada
  // (scheduled_time !== null && !== '00:00'); evita mostrar "00:00" à toa
  // para saídas onde a hora não é relevante.
  let dateLine = formatPtDateOnly(saida.date);
  if (saida.scheduled_time) {
    const t = String(saida.scheduled_time).slice(0, 5);
    if (t && t !== '00:00') dateLine += ` · ${t}`;
  }
  // Líder = sempre o criador da saída. operations.leader_id raramente é
  // preenchido (requeria UI de assign que não existe); created_by (discord_id
  // do utilizador que abriu a saída) é o sinal fiável. Fallback para
  // leader_discord_id se created_by ausente em saídas muito antigas.
  const leaderId = saida.created_by || saida.leader_discord_id;
  const leader = leaderId ? `<@${leaderId}>` : '—';

  const isClosed = saida.status === 'cancelada';
  const isConcluded = saida.status === 'concluida';
  const isInLiquidacao = saida.status === 'em_liquidacao';
  const isOpen = !isClosed && !isConcluded && !isInLiquidacao;

  const statusEmoji = isClosed ? '⛔' : isConcluded ? '🏁' : isInLiquidacao ? '🔶' : slotsLeft === 0 ? '🔴' : '🟢';
  const statusLabel = isClosed
    ? 'Cancelada'
    : isConcluded
      ? 'Concluída'
      : isInLiquidacao
        ? 'Em liquidação'
        : slotsLeft === 0
          ? 'Cheio'
          : 'Inscrições abertas';

  const lines = [
    `# ${EMOJI.SAIDA} Saída #${saida.id} — ${type}`,
    '',
    `> ${statusEmoji} **${statusLabel}**`,
    '',
    `📍 **${saida.spot || '—'}** · 📅 ${dateLine} · 👑 ${leader}`,
  ];

  if (isPreStart) {
    // Phase 1: inscritos entram directos como caracts; Iniciar depois demite
    // para trab se > maxChar via auto-pick.
    const overflow = characterized.length > maxChar ? ` · ⚠ ${characterized.length - maxChar} serão demitidos` : '';
    lines.push('', `📝 **Inscritos** ${characterized.length}${maxChar ? `/${maxChar}` : ''}${overflow}`);
  } else {
    lines.push('', `🔫 **Caracterizados** ${characterized.length}/${maxChar} · 🔧 **Trabalhadores** ${workers.length}`);
  }

  if (saida.notes) lines.push(`> 📝 _${saida.notes}_`);

  // Lista de inscritos com status da arma + nome específico se escolheu
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

  // Sanity cap — kills ≥ 20 são flagged visualmente para chefia rever antes
  // de finalizar (provavelmente typo; o cap hard é 99 no modal).
  const KILLS_SANITY_THRESHOLD = 20;
  const formatResultMark = p => {
    if (!showResultStatus) return '';
    if (!p.individual_result_submitted) return ' ⏳';
    const kills = p.kills || 0;
    const killsTag = kills > 0 ? ` · ${kills}k${kills >= KILLS_SANITY_THRESHOLD ? '⚠' : ''}` : '';
    const diedTag = p.died ? ` · ${EMOJI.MORTE}` : '';
    return ` ✅${killsTag}${diedTag}`;
  };

  if (characterized.length) {
    lines.push('', '**── Caracterizados ──**');
    for (const p of characterized) {
      const weaponName = p.weapon_item_id ? weaponMap.get(p.weapon_item_id) : null;
      const srcIcon = p.own_weapon ? '🔫' : p.received_org_material ? '📦' : '⏳';
      const srcLabel = p.own_weapon ? 'própria' : p.received_org_material ? 'org' : 'sem arma';
      const weaponFull = weaponName ? `${srcIcon} ${weaponName} (${srcLabel})` : `${srcIcon} ${srcLabel}`;
      lines.push(`• <@${p.discord_id}> · ${weaponFull}${formatResultMark(p)}`);
    }
  }
  if (workers.length) {
    lines.push('', '**── Trabalhadores ──**');
    for (const p of workers) {
      lines.push(`• <@${p.discord_id}>${formatResultMark(p)}`);
    }
  }
  // Pedidos de entrada em sessão activa (post-start) — visíveis para admin.
  if (requested.length) {
    lines.push('', `**── Pedidos pendentes (${requested.length}) ──**`);
    for (const p of requested) {
      lines.push(`• <@${p.discord_id}> — aguarda aprovação`);
    }
  }

  if (isClosed) {
    lines.push('', `${EMOJI.FECHAR} _Saída ${saida.status}. Registo encerrado._`);
  } else if (isInLiquidacao) {
    const submittedCount = participants.filter(p => p.individual_result_submitted).length;
    const totalCount = participants.length;
    const pendingList = participants.filter(p => !p.individual_result_submitted);
    const pendingWeapon = characterized.filter(p => p.weapon_return_status === 'declared_returned').length;
    const resultLabel =
      { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate', sem_conflito: 'Sem conflito', abortada: 'Abortada' }[
        saida.result
      ] || saida.result;

    lines.push('');
    lines.push(`🔶 **Em liquidação** — resultado: **${resultLabel}**`);
    if (saida.enemy_name) lines.push(`${EMOJI.COMBATE} Contra: **${saida.enemy_name}**`);
    lines.push(`${EMOJI.PENDENTE} **${submittedCount}/${totalCount}** resultado(s) preenchido(s)`);

    if (submittedCount >= totalCount && totalCount > 0) {
      // Auto-finalize fallback: se passaram > 2min desde o último submit e
      // a saída ainda está em_liquidacao, provavelmente o auto-finalize
      // falhou silenciosamente. Avisa chefia para finalizar manualmente em
      // vez de ficar silenciosa. Sem coluna extra — staleness deduzida.
      const lastSubmitAt = participants
        .map(p => (p.individual_result_at ? new Date(p.individual_result_at).getTime() : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      const staleMs = lastSubmitAt ? Date.now() - lastSubmitAt : 0;
      // 5 min threshold — finalize real inclui publicar embed + delete msg +
      // stats + event bus; 2 min era tight e podia trip durante finalize
      // em voo. Mensagem softer ("se estiver preso") em vez de acusar falha.
      const AUTO_FINALIZE_STALE_THRESHOLD = 5 * 60_000;
      if (staleMs > AUTO_FINALIZE_STALE_THRESHOLD) {
        lines.push(
          `${EMOJI.OK} **Todos preencheram!** Se o auto-finalize estiver preso (${Math.round(staleMs / 60_000)} min), clica **"Finalizar e Publicar"** ↓`
        );
      } else {
        lines.push(`${EMOJI.OK} **Todos preencheram!** Staff pode finalizar ↓`);
      }
    } else {
      // Cockpit: lista explícita de quem falta, para chefia ver rapidamente
      // quem chatear sem ter de abrir DMs ou scroll pela lista.
      const aguarda = pendingList
        .slice(0, 10)
        .map(p => `<@${p.discord_id}>`)
        .join(', ');
      const extra = pendingList.length > 10 ? ` +${pendingList.length - 10}` : '';
      lines.push(`${EMOJI.PENDENTE} **Aguarda** (${pendingList.length}): ${aguarda}${extra}`);
      lines.push('_Participantes — cliquem em **"Preencher o meu Resultado"** ↓_');
    }
    if (pendingWeapon > 0) lines.push(`${EMOJI.WARN} **${pendingWeapon}** devolução(ões) de arma pendente(s)`);
  } else if (isConcluded) {
    const pendingWeapon = characterized.filter(p => p.weapon_return_status === 'declared_returned').length;
    const resultLabel =
      { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate', sem_conflito: 'Sem conflito', abortada: 'Abortada' }[
        saida.result
      ] || saida.result;
    const totalKills = participants.reduce((a, p) => a + (p.kills || 0), 0);
    const totalDeaths = participants.filter(p => p.died).length;
    const mvp = participants.find(p => p.mvp_flag);

    lines.push('');
    lines.push(`${EMOJI.FECHAR} **Concluída** — resultado: **${resultLabel}**`);
    lines.push(
      `${EMOJI.KILL} **${totalKills}** kills · ${EMOJI.MORTE} **${totalDeaths}** mortes · ${EMOJI.OK} **${participants.length - totalDeaths}** vivos`
    );
    if (mvp) lines.push(`${EMOJI.MVP} MVP: **${mvp.display_name || 'Participante'}** (${mvp.kills || 0} kills)`);
    if (pendingWeapon > 0) lines.push(`${EMOJI.WARN} **${pendingWeapon}** devolução(ões) de arma pendente(s)`);
  }

  const embedColor = isClosed ? 0x95a5a6 : isConcluded ? 0x2ecc71 : isInLiquidacao ? 0xe67e22 : 0x3498db;
  const embed = brandEmbed('MOVEMENT').setColor(embedColor).setDescription(lines.join('\n'));

  const components = [];

  if (isOpen && isPreStart) {
    // Phase 1 — pré-start: single "Inscrever-me" button (saves as pending).
    // Admin vê "Iniciar Sessão" que dispara auto-pick.
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_caracterizado::${saidaId}`)
          .setLabel(`✍️ Inscrever-me (${pending.length})`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`saida::session_cancel::${saidaId}`)
          .setLabel('Sair')
          .setStyle(ButtonStyle.Danger)
          .setEmoji(EMOJI.APAGAR)
      )
    );

    // Staff row — Iniciar Sessão (no-op se ≤ maxChar; auto-pick demite se >) + Fechar.
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_iniciar::${saidaId}`)
          .setLabel(`🚀 Iniciar Sessão (${characterized.length})`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(characterized.length === 0),
        new ButtonBuilder()
          .setCustomId(`saida::session_close_direct::${saidaId}`)
          .setLabel('Fechar Sessão')
          .setStyle(ButtonStyle.Danger)
          .setEmoji(EMOJI.FECHAR)
      )
    );
  } else if (isOpen) {
    // Phase 2 — post-start: já não há inscrição self-service por default.
    // Admin controla (swap, aprovar pedidos, fechar). User externo pode
    // "Pedir para Juntar" que cria um requested.
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_pedir_juntar::${saidaId}`)
          .setLabel('Pedir para Juntar')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🙋'),
        new ButtonBuilder()
          .setCustomId(`saida::session_cancel::${saidaId}`)
          .setLabel('Sair')
          .setStyle(ButtonStyle.Danger)
          .setEmoji(EMOJI.APAGAR)
      )
    );

    // Admin row 1 — gestão (swap + approve). Non-admins vêem mas são rejeitados.
    const adminMgmtRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::session_swap_open::${saidaId}`)
        .setLabel('Trocar Caract ↔ Trab')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
        .setDisabled(characterized.length + workers.length === 0)
    );
    if (requested.length > 0) {
      adminMgmtRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_approve_open::${saidaId}`)
          .setLabel(`Aprovar Pedidos (${requested.length})`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✅')
      );
    }
    components.push(adminMgmtRow);

    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_close_direct::${saidaId}`)
          .setLabel('Fechar Sessão')
          .setStyle(ButtonStyle.Danger)
          .setEmoji(EMOJI.FECHAR)
      )
    );
  } else if (isInLiquidacao) {
    const submittedCount = participants.filter(p => p.individual_result_submitted).length;
    const totalCount = participants.length;
    const pendingCount = totalCount - submittedCount;
    const allDone = submittedCount >= totalCount && totalCount > 0;

    // Row 1 — resultado individual (self-service, permite editar)
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::submit_result::${saidaId}`)
          .setLabel(`Preencher / Editar Resultado (${submittedCount}/${totalCount})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji(EMOJI.OK)
      )
    );

    // Row 2 — staff: finalizar + confirmar armas
    const finalizeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::finalize::${saidaId}`)
        .setLabel(allDone ? 'Finalizar e Publicar' : `Forçar Fecho (${pendingCount} sem resultado)`)
        .setStyle(allDone ? ButtonStyle.Success : ButtonStyle.Danger)
        .setEmoji(EMOJI.FECHAR),
      new ButtonBuilder()
        .setCustomId(`saida::weapon_queue::${saidaId}`)
        .setLabel('Confirmar Armas')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔫')
    );
    components.push(finalizeRow);

    // Row 3 — staff: lembrar pendentes (só aparece se há pendentes)
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
    // Sessão concluída — armas pendentes pode ainda precisar de confirmação
    const pendingWeapon = characterized.filter(p => p.weapon_return_status === 'declared_returned').length;
    if (pendingWeapon > 0) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`saida::weapon_queue::${saidaId}`)
            .setLabel(`Confirmar Armas (${pendingWeapon} pendentes)`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔫')
        )
      );
    }
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

// ── STEP 1: Caracterizado → ephemeral com 2 botões (origem da arma) ─────
async function handleSessionCaracterizado(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.customId.split('::')[2]);

  // Guard pré-fluxo: se já está inscrito, diz já aqui (não deixa começar
  // a escolher arma só para apanhar erro no submit).
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (member) {
    const existing = (await saidaRepo.getParticipants(saidaId)).find(p => p.member_id === member.id);
    if (existing) {
      return safeReply(
        interaction,
        {
          content:
            `${EMOJI.BLOQUEADO} Já estás inscrito como **${existing.participant_type}** na saída #${saidaId}. ` +
            'Usa **"Cancelar Registo"** no painel da saída se queres mudar.',
          flags: MessageFlags.Ephemeral,
        },
        { messageClass: 'WARN' }
      );
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`saida::source::${saidaId}::own`)
      .setLabel('Arma Própria')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔫'),
    new ButtonBuilder()
      .setCustomId(`saida::source::${saidaId}::org`)
      .setLabel('Pedir à Org')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(EMOJI.FORNECER)
  );

  return safeReply(
    interaction,
    {
      content: `**Saída #${saidaId}** — como te armas?\n\n🔫 **Arma Própria** — já tens arma contigo\n${EMOJI.FORNECER} **Pedir à Org** — a firma cede a arma do stock`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'FLOW' }
  );
}

// ── STEP 2: source picker → abre StringSelect com armas ─────────────────
async function handleCaracterizadoSource(interaction) {
  if (isDuplicate(interaction.id)) return;

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const source = parts[3]; // 'own' ou 'org'

  // Armas — filtradas pela whitelist em `config/saida-weapons.json`.
  // Mesma lista para "Arma Própria" e "Pedir à Org": armas brancas + outras
  // fora da whitelist NUNCA aparecem. Ordem segue a do JSON (editável sem
  // tocar em código).
  const items = await inventoryRepo.getItems(true);
  const { filterAndOrderForSaida } = require('./allowedWeapons');
  const weapons = filterAndOrderForSaida(items);

  if (source === 'org') {
    // Carrega stock por arma para label enriquecido. Ordem mantém-se
    // (não reordena por stock — quem sabe o que quer, clica).
    for (const w of weapons) {
      w._balance = Number(await inventoryRepo.getStockForItem(w.id).catch(() => 0)) || 0;
    }
  }

  if (weapons.length === 0) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Sem armas elegíveis no catálogo. Contacta a chefia.`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }

  // Discord StringSelect: max 25 opções. A whitelist tem 10 → sempre cabe.
  const options = weapons.slice(0, 25).map(w => {
    let label = w.name;
    if (source === 'org') {
      label = w._balance > 0 ? `${w.name} · stock ${w._balance}` : `${w.name} · sem stock`;
    }
    return new StringSelectMenuOptionBuilder().setLabel(label.slice(0, 100)).setValue(String(w.id)).setEmoji('🔫');
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`saida::weapon_pick::${saidaId}::${source}`)
    .setPlaceholder(source === 'org' ? 'Escolhe a arma da org' : 'Escolhe a tua arma')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  // safeUpdate substitui o ephemeral "como te armas?" (step 1) pelo select.
  // Antes era safeReply que criava um 2º ephemeral → stacking visível.
  return safeUpdate(
    interaction,
    {
      content:
        source === 'org'
          ? `**Saída #${saidaId}** — escolhe a arma que queres da org.`
          : `**Saída #${saidaId}** — diz qual é a tua arma.`,
      components: [row],
    },
    { messageClass: 'FLOW' }
  );
}

// ── STEP 3: weapon pick → grava participante + refresh embed ────────────
async function handleCaracterizadoWeaponPick(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate();

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const source = parts[3]; // 'own' ou 'org'
  const weaponItemId = parseInt(interaction.values[0]);

  try {
    const item = await inventoryRepo.getItemById(weaponItemId);
    // Guarda directo como 'caracterizado' — user pede que quem se inscreve
    // no início entre já a lutar. Só no Iniciar Sessão é que, se houver mais
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
    const srcLabel = source === 'own' ? 'própria' : 'da org';
    await interaction.editReply({
      content: `${EMOJI.OK} Inscrito como **caracterizado** na saída #${saidaId} — arma ${srcLabel}: **${weaponName}**.`,
      components: [],
    });
    // Auto-delete informativo — 10s.
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

// ── Trabalhador: click único → regista directamente ─────────────────────
async function handleSessionTrabalhador(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2]);

  // Guard pré-fluxo (igual ao caracterizado)
  const member = await memberRepo.findByDiscordId(interaction.user.id);
  if (member) {
    const existing = (await saidaRepo.getParticipants(saidaId)).find(p => p.member_id === member.id);
    if (existing) {
      return safeReply(
        interaction,
        {
          content:
            `${EMOJI.BLOQUEADO} Já estás inscrito como **${existing.participant_type}** na saída #${saidaId}. ` +
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
        content: `${EMOJI.OK} Registado como **trabalhador** na saída #${saidaId}.`,
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
    return safeReply(interaction, { content: `${EMOJI.ERRO} Não estás registado no sistema.` }, { dismissible: true });
  }

  const participants = await saidaRepo.getParticipants(saidaId);
  const existing = participants.find(p => p.discord_id === interaction.user.id);
  if (!existing) {
    return safeReply(interaction, { content: `${EMOJI.INFO} Não estás inscrito nesta saída.` }, { dismissible: true });
  }

  // Não permite cancelar se já liquidado/settled
  if (existing.settled) {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} Já foste liquidado — não podes cancelar.` },
      { dismissible: true }
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
      content: `${EMOJI.OK} Registo cancelado na saída **#${saidaId}**.`,
    },
    { dismissible: true }
  );

  refreshSessionEmbed(interaction.client, saidaId).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2 handlers — Iniciar Sessão (auto-pick) + Pedir para Juntar
// ═══════════════════════════════════════════════════════════════════════════

async function handleSessionIniciar(interaction) {
  if (isDuplicate(interaction.id)) return;
  const { isChefia } = require('../permissions/permissionEngine');
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} Só chefia pode iniciar a sessão.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'WARN' }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const saidaId = parseInt(interaction.customId.split('::')[2]);

  const saida = await saidaRepo.findById(saidaId);
  if (!saida || saida.status !== 'aberta') {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Saída #${saidaId} não está aberta.` },
      { messageClass: 'ERROR' }
    );
  }

  const allParts = await saidaRepo.getParticipants(saidaId);
  const inscritos = allParts.filter(p => p.participant_type === 'caracterizado' || p.participant_type === 'pending');
  if (!inscritos.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Ninguém inscrito ainda. Espera que alguém clique "Inscrever-me".` },
      { messageClass: 'BANAL' }
    );
  }

  const maxChar = saida.max_participants || 12;
  const { queryWithTransaction } = require('../db');
  const { autoPickCaracterizados } = require('./autoPickCaracterizados');

  // Sempre corre auto-pick — internamente protege chefia + patrao_di_zona
  // (lugar reservado, nunca vão para trabalhador). Bairristas/oficiais
  // competem pelos slots restantes por KDA/MVP/arma/material.
  const { caracterizados, trabalhadores, scored } = await autoPickCaracterizados(inscritos, maxChar);

  // Atómico: bulk updates + session_started_at num só BEGIN/COMMIT. Se falha
  // a meio (ex.: coluna inexistente, constraint violation), rollback deixa
  // a saída intacta. Antes podia ficar metade promovido / session_started_at
  // não gravado.
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
    warn(`[SAIDA] Iniciar sessão #${saidaId} falhou (rollback): ${e.message}`);
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Falha a iniciar sessão — tenta outra vez. (${e.message})` },
      { messageClass: 'ERROR' }
    );
  }

  // Audit trail — regista a decisão completa (promoções/despromoções + scores)
  // para que "porque é que fui trabalhador?" tenha resposta rastreável.
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
    `[SAIDA] Iniciar sessão #${saidaId} por ${interaction.user.tag}: ${caracterizados.length} caract, ${trabalhadores.length} trab (total ${inscritos.length}).`
  );

  refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

  // DM só a quem passou para trabalhador (quem ficou caract já sabia).
  if (trabalhadores.length > 0) {
    (async () => {
      for (const p of trabalhadores) {
        try {
          const user = await interaction.client.users.fetch(p.discord_id).catch(() => null);
          if (!user) continue;
          await user
            .send({
              content:
                `${EMOJI.INFO} Saída #${saidaId} iniciada — ficas como **trabalhador** (havia mais de ${maxChar} inscritos).\n` +
                `Bot escolheu os ${maxChar} melhores por KDA/MVP/arma/material (chefia + patrão di zona têm lugar reservado).\n` +
                `A chefia pode trocar manualmente no painel se precisar.`,
            })
            .catch(() => {});
        } catch {
          /* ignore */
        }
      }
    })();
  }

  const summary =
    trabalhadores.length > 0
      ? `${EMOJI.OK} **Sessão #${saidaId} iniciada.** ${inscritos.length} inscritos, ${maxChar} slots para caract:\n` +
        `🔫 **${caracterizados.length}** caracterizados (chefia + patrão têm lugar reservado) · 🔧 **${trabalhadores.length}** trabalhadores (auto-pick por KDA).\n` +
        `_Trabalhadores receberam DM. Podes trocar manualmente no painel._`
      : `${EMOJI.OK} **Sessão #${saidaId} iniciada.** ${caracterizados.length} caracterizados (todos cabem).`;

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
      { content: `${EMOJI.ERRO} Não estás registado na firma.` },
      { messageClass: 'ERROR' }
    );
  }

  const participants = await saidaRepo.getParticipants(saidaId);
  const existing = participants.find(p => p.member_id === member.id);
  if (existing) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.BLOQUEADO} Já estás na saída como **${existing.participant_type}**.`,
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
    // avisa o creator por DM — pode valer a pena swap. Evita que um
    // bairrista com KDA alto fique de fora só porque chegou tarde.
    // Fire-and-forget — falhar aqui não afecta o pedido.
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

        // Qual caract seria deslocado na hipótese → nome para a DM
        const deslocado = currentCaracs.find(c => !hypoWinners.some(w => w.member_id === c.member_id));

        const creator = await interaction.client.users.fetch(saida.created_by).catch(() => null);
        if (!creator) return;
        await creator
          .send({
            content:
              `${EMOJI.WARN} Saída **#${saidaId}** — **${member.display_name}** pediu para juntar-se e ` +
              `tem score superior a **${deslocado?.display_name || 'um caracterizado actual'}**.\n` +
              `Podes considerar aprovar e fazer swap manualmente pelo painel (**"Trocar Caract ↔ Trab"**).`,
          })
          .catch(() => {});
      } catch (e) {
        warn(`[SAIDA] Alerta-creator falhou para #${saidaId}: ${e.message}`);
      }
    })();

    return safeReply(
      interaction,
      {
        content:
          `${EMOJI.OK} Pedido enviado à chefia.\n` +
          `Se for aprovado, entras como **trabalhador** (chefia pode trocar para caracterizado).`,
      },
      { messageClass: 'BANAL' }
    );
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2 handlers — Admin swap + approve/reject requests
// ═══════════════════════════════════════════════════════════════════════════

async function handleSessionSwapOpen(interaction) {
  if (isDuplicate(interaction.id)) return;
  const { isChefia } = require('../permissions/permissionEngine');
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} Só chefia pode trocar participantes.`, flags: MessageFlags.Ephemeral },
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
    const from = p.participant_type === 'caracterizado' ? '🔫 Caract' : '🔧 Trab';
    const to = p.participant_type === 'caracterizado' ? '🔧 Trab' : '🔫 Caract';
    return new StringSelectMenuOptionBuilder()
      .setLabel(`${p.display_name || 'Participante'} · ${from} → ${to}`.slice(0, 100))
      .setValue(String(p.member_id));
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`saida::session_swap_pick::${saidaId}`)
    .setPlaceholder('Escolhe quem trocar')
    .addOptions(options);

  return safeReply(
    interaction,
    {
      content: `**Saída #${saidaId}** — trocar caract ↔ trab.\nO tipo vai inverter para quem escolheres.`,
      components: [new ActionRowBuilder().addComponents(select)],
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
    return interaction.editReply({ content: `${EMOJI.ERRO} Participante não encontrado.`, components: [] });
  }

  const previousType = p.participant_type;
  const newType = previousType === 'caracterizado' ? 'trabalhador' : 'caracterizado';
  const updates = { participant_type: newType };
  if (newType === 'trabalhador') {
    // Demote → strip weapon info (trab não carrega arma).
    updates.own_weapon = false;
    updates.brought_own_material = false;
    updates.received_org_material = false;
    updates.weapon_item_id = null;
  }
  await saidaRepo.updateParticipant(saidaId, memberId, updates);
  log(`[SAIDA] Swap por ${interaction.user.tag}: ${p.display_name} → ${newType} (saída #${saidaId}).`);

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
    content: `${EMOJI.OK} **${p.display_name}** agora é **${newType}**.`,
    components: [],
  });
  scheduleDeleteInteractionReply(interaction, 10_000);
}

async function handleSessionApproveOpen(interaction) {
  if (isDuplicate(interaction.id)) return;
  const { isChefia } = require('../permissions/permissionEngine');
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: `${EMOJI.BLOQUEADO} Só chefia pode aprovar pedidos.`, flags: MessageFlags.Ephemeral },
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

  const select = new StringSelectMenuBuilder()
    .setCustomId(`saida::session_approve_pick::${saidaId}`)
    .setPlaceholder('Escolhe quem aprovar / rejeitar')
    .addOptions(options);

  return safeReply(
    interaction,
    {
      content: `**Saída #${saidaId}** — ${requested.length} pedido(s) pendente(s). Escolhe um para decidir.`,
      components: [new ActionRowBuilder().addComponents(select)],
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'FLOW' }
  );
}

async function handleSessionApprovePick(interaction) {
  if (isDuplicate(interaction.id)) return;
  const { isChefia } = require('../permissions/permissionEngine');
  if (!isChefia(interaction.member)) return;

  const saidaId = parseInt(interaction.customId.split('::')[2]);
  const memberId = parseInt(interaction.values[0]);

  const participants = await saidaRepo.getParticipants(saidaId);
  const p = participants.find(x => x.member_id === memberId && x.participant_type === 'requested');
  if (!p) {
    return safeUpdate(
      interaction,
      { content: `${EMOJI.ERRO} Pedido já tratado por outro admin.`, components: [] },
      { messageClass: 'WARN' }
    );
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`saida::session_approve_decide::${saidaId}::${memberId}::approve`)
      .setLabel('Aprovar (→ trabalhador)')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`saida::session_approve_decide::${saidaId}::${memberId}::reject`)
      .setLabel('Rejeitar (remover)')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⛔')
  );
  return safeUpdate(
    interaction,
    {
      content: `**Pedido:** <@${p.discord_id}> (**${p.display_name || '—'}**)\nEntra como trabalhador? Podes trocar para caract depois via "Trocar Caract ↔ Trab".`,
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
    return interaction.editReply({
      content: `${EMOJI.INFO} Pedido já tratado.`,
      components: [],
    });
  }

  if (decision === 'approve') {
    await saidaRepo.updateParticipant(saidaId, memberId, { participant_type: 'trabalhador' });
    log(`[SAIDA] Pedido aprovado por ${interaction.user.tag}: ${p.display_name} → trabalhador (saída #${saidaId}).`);
    // DM ao user a avisar.
    try {
      const user = await interaction.client.users.fetch(p.discord_id).catch(() => null);
      if (user) {
        await user
          .send({ content: `${EMOJI.OK} Pedido aceite — entras como **trabalhador** na saída #${saidaId}.` })
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
    // reject — remove o participant record inteiro.
    const { query } = require('../db');
    await query('DELETE FROM operation_participants WHERE operation_id = $1 AND member_id = $2', [saidaId, memberId]);
    log(`[SAIDA] Pedido rejeitado por ${interaction.user.tag}: ${p.display_name} (saída #${saidaId}).`);
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
