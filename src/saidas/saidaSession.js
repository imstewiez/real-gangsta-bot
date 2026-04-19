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

  // Phase 1 (pre-start): há pendentes, admin ainda não clicou "Iniciar Sessão".
  // Phase 2 (post-start): nenhum pending, caracts+trabs já assignados.
  const isPreStart = pending.length > 0;

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
    // Phase 1: só mostra "Inscritos" (tudo pending misturado).
    lines.push('', `📝 **Inscritos** ${pending.length}${maxChar ? ` · máx ${maxChar} caracterizados` : ''}`);
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

  // Phase 1 (pre-start): lista combinada de pendentes.
  if (isPreStart && pending.length) {
    lines.push('', '**── Inscritos (aguardam auto-pick) ──**');
    for (const p of pending) {
      const weaponName = p.weapon_item_id ? weaponMap.get(p.weapon_item_id) : null;
      const srcIcon = p.own_weapon ? '🔫' : p.received_org_material ? '📦' : '⏳';
      const srcLabel = p.own_weapon ? 'própria' : p.received_org_material ? 'quer da org' : 'sem arma';
      const weaponFull = weaponName ? `${srcIcon} ${weaponName} (${srcLabel})` : `${srcIcon} ${srcLabel}`;
      lines.push(`• <@${p.discord_id}> · ${weaponFull}`);
    }
  }

  if (!isPreStart && characterized.length) {
    lines.push('', '**── Caracterizados ──**');
    for (const p of characterized) {
      const weaponName = p.weapon_item_id ? weaponMap.get(p.weapon_item_id) : null;
      const srcIcon = p.own_weapon ? '🔫' : p.received_org_material ? '📦' : '⏳';
      const srcLabel = p.own_weapon ? 'própria' : p.received_org_material ? 'org' : 'sem arma';
      const weaponFull = weaponName ? `${srcIcon} ${weaponName} (${srcLabel})` : `${srcIcon} ${srcLabel}`;
      let resultMark = '';
      if (showResultStatus && p.individual_result_submitted) {
        const killsTag = p.kills > 0 ? ` · ${p.kills}k` : '';
        const diedTag = p.died ? ` · ${EMOJI.MORTE}` : '';
        resultMark = ` ✅${killsTag}${diedTag}`;
      } else if (showResultStatus) {
        resultMark = ' ⏳';
      }
      lines.push(`• <@${p.discord_id}> · ${weaponFull}${resultMark}`);
    }
  }
  if (!isPreStart && workers.length) {
    lines.push('', '**── Trabalhadores ──**');
    for (const p of workers) {
      let resultMark = '';
      if (showResultStatus && p.individual_result_submitted) {
        const killsTag = p.kills > 0 ? ` · ${p.kills}k` : '';
        const diedTag = p.died ? ` · ${EMOJI.MORTE}` : '';
        resultMark = ` ✅${killsTag}${diedTag}`;
      } else if (showResultStatus) {
        resultMark = ' ⏳';
      }
      lines.push(`• <@${p.discord_id}>${resultMark}`);
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
      lines.push(`${EMOJI.OK} **Todos preencheram!** Staff pode finalizar ↓`);
    } else {
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

    // Staff row — Iniciar Sessão (auto-pick) + Fechar (direct abort).
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::session_iniciar::${saidaId}`)
          .setLabel(`🚀 Iniciar Sessão (${pending.length} inscritos)`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(pending.length === 0),
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
    // Agora guarda como 'pending' — admin corre auto-pick que decide caract/trab
    // baseado em KDA/MVP/arma própria/material contribuído.
    await saidaEngine.addParticipant(
      saidaId,
      interaction.user.id,
      {
        participantType: 'pending',
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
    const srcLabel = source === 'own' ? 'própria' : 'da org (se picado caract)';
    await interaction.editReply({
      content: `${EMOJI.OK} Inscrito na saída #${saidaId} — arma ${srcLabel}: **${weaponName}**.\n_Aguarda Iniciar Sessão para saberes se vais caracterizado ou trabalhador._`,
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
  const pending = allParts.filter(p => p.participant_type === 'pending');
  if (!pending.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Ninguém inscrito ainda. Espera que alguém clique "Inscrever-me".` },
      { messageClass: 'BANAL' }
    );
  }

  const maxChar = saida.max_participants || 12;
  const { autoPickCaracterizados } = require('./autoPickCaracterizados');
  const { caracterizados, trabalhadores, scored } = await autoPickCaracterizados(pending, maxChar);

  // Bulk update — caract fica com os dados originais (arma). Trab perde
  // weapon_item_id e received_org_material porque não vai carregar arma.
  for (const p of caracterizados) {
    await saidaRepo.updateParticipant(saidaId, p.member_id, { participant_type: 'caracterizado' });
  }
  for (const p of trabalhadores) {
    await saidaRepo.updateParticipant(saidaId, p.member_id, {
      participant_type: 'trabalhador',
      own_weapon: false,
      brought_own: false,
      received_org_material: false,
      weapon_item_id: null,
    });
  }

  log(
    `[SAIDA] Iniciar sessão #${saidaId} por ${interaction.user.tag}: ${caracterizados.length} caract, ${trabalhadores.length} trab.`
  );

  // Refresh panel
  refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

  // DM cada um com a sua designação.
  (async () => {
    for (const s of scored) {
      const p = s.participant;
      const isCaract = caracterizados.some(c => c.member_id === p.member_id);
      try {
        const user = await interaction.client.users.fetch(p.discord_id).catch(() => null);
        if (!user) continue;
        const role = isCaract ? '🔫 **Caracterizado**' : '🔧 **Trabalhador**';
        await user
          .send({
            content:
              `${EMOJI.OK} Saída #${saidaId} iniciada — vais como ${role}.\n` +
              (isCaract
                ? 'Prepara-te: quando a chefia fechar, recebes a DM para preencher o teu resultado (kills/sobreviveste/arma).'
                : 'Organização: a chefia definiu-te para suporte de material.'),
          })
          .catch(() => {});
      } catch {
        /* ignore */
      }
    }
  })();

  const summary =
    `${EMOJI.OK} **Sessão #${saidaId} iniciada.** Auto-pick:\n` +
    `🔫 **${caracterizados.length}** caracterizados · 🔧 **${trabalhadores.length}** trabalhadores\n\n` +
    `_Todos receberam DM com a sua designação. Podes trocar manualmente no painel se precisares._`;

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
};
