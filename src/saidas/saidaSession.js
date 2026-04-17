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
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  MessageFlags,
} = require('discord.js');
const { saidaRepo, memberRepo, inventoryRepo } = require('../repositories');
const saidaEngine = require('./saidaEngine');
const { safeReply, isDuplicate } = require('../shared/interactionHelpers');
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
  const isInLiquidacao = saida.status === 'em_liquidacao';
  const isOpen = !isClosed && !isConcluded && !isInLiquidacao;

  const statusEmoji = isClosed ? '⛔' : isConcluded ? '🏁' : isInLiquidacao ? '🔶' : slotsLeft === 0 ? '🔴' : '🟢';
  const statusLabel = isClosed ? 'Cancelada' : isConcluded ? 'Concluída' : isInLiquidacao ? 'Em liquidação' : slotsLeft === 0 ? 'Cheio' : 'Inscrições abertas';

  const lines = [
    `# ${EMOJI.SAIDA} Saída #${saida.id} — ${type}`,
    '',
    `> ${statusEmoji} **${statusLabel}**`,
    '',
    `📍 **${saida.spot || '—'}** · 📅 ${dateLine} · 👑 ${leader}`,
    '',
    `🔫 **Caracterizados** ${characterized.length}/${maxChar} · 🔧 **Trabalhadores** ${workers.length}`,
  ];

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

  if (characterized.length) {
    lines.push('', `**── Caracterizados ──**`);
    for (const p of characterized) {
      const weaponName = p.weapon_item_id ? weaponMap.get(p.weapon_item_id) : null;
      const srcIcon = p.own_weapon ? '🔫' : (p.received_org_material ? '📦' : '⏳');
      const srcLabel = p.own_weapon ? 'própria' : (p.received_org_material ? 'org' : 'sem arma');
      const weaponFull = weaponName
        ? `${srcIcon} ${weaponName} (${srcLabel})`
        : `${srcIcon} ${srcLabel}`;
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
  if (workers.length) {
    lines.push('', `**── Trabalhadores ──**`);
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

  if (isClosed) {
    lines.push('', `${EMOJI.FECHAR} _Saída ${saida.status}. Registo encerrado._`);
  } else if (isInLiquidacao) {
    const submittedCount = participants.filter(p => p.individual_result_submitted).length;
    const totalCount = participants.length;
    const pendingWeapon = characterized.filter(p => p.weapon_return_status === 'declared_returned').length;
    const resultLabel = { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate', sem_conflito: 'Sem conflito', abortada: 'Abortada' }[saida.result] || saida.result;

    lines.push('');
    lines.push(`🔶 **Em liquidação** — resultado: **${resultLabel}**`);
    if (saida.enemy_name) lines.push(`${EMOJI.COMBATE} Contra: **${saida.enemy_name}**`);
    lines.push(`${EMOJI.PENDENTE} **${submittedCount}/${totalCount}** resultado(s) preenchido(s)`);
    if (submittedCount >= totalCount && totalCount > 0) {
      lines.push(`${EMOJI.OK} **Todos preencheram!** Staff pode finalizar ↓`);
    } else {
      lines.push(`_Participantes — cliquem em **"Preencher o meu Resultado"** ↓_`);
    }
    if (pendingWeapon > 0) lines.push(`${EMOJI.WARN} **${pendingWeapon}** devolução(ões) de arma pendente(s)`);
  } else if (isConcluded) {
    const pendingWeapon = characterized.filter(p => p.weapon_return_status === 'declared_returned').length;
    const resultLabel = { vitoria: 'Vitória', derrota: 'Derrota', empate: 'Empate', sem_conflito: 'Sem conflito', abortada: 'Abortada' }[saida.result] || saida.result;
    const totalKills = participants.reduce((a, p) => a + (p.kills || 0), 0);
    const totalDeaths = participants.filter(p => p.died).length;
    const mvp = participants.find(p => p.mvp_flag);

    lines.push('');
    lines.push(`${EMOJI.FECHAR} **Concluída** — resultado: **${resultLabel}**`);
    lines.push(`${EMOJI.KILL} **${totalKills}** kills · ${EMOJI.MORTE} **${totalDeaths}** mortes · ${EMOJI.OK} **${participants.length - totalDeaths}** vivos`);
    if (mvp) lines.push(`${EMOJI.MVP} MVP: **${mvp.display_name || 'Participante'}** (${mvp.kills || 0} kills)`);
    if (pendingWeapon > 0) lines.push(`${EMOJI.WARN} **${pendingWeapon}** devolução(ões) de arma pendente(s)`);
  }

  const embedColor = isClosed ? 0x95A5A6 : isConcluded ? 0x2ECC71 : isInLiquidacao ? 0xE67E22 : 0x3498DB;
  const embed = brandEmbed('MOVEMENT')
    .setColor(embedColor)
    .setDescription(lines.join('\n'));

  const components = [];

  if (isOpen) {
    // Row 1 — inscrição self-service (participante escolhe arma no dropdown)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::session_caracterizado::${saidaId}`)
        .setLabel(`🔫 Caracterizado (${characterized.length}/${maxChar})`)
        .setStyle(slotsLeft > 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(slotsLeft === 0),
      new ButtonBuilder()
        .setCustomId(`saida::session_trabalhador::${saidaId}`)
        .setLabel(`🔧 Trabalhador (${workers.length})`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`saida::session_cancel::${saidaId}`)
        .setLabel('Sair')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.APAGAR),
    ));

    // Row 2 — staff: fechar sessão (vai directo para o select de resultado,
    // sem ter de escolher a saída outra vez — já estamos nela)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::session_close_direct::${saidaId}`)
        .setLabel('Fechar Sessão')
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.FECHAR),
    ));
  } else if (isInLiquidacao) {
    const submittedCount = participants.filter(p => p.individual_result_submitted).length;
    const totalCount = participants.length;
    const pendingCount = totalCount - submittedCount;
    const allDone = submittedCount >= totalCount && totalCount > 0;

    // Row 1 — resultado individual (self-service, permite editar)
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`saida::submit_result::${saidaId}`)
        .setLabel(`Preencher / Editar Resultado (${submittedCount}/${totalCount})`)
        .setStyle(ButtonStyle.Success)
        .setEmoji(EMOJI.OK),
    ));

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
        .setEmoji('🔫'),
    );
    components.push(finalizeRow);

    // Row 3 — staff: lembrar pendentes (só aparece se há pendentes)
    if (pendingCount > 0) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::reping::${saidaId}`)
          .setLabel(`Lembrar ${pendingCount} Pendente(s)`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji(EMOJI.CONVOCAR),
      ));
    }
  } else if (isConcluded) {
    // Sessão concluída — armas pendentes pode ainda precisar de confirmação
    const pendingWeapon = characterized.filter(p => p.weapon_return_status === 'declared_returned').length;
    if (pendingWeapon > 0) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`saida::weapon_queue::${saidaId}`)
          .setLabel(`Confirmar Armas (${pendingWeapon} pendentes)`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔫'),
      ));
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
      return safeReply(interaction, {
        content: `${EMOJI.BLOQUEADO} Já estás inscrito como **${existing.participant_type}** na saída #${saidaId}. ` +
                 `Usa **"Cancelar Registo"** no painel da saída se queres mudar.`,
        flags: MessageFlags.Ephemeral,
      }, { messageClass: 'WARN' });
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
      .setEmoji(EMOJI.FORNECER),
  );

  return safeReply(interaction, {
    content: `**Saída #${saidaId}** — como te armas?\n\n🔫 **Arma Própria** — já tens arma contigo\n${EMOJI.FORNECER} **Pedir à Org** — a firma cede a arma do stock`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  }, { messageClass: 'FLOW' });
}

// ── STEP 2: source picker → abre StringSelect com armas ─────────────────
async function handleCaracterizadoSource(interaction) {
  if (isDuplicate(interaction.id)) return;

  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const source = parts[3]; // 'own' ou 'org'

  // Armas — usa categorias da DB directamente (armas_fogo, armas_brancas, armas).
  // Para "Pedir à Org" → só armas_fogo (armas curadas da firma).
  // Para "Arma Própria" → armas_fogo + armas_brancas + armas (catálogo completo).
  const items = await inventoryRepo.getItems(true);

  const orgCategories = new Set(['armas_fogo', 'armas']);
  const ownCategories = new Set(['armas_fogo', 'armas_brancas', 'armas']);
  const filterCats = source === 'org' ? orgCategories : ownCategories;

  let weapons = items.filter(i => filterCats.has(i.category));

  if (source === 'org') {
    for (const w of weapons) {
      w._balance = Number(await inventoryRepo.getStockForItem(w.id).catch(() => 0)) || 0;
    }
    // Org: ordenar por stock (em stock primeiro), depois nome
    weapons.sort((a, b) => (b._balance - a._balance) || a.name.localeCompare(b.name));
  } else {
    weapons.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (weapons.length === 0) {
    return safeReply(interaction, {
      content: `${EMOJI.WARN} Não há armas no catálogo. Contacta a chefia.`,
      flags: MessageFlags.Ephemeral,
    }, { messageClass: 'WARN' });
  }

  // Discord StringSelect: max 25 opções. Se passar, trunca.
  const options = weapons.slice(0, 25).map(w => {
    let label = w.name;
    if (source === 'org') {
      label = w._balance > 0 ? `${w.name} · stock ${w._balance}` : `${w.name} · sem stock`;
    }
    return new StringSelectMenuOptionBuilder()
      .setLabel(label.slice(0, 100))
      .setValue(String(w.id))
      .setEmoji(w.category === 'armas_brancas' ? '🔪' : '🔫');
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`saida::weapon_pick::${saidaId}::${source}`)
    .setPlaceholder(source === 'org' ? 'Escolhe a arma da org' : 'Escolhe a tua arma')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  return safeReply(interaction, {
    content: source === 'org'
      ? `**Saída #${saidaId}** — escolhe a arma que queres da org.`
      : `**Saída #${saidaId}** — diz qual é a tua arma.`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  }, { messageClass: 'FLOW' });
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
    await saidaEngine.addParticipant(saidaId, interaction.user.id, {
      participantType: 'caracterizado',
      ownWeapon: source === 'own',
      broughtOwn: source === 'own',
      receivedOrgMaterial: source === 'org',
      weaponItemId,
      notes: '',
    }, interaction.user.id, interaction.guild);

    const weaponName = item?.name || 'arma';
    const srcLabel = source === 'own' ? 'própria' : 'da org';
    await interaction.editReply({
      content: `${EMOJI.OK} Registado como **caracterizado** na saída #${saidaId} — arma ${srcLabel}: **${weaponName}**.`,
      components: [],
    });

    refreshSessionEmbed(interaction.client, saidaId).catch(() => {});
  } catch (e) {
    await interaction.editReply({
      content: `${EMOJI.ERRO} ${e.message}`,
      components: [],
    });
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
      return safeReply(interaction, {
        content: `${EMOJI.BLOQUEADO} Já estás inscrito como **${existing.participant_type}** na saída #${saidaId}. ` +
                 `Usa **"Cancelar Registo"** se queres mudar.`,
      }, { messageClass: 'WARN' });
    }
  }

  try {
    await saidaEngine.addParticipant(saidaId, interaction.user.id, {
      participantType: 'trabalhador',
      ownWeapon: false,
      broughtOwn: false,
      receivedOrgMaterial: false,
      notes: '',
    }, interaction.user.id, interaction.guild);

    await safeReply(interaction, {
      content: `${EMOJI.OK} Registado como **trabalhador** na saída #${saidaId}.`,
    }, { messageClass: 'BANAL' });

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
  handleCaracterizadoSource,
  handleCaracterizadoWeaponPick,
  handleSessionTrabalhador,
  handleSessionCancel,
};
