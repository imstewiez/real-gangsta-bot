'use strict';
const {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} = require('discord.js');
const { safeReply, safeUpdate, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { successEmbed, brandEmbed } = require('../shared/embedBuilders');
const { buildCategorySelectMenu, buildItemSelectMenuForCategory } = require('../inventory/inventoryMenus');
const { isChefia, isOficial, canOpenSession } = require('../permissions/permissionEngine');
const { saidaRepo } = require('../repositories');
const saidaEngine = require('./saidaEngine');
const { publishSessionEmbed } = require('./saidaSession');
const {
  EMOJI,
  ERRORS,
  SUCCESS,
  SAIDAS,
  MODALS,
  VALID_RESULTS,
  RESULT_NAME,
  RESULT_EMOJI,
  RESULT_DESCRIPTION,
} = require('../content');
const { formatPtDate, formatPtDateOnly } = require('../shared/formatPtDate');
const { warn } = require('../logger');

// Context efémero por user durante fluxos multi-step.
// TTL de 15 minutos — limpa entradas abandonadas automaticamente.
const { createSessionStore } = require('../shared/sessionStore');
const pendingSaidaContext = createSessionStore('saida', { ttlMs: 15 * 60 * 1000 });

// Wrapper que adiciona timestamp ao guardar contexto
function _setContext(userId, ctx) {
  pendingSaidaContext.set(userId, ctx);
}

const SAIDA_TYPES = ['craft', 'dominio', 'ataque', 'defesa', 'recolha', 'outra'];
// VALID_RESULTS, RESULT_NAME, RESULT_EMOJI, RESULT_DESCRIPTION vêm do content.

const SAIDA_TYPE_EMOJI = { craft: '🛠️', dominio: '🏴', ataque: '⚔️', defesa: '🛡️', recolha: '📦', outra: '📋' };
const SAIDA_TYPE_LABEL = {
  craft: 'Craft',
  dominio: 'Domínio',
  ataque: 'Ataque',
  defesa: 'Defesa',
  recolha: 'Recolha',
  outra: 'Outra',
};

/**
 * Helper: monta opções ricas para selects de saídas abertas.
 * Mostra: tipo (emoji) + spot + data + participantes + líder
 */
function buildSaidaSelectOptions(saidas) {
  return saidas.slice(0, 25).map(s => {
    const emoji = SAIDA_TYPE_EMOJI[s.operation_type] || '📋';
    const typeLabel = SAIDA_TYPE_LABEL[s.operation_type] || s.operation_type;
    const date = formatPtDateOnly(s.date);
    const spot = s.spot ? ` · ${s.spot}` : '';
    const leader = s.leader_name ? ` · ${s.leader_name}` : '';
    return {
      label: `#${s.id} — ${typeLabel} (${date})`.slice(0, 100),
      description: `${s.status}${spot}${leader}`.slice(0, 100) || 'Sem detalhes',
      value: String(s.id),
      emoji,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CRIAR SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

async function handleCreateSaidaButton(interaction) {
  // Apenas OG para cima (OG, Kingpin, Manda-Chuva) pode abrir sessão.
  // Real Gangster vê o botão no painel Oficiais mas não pode abrir —
  // participa, não abre.
  if (!canOpenSession(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('abrir sessão de saída'),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }
  // Step 1: select tipo de saída (predefinido — zero erros humanos)
  const options = SAIDA_TYPES.map(t => ({
    label: {
      craft: 'Craft',
      dominio: 'Domínio',
      ataque: 'Ataque',
      defesa: 'Defesa',
      recolha: 'Recolha',
      outra: 'Outra',
    }[t],
    description: {
      craft: 'Produção no spot',
      dominio: 'Controlo de zona',
      ataque: 'Ataque ofensivo',
      defesa: 'Defesa de posição',
      recolha: 'Recolha de material',
      outra: 'Outro tipo',
    }[t],
    value: t,
    emoji: { craft: '🛠️', dominio: '🏴', ataque: '⚔️', defesa: '🛡️', recolha: '📦', outra: '📋' }[t],
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::select_create_type')
      .setPlaceholder(SAIDAS.SELECTS.TIPO_SAIDA)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );
  await safeReply(interaction, {
    content: `${EMOJI.SAIDA} Que tipo de saída vais criar?`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

// Step 2: tipo seleccionado → dropdown de spots (em vez de ir já ao modal).
async function handleCreateTypeSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaType = interaction.values[0];
  _setContext(interaction.user.id, { saidaType });

  const spotOpts = SAIDAS.SPOTS.slice(0, 25).map(s => ({
    label: s.label,
    value: s.value,
    emoji: s.emoji,
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::select_create_spot')
      .setPlaceholder('Qual é o spot?')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(spotOpts)
  );

  return safeUpdate(interaction, {
    content: `${EMOJI.SAIDA} Escolhe o spot da saída:`,
    components: [row],
  });
}

// Step 3: spot seleccionado → abre modal final com data/hora/notas
// (data e hora pré-preenchidas com o momento actual — Europe/Lisbon).
async function handleCreateSpotSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const spotKey = interaction.values[0];
  const ctx = pendingSaidaContext.get(interaction.user.id) || {};
  ctx.spotKey = spotKey;
  _setContext(interaction.user.id, ctx);

  const now = new Date();
  const fmtDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(now);
  const fmtTime = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const F = MODALS.SAIDA_CREATE.FIELDS;
  const modal = new ModalBuilder()
    .setCustomId('saida::modal_create')
    .setTitle(MODALS.SAIDA_CREATE.TITLE)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('date')
          .setLabel(F.date.label)
          .setStyle(TextInputStyle.Short)
          .setValue(fmtDate)
          .setPlaceholder(fmtDate)
          .setRequired(F.date.required)
          .setMaxLength(F.date.maxLength)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('time')
          .setLabel(F.time.label)
          .setStyle(TextInputStyle.Short)
          .setValue(fmtTime)
          .setPlaceholder(fmtTime)
          .setRequired(false)
          .setMaxLength(F.time.maxLength)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel(F.notes.label)
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(F.notes.placeholder)
          .setRequired(F.notes.required)
          .setMaxLength(F.notes.maxLength)
      )
    );
  await safeShowModal(interaction, modal);
}

async function handleCreateSaidaModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const date = getModalField(interaction, 'date');
  const time = getModalField(interaction, 'time');
  const notes = getModalField(interaction, 'notes');
  // Tipo + spot vêm dos selects (steps anteriores), não do modal.
  const ctx = pendingSaidaContext.get(interaction.user.id) || {};
  const type = ctx.saidaType || 'outra';
  const spotKey = ctx.spotKey || '';
  const spotEntry = SAIDAS.SPOTS.find(s => s.value === spotKey);
  const spot = spotEntry ? spotEntry.label : '';
  pendingSaidaContext.delete(interaction.user.id);
  if (!SAIDA_TYPES.includes(type)) {
    return safeReply(interaction, { content: `${EMOJI.WARN} Tipo inválido.` }, { dismissible: true });
  }
  try {
    const s = await saidaEngine.createSaida({
      date,
      scheduledTime: time || null,
      spot,
      saidaType: type,
      leaderDiscordId: null,
      groupNumber: 1,
      maxParticipants: 12,
      notes,
      createdBy: interaction.user.id,
    });
    const { SAIDA_TYPE } = require('../content');
    // Data no formato canónico dd/mm/yyyy; só adiciona hora se não for 00:00.
    const dateDisplay = formatPtDateOnly(date);
    const timeDisplay = time && time !== '00:00' ? ` · ${time}` : '';
    const embed = brandEmbed('MOVEMENT')
      .setTitle(`${EMOJI.SAIDA} Saída #${s.id} aberta`)
      .addFields(
        { name: 'Tipo', value: `**${SAIDA_TYPE[type] || type}**`, inline: true },
        { name: 'Data', value: `**${dateDisplay}**${timeDisplay}`, inline: true },
        { name: 'Spot', value: spot ? `**${spot}**` : '—', inline: true }
      );
    if (notes) embed.addFields({ name: 'Notas', value: notes, inline: false });

    // Publicar embed de sessão interactivo com botões de registo
    const sessionMsg = await publishSessionEmbed(interaction.client, s.id);
    if (sessionMsg) {
      embed.addFields({
        name: '→ sessão aberta',
        value: `Sessão publicada em <#${sessionMsg.channelId}>. Os membros podem registar-se directamente.`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '→ próximo passo',
        value:
          'Adiciona **participantes** manualmente. Define `SAIDA_SESSION_CHANNEL_ID` para activar registo interactivo.',
        inline: false,
      });
    }
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FECHAR SAÍDA — modal rico (resultado, facção, craft/dominio, kills totais)
// ═══════════════════════════════════════════════════════════════════════════

async function handleCloseSaidaButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('fechar saídas'), flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }
  const open = await saidaRepo.findOpen();
  if (!open.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Sem saídas abertas.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }
  const options = buildSaidaSelectOptions(open);
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::select_close')
      .setPlaceholder(SAIDAS.SELECTS.QUAL_SAIDA_FECHAR)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );
  await safeReply(interaction, {
    content: `${EMOJI.FECHAR} Escolhe a saída a fechar:`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Fechar directo a partir do session embed — salta a selecção de saída
 * (já estamos nela) e vai logo para o select de resultado.
 */
async function handleCloseSessionDirect(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('fechar saídas'), flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }

  const saidaId = parseInt(interaction.customId.split('::')[2], 10);
  const saida = await saidaRepo.findById(saidaId);
  if (!saida || !['aberta', 'em_preparacao', 'em_curso'].includes(saida.status)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Saída #${saidaId} já não está aberta (estado: ${saida?.status || 'não encontrada'}).`,
        flags: MessageFlags.Ephemeral,
      },
      { dismissible: true }
    );
  }

  // Vai directo para o select de resultado
  _setContext(interaction.user.id, { saidaId });
  const resultOptions = VALID_RESULTS.map(r => ({
    label: RESULT_NAME[r],
    description: RESULT_DESCRIPTION[r],
    value: r,
    emoji: RESULT_EMOJI[r],
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::select_close_result')
      .setPlaceholder(SAIDAS.SELECTS.RESULTADO_SAIDA)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(resultOptions)
  );
  // TTL 30s — se user não pica em 30s, dropdown auto-desaparece.
  // Quando user pica, handleCloseResultSelect tenta deletar explicitamente
  // (mais imediato); este é só fallback.
  return safeReply(
    interaction,
    {
      content: `${EMOJI.FECHAR} Saída **#${saidaId}** — qual foi o resultado?`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'BANAL', ttlMs: 30_000 }
  );
}

async function handleCloseSaidaSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.values[0]);
  _setContext(interaction.user.id, { saidaId });

  // Step 2: resultado predefinido (select, não texto livre)
  const resultOptions = VALID_RESULTS.map(r => ({
    label: RESULT_NAME[r],
    description: RESULT_DESCRIPTION[r],
    value: r,
    emoji: RESULT_EMOJI[r],
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::select_close_result')
      .setPlaceholder(SAIDAS.SELECTS.RESULTADO_SAIDA)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(resultOptions)
  );
  return safeUpdate(interaction, {
    content: `${EMOJI.FECHAR} Saída **#${saidaId}** — qual foi o resultado?`,
    components: [row],
  });
}

// Step 3: resultado seleccionado → abre modal com detalhes (contra quem
// em texto livre, craft, notas). Sem dropdown de facção — user pediu
// "por escrita" para ser mais directo.
async function handleCloseResultSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const result = interaction.values[0];
  const ctx = pendingSaidaContext.get(interaction.user.id) || {};
  ctx.result = result;
  _setContext(interaction.user.id, ctx);

  const saidaId = ctx.saidaId;
  const resultLabel = RESULT_NAME[result] || result;
  const SF = MODALS.SAIDA_SETTLE.FIELDS;
  const needsEnemy = result === 'vitoria' || result === 'derrota' || result === 'empate';

  const fields = [];
  if (needsEnemy) {
    fields.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('enemy')
          .setLabel('Contra quem?')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(80)
          .setPlaceholder('Ex: Los Vagos, Ballas, Polícia...')
      )
    );
  }
  fields.push(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('craft_amount')
        .setLabel(SF.crafted.label)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(12)
        .setPlaceholder(SF.crafted.placeholder)
        .setValue('0')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('result_notes')
        .setLabel(SF.notes.label)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)
        .setPlaceholder(SF.notes.placeholder)
    )
  );

  const modal = new ModalBuilder()
    .setCustomId('saida::modal_close')
    .setTitle(`${EMOJI.FECHAR} Fechar #${saidaId} — ${resultLabel}`.slice(0, 45))
    .addComponents(...fields);
  await safeShowModal(interaction, modal);

  // Discord API não permite update + showModal na mesma interaction. Depois
  // de showModal, tenta deletar o ephemeral do dropdown (source message) para
  // não ficar pendurado. Se falhar (common em ephemerals), o TTL de 30s em
  // handleCloseSessionDirect limpa eventualmente.
  if (interaction.message) {
    setImmediate(() => {
      interaction.message.delete().catch(() => {});
    });
  }
}

async function handleCloseSaidaModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx)
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Sessão expirada — começa de novo.` },
      { dismissible: true }
    );

  // Resultado vem do select (step 2). Inimigo é texto livre (step 3 modal).
  const result = ctx.result || 'sem_conflito';
  const enemyRaw = getModalField(interaction, 'enemy') || '';
  const enemy_name = enemyRaw.trim();
  const enemy_faction = enemy_name;

  const craft_amount = Math.max(0, Math.min(parseInt(getModalField(interaction, 'craft_amount')) || 0, 999999));
  const result_notes = getModalField(interaction, 'result_notes') || '';
  const had_craft = craft_amount > 0;
  const had_fight = result === 'vitoria' || result === 'derrota';

  let closedData;
  try {
    // Transita para em_liquidacao — participantes preenchem resultados depois.
    closedData = await saidaEngine.closeSaida(
      ctx.saidaId,
      {
        result,
        had_fight,
        had_craft,
        enemy_name,
        enemy_faction,
        craft_amount,
        result_notes,
      },
      interaction.user.id
    );
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }

  pendingSaidaContext.delete(interaction.user.id);

  // Refresh session embed para mostrar estado de liquidação + botões
  const saidaSession = require('./saidaSession');
  saidaSession.refreshSessionEmbed(interaction.client, ctx.saidaId).catch(() => {});

  const resultLabel = RESULT_NAME[result] || result;

  // Phase 8b: DM cada participante automaticamente com botão para preencher
  // o resultado. Substitui o antigo ping público (removido em phase 4) por
  // notificações privadas — zero spam no canal, cada um recebe na sua DM.
  // Se DMs estiverem desligadas, fallback: painel vivo tem botão também.
  const saidaIndividual = require('./saidaIndividualResult');
  saidaIndividual.dmParticipantsForResults(interaction.client, ctx.saidaId, resultLabel).catch(e => {
    warn(`[CLOSE] dmParticipantsForResults falhou (non-fatal): ${e.message}`);
  });
  return safeReply(
    interaction,
    {
      content: `${EMOJI.OK} **Saída #${ctx.saidaId}** em liquidação — resultado: **${resultLabel}**${enemy_name ? ` contra **${enemy_name}**` : ''}.\n\n${EMOJI.PENDENTE} Os participantes foram notificados para preencherem o resultado individual.\nQuando todos preencherem (ou quando quiseres forçar), usa **"Finalizar e Publicar"** no painel da sessão.`,
    },
    { dismissible: true }
  );
}

/**
 * Handler do botão "Finalizar e Publicar" — transita de em_liquidacao → concluida.
 * Corre scoring com dados reais, actualiza stats, publica resultados.
 */
async function handleFinalizeSaidaButton(interaction) {
  if (isDuplicate(interaction.id)) return;

  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('finalizar saídas'), flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2], 10);

  // Verificar estado
  const saida = await saidaRepo.findById(saidaId);
  if (!saida || saida.status !== 'em_liquidacao') {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Saída #${saidaId} não está em liquidação (estado: ${saida?.status || 'não encontrada'}).`,
      },
      { dismissible: true }
    );
  }

  // Mostrar progresso antes de finalizar
  const progress = await saidaEngine.getResultProgress(saidaId);

  try {
    // Auto-preencher participantes que não submeteram resultado como "sobreviveu, 0 kills"
    if (progress.pending > 0) {
      const { query: dbQuery } = require('../db');
      await dbQuery(
        `
        UPDATE operation_participants
           SET individual_result_submitted = TRUE,
               individual_result_at = NOW(),
               survived = CASE WHEN died = TRUE THEN FALSE ELSE TRUE END,
               weapon_return_status = CASE
                 WHEN own_weapon = TRUE THEN 'not_applicable'
                 WHEN received_org_material = FALSE THEN 'not_applicable'
                 WHEN died = TRUE THEN 'confirmed_not_returned'
                 ELSE 'not_applicable'
               END
         WHERE operation_id = $1 AND individual_result_submitted = FALSE
      `,
        [saidaId]
      );
    }

    const result = await saidaEngine.finalizeSaida(saidaId, interaction.user.id);

    // Refresh session embed (mostra concluída)
    const saidaSession = require('./saidaSession');
    saidaSession.refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

    const { SAIDAS: S } = require('../content');
    const mvp = result?.participants?.find(p => p.mvp_flag);
    const mvpLine = mvp
      ? `\n${EMOJI.MVP} MVP: **${mvp.display_name || 'Participante'}** (${mvp.kills || 0} kills, peso ${Math.round(mvp.performance_score || 0)})`
      : '';
    const v = result?.values || {};
    const profitLabel = v.was_profitable ? `${EMOJI.LUCRO} Lucro` : `${EMOJI.WARN} Prejuízo`;

    let pendingNote = '';
    if (progress.pending > 0) {
      pendingNote = `\n\n${EMOJI.INFO} _${progress.pending} participante(s) não preencheram resultado — auto-liquidados como vivos, 0 kills._`;
    }

    return safeReply(
      interaction,
      {
        content:
          S.LIQUIDACAO.FINALIZED(
            saidaId,
            result?.totalKills || 0,
            result?.totalDeaths || 0,
            result?.totalSurvivors || 0
          ) +
          mvpLine +
          `\n${profitLabel}: **${(v.net || 0).toLocaleString('pt-PT')} €**` +
          pendingNote,
      },
      { dismissible: true }
    );
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MARCAR MORTOS
// ═══════════════════════════════════════════════════════════════════════════

async function handleMarkDeadSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});
  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  const deadIds = interaction.values || [];
  if (!deadIds.length) {
    pendingSaidaContext.delete(interaction.user.id);
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Saída #${saidaId} — nenhum morto marcado.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }
  const report = [];
  for (const discordId of deadIds) {
    try {
      const { query } = require('../db');
      const res = await query(
        `SELECT om.item_id, om.quantity
           FROM operation_materials om
           JOIN members m ON m.id = om.member_id
          WHERE om.operation_id = $1 AND om.direction = 'fornecido' AND m.discord_id = $2`,
        [saidaId, discordId]
      );
      const diedWithItems = res.rows.map(r => ({ itemId: r.item_id, qty: r.quantity }));
      await saidaEngine.settleParticipantCustody(
        saidaId,
        discordId,
        {
          diedWithItems,
          died: true,
          survived: false,
          returned: false,
        },
        interaction.user.id,
        interaction.guild
      );
      report.push(
        `${EMOJI.MORTE} <@${discordId}> — ${diedWithItems.length ? `${diedWithItems.length} item(s) → perda` : 'sem material'}`
      );
    } catch (e) {
      report.push(`${EMOJI.ERRO} <@${discordId}> — ${e.message}`);
    }
  }
  pendingSaidaContext.delete(interaction.user.id);
  const lines = [`Saída **#${saidaId}** — custódia liquidada:`, ...report];
  return safeReply(
    interaction,
    { content: lines.join('\n').slice(0, 1900), flags: MessageFlags.Ephemeral },
    { dismissible: true }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VER SAÍDAS
// ═══════════════════════════════════════════════════════════════════════════

async function handleViewSaidasButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const list = await saidaRepo.findRecent(10);
  if (!list.length)
    return safeReply(interaction, { content: `${EMOJI.INFO} Sem saídas registadas.` }, { dismissible: true });
  const statusEmoji = {
    aberta: '🟢',
    em_preparacao: '🟡',
    em_curso: '🟠',
    em_liquidacao: '🔶',
    concluida: EMOJI.OK,
    cancelada: EMOJI.ERRO,
  };
  const resultEmoji = {
    vitoria: EMOJI.VITORIA,
    derrota: EMOJI.DERROTA,
    empate: EMOJI.EMPATE,
    sem_conflito: EMOJI.INFO,
    abortada: EMOJI.WARN,
  };
  const lines = list.map(s => {
    const em = statusEmoji[s.status] || '⬜';
    const re = ['concluida', 'em_liquidacao'].includes(s.status) && s.result ? ` ${resultEmoji[s.result] || ''}` : '';
    // Data no formato dd/mm/yyyy. Se houver hora marcada, inclui.
    let when = formatPtDateOnly(s.date);
    if (s.scheduled_time) {
      const t = String(s.scheduled_time).slice(0, 5);
      if (t && t !== '00:00') when += ` · ${t}`;
    }
    return `${em}${re} **#${s.id}** — ${s.operation_type} · ${when} · ${s.spot || '—'} · Líder: ${s.leader_name || '—'}`;
  });
  const embed = brandEmbed('MOVEMENT').setTitle(`${EMOJI.SAIDA} Saídas recentes`).setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTICIPANTES
// ═══════════════════════════════════════════════════════════════════════════

async function handleAddParticipantButton(interaction) {
  if (!isChefia(interaction.member) && !isOficial(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('mexer em participantes'), flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }
  const open = await saidaRepo.findOpen();
  if (!open.length)
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Sem saídas abertas.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  const options = buildSaidaSelectOptions(open);
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::select_add_participant')
      .setPlaceholder(SAIDAS.SELECTS.QUAL_SAIDA_PARTICIPANTE)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );
  await safeReply(interaction, {
    content: `${EMOJI.PARTICIPANTE} Em que saída entram os nomes?`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleAddParticipantSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.values[0]);
  _setContext(interaction.user.id, { saidaId, action: 'add_participant' });
  const userMenu = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`saida::user_select_participants::${saidaId}`)
      .setPlaceholder('Escolhe até 25 nomes')
      .setMinValues(1)
      .setMaxValues(25)
  );
  await safeUpdate(interaction, {
    content: SAIDAS.PROMPTS.ESCOLHE_PARTICIPANTE(saidaId),
    components: [userMenu],
  });
}

async function handleParticipantUsersSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});
  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  if (!saidaId)
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Saída inválida.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  const userIds = interaction.values || [];
  if (!userIds.length)
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Nenhum nome escolhido.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );

  const added = [],
    errors = [];
  for (const uid of userIds) {
    try {
      await saidaEngine.addParticipant(saidaId, uid, { roleInSaida: 'membro' }, interaction.user.id, interaction.guild);
      added.push(uid);
    } catch (e) {
      errors.push(`<@${uid}> — ${e.message}`);
    }
  }
  pendingSaidaContext.delete(interaction.user.id);
  const lines = [];
  if (added.length) {
    lines.push(`**${added.length}** no movimento da Saída **#${saidaId}**:`, added.map(u => `<@${u}>`).join(', '));
  }
  if (errors.length) {
    lines.push('', '**Falhas:**', ...errors);
  }
  return safeReply(
    interaction,
    { embeds: [successEmbed('Nomes no movimento', lines.join('\n'))], flags: MessageFlags.Ephemeral },
    { dismissible: true }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MATERIAL DA SAÍDA (aggregate: fornecido/devolvido/perdido/consumido)
// ═══════════════════════════════════════════════════════════════════════════

async function handleRegisterMaterialButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('mexer no material das saídas'), flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }
  const open = await saidaRepo.findOpen();
  if (!open.length)
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Sem saídas abertas.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  const options = buildSaidaSelectOptions(open);
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::select_material_op')
      .setPlaceholder(SAIDAS.SELECTS.QUAL_SAIDA_MATERIAL)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );
  await safeReply(interaction, {
    content: `${EMOJI.MATERIAL} Material em que saída?`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleMaterialOpSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.values[0]);
  _setContext(interaction.user.id, { saidaId, action: 'material_op' });
  const directionOptions = [
    { label: 'Fornecido', description: 'Material que saiu da firma → participante', value: 'fornecido', emoji: '📤' },
    { label: 'Devolvido', description: 'Material que voltou à casa', value: 'devolvido', emoji: '↩️' },
    { label: 'Perdido', description: 'Material perdido na rua', value: 'perdido', emoji: '💀' },
    { label: 'Consumido', description: 'Material gasto durante a saída', value: 'consumido', emoji: '🔥' },
  ];
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::select_material_direction')
      .setPlaceholder(SAIDAS.SELECTS.DIRECAO_MATERIAL)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(directionOptions)
  );
  await safeUpdate(interaction, {
    content: SAIDAS.PROMPTS.TIPO_MOVIMENTO(saidaId),
    components: [row],
  });
}

async function handleMaterialDirectionSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const direction = interaction.values[0];
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Sessão expirada — começa de novo.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }
  ctx.direction = direction;
  _setContext(interaction.user.id, ctx);
  const menu = await buildCategorySelectMenu('saida::cat_material', 'Seleciona a categoria');
  await safeUpdate(interaction, {
    content: SAIDAS.PROMPTS.DIRECCAO_MATERIAL(direction),
    components: [menu],
  });
}

// Step intermediário: categoria seleccionada → mostrar itens dessa categoria
async function handleMaterialCategorySelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const category = interaction.values[0];
  if (category === 'none') return;
  const customId = interaction.customId;
  const itemPrefix = customId.includes('cat_issue') ? 'saida::issue_select_item' : 'saida::select_material_item';
  const menu = await buildItemSelectMenuForCategory(itemPrefix, 'Seleciona o item', category);
  await safeUpdate(interaction, {
    content: SAIDAS.PROMPTS.ESCOLHE_CATEGORIA_MATERIAL.replace('{category}', category),
    components: [menu],
  });
}

async function handleMaterialItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Sessão expirada.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }
  ctx.itemId = itemId;
  _setContext(interaction.user.id, ctx);
  const { inventoryRepo } = require('../repositories');
  const item = await inventoryRepo.getItemById(itemId);
  const MF = MODALS.SAIDA_MATERIAL.FIELDS;
  const modal = new ModalBuilder()
    .setCustomId('saida::modal_material_qty')
    .setTitle(`${ctx.direction} — ${item?.name || 'Item'}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(MF.qty.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(MF.qty.required)
          .setMaxLength(MF.qty.maxLength)
          .setPlaceholder(MF.qty.placeholder)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel(MF.notes.label)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(MF.notes.required)
          .setMaxLength(MF.notes.maxLength)
      )
    );
  await safeShowModal(interaction, modal);
}

async function handleMaterialQtyModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return safeReply(interaction, { content: `${EMOJI.PENDENTE} Sessão expirada.` }, { dismissible: true });
  }
  const quantity = parseInt(getModalField(interaction, 'quantity'));
  const notes = getModalField(interaction, 'notes');
  if (isNaN(quantity) || quantity <= 0)
    return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { dismissible: true });
  try {
    await saidaEngine.registerSaidaMaterial(
      ctx.saidaId,
      ctx.itemId,
      ctx.direction,
      quantity,
      null,
      notes,
      interaction.user.id
    );
    pendingSaidaContext.delete(interaction.user.id);
    const { inventoryRepo } = require('../repositories');
    const item = await inventoryRepo.getItemById(ctx.itemId);
    const dirLabels = { fornecido: 'Fornecido', devolvido: 'Devolvido', perdido: 'Perdido', consumido: 'Consumido' };
    const embed = successEmbed(
      'Material registado',
      `**${quantity}×** ${item?.name || 'Item'} — ${dirLabels[ctx.direction]}\nSaída **#${ctx.saidaId}**${notes ? `\nNotas: ${notes}` : ''}`
    );
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FORNECER A PARTICIPANTE (custódia nominal)
// ═══════════════════════════════════════════════════════════════════════════

async function handleIssueToParticipantButton(interaction) {
  if (!isChefia(interaction.member) && !isOficial(interaction.member)) {
    return safeReply(
      interaction,
      { content: ERRORS.NO_PERMISSION('fornecer material'), flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  }
  const open = await saidaRepo.findOpen();
  if (!open.length)
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Sem saídas abertas.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  const options = buildSaidaSelectOptions(open);
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::issue_select_saida')
      .setPlaceholder(SAIDAS.SELECTS.QUAL_SAIDA_MATERIAL)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );
  await safeReply(interaction, {
    content: `${EMOJI.FORNECER} Fornecer material nominal — qual saída?`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleIssueSaidaSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.values[0]);
  _setContext(interaction.user.id, { saidaId, action: 'issue_to_participant' });
  const participants = await saidaRepo.getParticipants(saidaId);
  if (!participants.length) {
    pendingSaidaContext.delete(interaction.user.id);
    return safeUpdate(interaction, {
      content: `${EMOJI.WARN} Saída **#${saidaId}** sem nomes. Adiciona primeiro em "Participantes".`,
      components: [],
    });
  }
  const options = participants.slice(0, 25).map(p => {
    const typeTag = p.participant_type === 'trabalhador' ? '🛠️ Trabalhador' : '🏴 Caracterizado';
    const weapon = p.own_weapon ? ' · arma própria' : '';
    return {
      label: `${p.display_name || p.discord_id}`.slice(0, 100),
      description: `${typeTag}${weapon}`.slice(0, 100),
      value: p.discord_id,
      emoji: p.participant_type === 'trabalhador' ? '🛠️' : '🏴',
    };
  });
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::issue_select_participant')
      .setPlaceholder('Para quem vai o material?')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );
  await safeUpdate(interaction, { content: `${EMOJI.FORNECER} Saída **#${saidaId}** — para quem?`, components: [row] });
}

async function handleIssueParticipantSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const discordId = interaction.values[0];
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant')
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Sessão expirada.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  ctx.participantDiscordId = discordId;
  _setContext(interaction.user.id, ctx);
  const menu = await buildCategorySelectMenu('saida::cat_issue', 'Seleciona a categoria');
  await safeUpdate(interaction, {
    content: SAIDAS.PROMPTS.PARTICIPANT_CATEGORY(ctx.saidaId, discordId),
    components: [menu],
  });
}

async function handleIssueItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant')
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Sessão expirada.`, flags: MessageFlags.Ephemeral },
      { dismissible: true }
    );
  ctx.itemId = itemId;
  _setContext(interaction.user.id, ctx);
  const { inventoryRepo } = require('../repositories');
  const item = await inventoryRepo.getItemById(itemId);
  const IF = MODALS.SAIDA_MATERIAL.FIELDS;
  const modal = new ModalBuilder()
    .setCustomId('saida::issue_modal_qty')
    .setTitle(`${EMOJI.FORNECER} Fornecer — ${item?.name || 'Item'}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(IF.qty.label)
          .setStyle(TextInputStyle.Short)
          .setRequired(IF.qty.required)
          .setMaxLength(IF.qty.maxLength)
          .setPlaceholder(IF.qty.placeholder)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notes')
          .setLabel(IF.notes.label)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(IF.notes.required)
          .setMaxLength(IF.notes.maxLength)
      )
    );
  await safeShowModal(interaction, modal);
}

async function handleIssueQtyModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant')
    return safeReply(interaction, { content: `${EMOJI.PENDENTE} Sessão expirada.` }, { dismissible: true });
  const qty = parseInt(getModalField(interaction, 'quantity'));
  const notes = getModalField(interaction, 'notes');
  if (isNaN(qty) || qty <= 0)
    return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { dismissible: true });
  try {
    await saidaEngine.issueMaterialToParticipant(
      ctx.saidaId,
      ctx.participantDiscordId,
      ctx.itemId,
      qty,
      interaction.user.id,
      notes,
      interaction.guild
    );
    pendingSaidaContext.delete(interaction.user.id);
    const { inventoryRepo } = require('../repositories');
    const item = await inventoryRepo.getItemById(ctx.itemId);
    const embed = successEmbed(
      'Material fornecido',
      `${EMOJI.FORNECER} **${qty}×** ${item?.name || 'Item'} → <@${ctx.participantDiscordId}>\nSaída **#${ctx.saidaId}**${notes ? `\nNotas: ${notes}` : ''}`
    );
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }
}

module.exports = {
  handleCreateSaidaButton,
  handleCreateTypeSelect,
  handleCreateSpotSelect,
  handleCreateSaidaModal,
  handleCloseSaidaButton,
  handleCloseSessionDirect,
  handleCloseSaidaSelect,
  handleCloseResultSelect,
  handleCloseSaidaModal,
  handleFinalizeSaidaButton,
  handleMarkDeadSelect,
  handleViewSaidasButton,
  handleAddParticipantButton,
  handleAddParticipantSelect,
  handleParticipantUsersSelect,
  handleRegisterMaterialButton,
  handleMaterialOpSelect,
  handleMaterialDirectionSelect,
  handleMaterialCategorySelect,
  handleMaterialItemSelect,
  handleMaterialQtyModal,
  handleIssueToParticipantButton,
  handleIssueSaidaSelect,
  handleIssueParticipantSelect,
  handleIssueItemSelect,
  handleIssueQtyModal,
  pendingSaidaContext,
};
