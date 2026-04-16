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

  // Lista de inscritos com status da arma + nome específico se escolheu
  const weaponIds = characterized.map(p => p.weapon_item_id).filter(Boolean);
  const weaponMap = new Map();
  if (weaponIds.length) {
    for (const wid of new Set(weaponIds)) {
      const it = await inventoryRepo.getItemById(wid).catch(() => null);
      if (it) weaponMap.set(wid, it.name);
    }
  }

  if (characterized.length) {
    lines.push('', `**── Caracterizados ──**`);
    for (const p of characterized) {
      const weaponName = p.weapon_item_id ? weaponMap.get(p.weapon_item_id) : null;
      const srcIcon = p.own_weapon ? '🔫' : (p.received_org_material ? '📦' : '⏳');
      const srcLabel = p.own_weapon ? 'própria' : (p.received_org_material ? 'org' : 'sem arma');
      const weaponFull = weaponName
        ? `${srcIcon} ${weaponName} (${srcLabel})`
        : `${srcIcon} ${srcLabel}`;
      const resultMark = p.individual_result_submitted ? ' ✅' : (isConcluded ? ' ⏳ resultado' : '');
      lines.push(`• <@${p.discord_id}> · ${weaponFull}${resultMark}`);
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

  // Armas da catálogo — filtrar categorias de armamento.
  const items = await inventoryRepo.getItems(true);
  const weaponCats = new Set(['armas_fogo', 'armas_brancas']);
  let weapons = items.filter(i => weaponCats.has(i.category));

  if (source === 'org') {
    // Só armas que a firma emite (lista curada em content/saidas.js).
    // Comparação case-insensitive + trim para tolerar diferenças leves
    // no naming do catálogo DB.
    const { SAIDAS: S } = require('../content');
    const allowed = new Set((S.ORG_ISSUED_WEAPONS || []).map(n => n.trim().toLowerCase()));
    weapons = weapons.filter(w => allowed.has((w.name || '').trim().toLowerCase()));

    for (const w of weapons) {
      w._balance = Number(await inventoryRepo.getStockForItem(w.id).catch(() => 0)) || 0;
    }
    // Ordena: stock > 0 primeiro, depois alfabético.
    weapons.sort((a, b) => (b._balance - a._balance) || a.name.localeCompare(b.name));
  }

  if (weapons.length === 0) {
    return safeReply(interaction, {
      content: `${EMOJI.WARN} Não há armas definidas no catálogo.`,
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
