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
const { replySafe } = require('../shared/safeEmbed');
const { fmtSaidaStatus, fmtSaidaType, fmtParticipantType } = require('../shared/labels');
const { buildSearchableSelect } = require('../shared/selectSearch');
const { successEmbed, brandEmbed } = require('../shared/embedBuilders');
const { buildCategorySelectMenu, buildItemSelectMenuForCategory } = require('../inventory/inventoryMenus');
const { isChefia, isOficial, canOpenSession } = require('../permissions/permissionEngine');
const { requirePermission } = require('../shared/requirePermission');
const { saidaRepo } = require('../repositories');
const saidaEngine = require('./saidaEngine');
const { publishSessionEmbed } = require('./saidaSession');
const {
  EMOJI,
  ERRORS,
  SAIDAS,
  MODALS,
  VALID_RESULTS,
  RESULT_NAME,
  RESULT_EMOJI,
  RESULT_DESCRIPTION,
} = require('../content');
const { formatPtDateOnly } = require('../shared/formatPtDate');
const { warn } = require('../logger');

// Context ef├®mero por user durante fluxos multi-step.
// TTL de 15 minutos ÔÇö limpa entradas abandonadas automaticamente.
const { createSessionStore } = require('../shared/sessionStore');
const pendingSaidaContext = createSessionStore('saida', { ttlMs: 15 * 60 * 1000 });
const parentStore = require('../shared/parentInteractionStore');

// Wrapper que adiciona timestamp ao guardar contexto
function _setContext(userId, ctx) {
  pendingSaidaContext.set(userId, ctx);
}

const SAIDA_TYPES = ['craft', 'dominio', 'ataque', 'defesa', 'recolha', 'outra'];
// VALID_RESULTS, RESULT_NAME, RESULT_EMOJI, RESULT_DESCRIPTION v├¬m do content.

const SAIDA_TYPE_EMOJI = {
  craft: EMOJI.CRAFT,
  dominio: EMOJI.SAIDA,
  ataque: EMOJI.COMBATE,
  defesa: EMOJI.DEFESA,
  recolha: EMOJI.MATERIAL,
  outra: EMOJI.ENCOMENDA,
};
const SAIDA_TYPE_LABEL = {
  craft: 'Craft',
  dominio: 'Dom├¡nio',
  ataque: 'Ataque',
  defesa: 'Defesa',
  recolha: 'Recolha',
  outra: 'Outra',
};

/**
 * Helper: monta op├º├Áes ricas para selects de sa├¡das abertas.
 * Mostra: tipo (emoji) + spot + data + participantes + l├¡der
 */
function buildSaidaSelectOptions(saidas) {
  return saidas.slice(0, 25).map(s => {
    const emoji = SAIDA_TYPE_EMOJI[s.operation_type] || EMOJI.ENCOMENDA;
    const typeLabel = SAIDA_TYPE_LABEL[s.operation_type] || s.operation_type;
    const date = formatPtDateOnly(s.date);
    const spot = s.spot ? ` ┬À ${s.spot}` : '';
    const leader = s.leader_name ? ` ┬À ${s.leader_name}` : '';
    return {
      label: `#${s.id} ÔÇö ${typeLabel} (${date})`.slice(0, 100),
      description: `${fmtSaidaStatus(s.status)}${spot}${leader}`.slice(0, 100) || 'Sem detalhes',
      value: String(s.id),
      emoji,
    };
  });
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// CRIAR SA├ìDA
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

async function handleCreateSaidaButton(interaction) {
  // Apenas OG para cima (OG, Kingpin, Manda-Chuva) pode abrir sess├úo.
  // Real Gangster v├¬ o bot├úo no painel Oficiais mas n├úo pode abrir ÔÇö
  // participa, n├úo abre.
  if (!canOpenSession(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('abrir sess├úo de sa├¡da'),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
    );
  }
  // Step 1: select tipo de sa├¡da ÔÇö UI simplificada para 2 op├º├Áes por
  // feedback: "Farm" (agrega recolha) e "Craft/Venda" (produ├º├úo + venda).
  // Em DB continua a armazenar operation_type IN (craft, dominio, ataque,
  // defesa, recolha, outra) ÔÇö farmÔåÆrecolha, craft_vendaÔåÆcraft. Enum DB
  // preservado para retrocompat.
  const options = [
    {
      label: 'Farm',
      description: 'Recolha de material no spot',
      value: 'recolha',
      emoji: EMOJI.MATERIAL,
    },
    {
      label: 'Craft / Venda',
      description: 'Produ├º├úo ou venda no spot',
      value: 'craft',
      emoji: EMOJI.CRAFT,
    },
  ];
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('saida::select_create_type')
      .setPlaceholder(SAIDAS.SELECTS.TIPO_SAIDA)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options)
  );
  await safeReply(
    interaction,
    {
      content: `${EMOJI.SAIDA} Que tipo de sa├¡da vais criar?`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'BANAL', ttlMs: 30_000 }
  );
  parentStore.setParent(interaction.user.id, interaction);
}

// Step 2: tipo seleccionado ÔåÆ dropdown de spots (em vez de ir j├í ao modal).
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
      .setPlaceholder('Qual ├® o spot?')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(spotOpts)
  );

  // TTL 30s ÔÇö se user n├úo pica o spot em 30s, dropdown auto-desaparece.
  // handleCreateSpotSelect tamb├®m tenta delete imediato ap├│s showModal.
  return safeUpdate(
    interaction,
    {
      content: `${EMOJI.SAIDA} Escolhe o spot da sa├¡da:`,
      components: [row],
    },
    { messageClass: 'BANAL', ttlMs: 30_000 }
  );
}

// Step 3: spot seleccionado ÔåÆ abre modal final com data/hora/notas
// (data e hora pr├®-preenchidas com o momento actual ÔÇö Europe/Lisbon).
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
  // Fecha o ephemeral do dropdown (spot select) antes do modal abrir ÔÇö
  // via parent.deleteReply(), o ├║nico m├®todo que funciona para ephemerals.
  parentStore.deleteParentEphemeral(interaction.user.id).catch(() => {});
  await safeShowModal(interaction, modal);
}

async function handleCreateSaidaModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const date = getModalField(interaction, 'date');
  const time = getModalField(interaction, 'time');
  const notes = getModalField(interaction, 'notes');
  // Tipo + spot v├¬m dos selects (steps anteriores), n├úo do modal.
  const ctx = pendingSaidaContext.get(interaction.user.id) || {};
  const type = ctx.saidaType || 'outra';
  const spotKey = ctx.spotKey || '';
  const spotEntry = SAIDAS.SPOTS.find(s => s.value === spotKey);
  const spot = spotEntry ? spotEntry.label : '';
  pendingSaidaContext.delete(interaction.user.id);
  if (!SAIDA_TYPES.includes(type)) {
    return safeReply(interaction, { content: `${EMOJI.WARN} Tipo inv├ílido.` }, { messageClass: 'BANAL' });
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
    // Data no formato can├│nico dd/mm/yyyy; s├│ adiciona hora se n├úo for 00:00.
    const dateDisplay = formatPtDateOnly(date);
    const timeDisplay = time && time !== '00:00' ? ` ┬À ${time}` : '';
    const embed = brandEmbed('MOVEMENT')
      .setTitle(`${EMOJI.SAIDA} Sa├¡da #${s.id} aberta`)
      .addFields(
        { name: 'Tipo', value: `**${SAIDA_TYPE[type] || type}**`, inline: true },
        { name: 'Data', value: `**${dateDisplay}**${timeDisplay}`, inline: true },
        { name: 'Spot', value: spot ? `**${spot}**` : 'ÔÇö', inline: true }
      );
    if (notes) embed.addFields({ name: 'Notas', value: notes, inline: false });

    // Publicar embed de sess├úo interactivo com bot├Áes de registo
    const sessionMsg = await publishSessionEmbed(interaction.client, s.id);
    if (sessionMsg) {
      embed.addFields({
        name: 'ÔåÆ sess├úo aberta',
        value: `Sess├úo publicada em <#${sessionMsg.channelId}>. Os membros podem registar-se directamente.`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: 'ÔåÆ pr├│ximo passo',
        value:
          'Adiciona **participantes** manualmente. Define `SAIDA_SESSION_CHANNEL_ID` para activar registo interactivo.',
        inline: false,
      });
    }
    return replySafe(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// FECHAR SA├ìDA ÔÇö modal rico (resultado, fac├º├úo, craft/dominio, kills totais)
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

async function handleCloseSaidaButton(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const open = await saidaRepo.findOpen();
  if (!open.length) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Sem sa├¡das abertas.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  const options = buildSaidaSelectOptions(open);
  const rows = buildSearchableSelect({
    customId: 'saida::select_close',
    placeholder: SAIDAS.SELECTS.QUAL_SAIDA_FECHAR,
    options,
    searchKey: `closeSaida::${interaction.user.id}`,
    modalTitle: 'Pesquisar sa├¡da',
    messageClass: 'BANAL',
  });
  await safeReply(interaction, {
    content: `${EMOJI.FECHAR} Escolhe a sa├¡da a fechar:`,
    components: rows,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Fechar directo a partir do session embed ÔÇö salta a selec├º├úo de sa├¡da
 * (j├í estamos nela) e vai logo para o select de resultado.
 */
async function handleCloseSessionDirect(interaction) {
  if (isDuplicate(interaction.id)) return;
  if (!(await requirePermission(interaction, isChefia))) return;

  const saidaId = parseInt(interaction.customId.split('::')[2], 10);
  const saida = await saidaRepo.findById(saidaId);
  if (!saida || !['criada', 'em_preparacao', 'em_curso'].includes(saida.status)) {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Sa├¡da #${saidaId} j├í n├úo est├í aberta (estado: ${fmtSaidaStatus(saida?.status) || 'n├úo encontrada'}).`,
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'WARN' }
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
  // TTL 30s backstop. Parent guardado ÔåÆ handleCloseResultSelect fecha
  // o ephemeral explicitamente antes do modal abrir.
  const reply = await safeReply(
    interaction,
    {
      content: `${EMOJI.FECHAR} Sa├¡da **#${saidaId}** ÔÇö qual foi o resultado?`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    },
    { messageClass: 'BANAL', ttlMs: 30_000 }
  );
  parentStore.setParent(interaction.user.id, interaction);
  return reply;
}

async function handleCloseSaidaSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.values[0]);
  _setContext(interaction.user.id, { saidaId });

  // Step 2: resultado predefinido (select, n├úo texto livre)
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
    content: `${EMOJI.FECHAR} Sa├¡da **#${saidaId}** ÔÇö qual foi o resultado?`,
    components: [row],
  });
}

// Step 3: resultado seleccionado ÔåÆ abre modal com detalhes (contra quem
// em texto livre, craft, notas). Sem dropdown de fac├º├úo ÔÇö user pediu
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
          .setPlaceholder('Ex: Los Vagos, Ballas, Pol├¡cia...')
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
    .setTitle(`${EMOJI.FECHAR} Fechar #${saidaId} ÔÇö ${resultLabel}`.slice(0, 45))
    .addComponents(...fields);
  // Fecha o ephemeral do result-select antes do modal abrir.
  parentStore.deleteParentEphemeral(interaction.user.id).catch(() => {});
  await safeShowModal(interaction, modal);
}

async function handleCloseSaidaModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx)
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Sess├úo expirada ÔÇö come├ºa de novo.` },
      { messageClass: 'BANAL' }
    );

  // Resultado vem do select (step 2). Inimigo ├® texto livre (step 3 modal).
  const result = ctx.result || 'sem_conflito';
  const enemyRaw = getModalField(interaction, 'enemy') || '';
  const enemy_name = enemyRaw.trim();
  const enemy_faction = enemy_name;

  const craft_amount = Math.max(0, Math.min(parseInt(getModalField(interaction, 'craft_amount')) || 0, 999999));
  const result_notes = getModalField(interaction, 'result_notes') || '';
  const had_craft = craft_amount > 0;
  const had_fight = result === 'vitoria' || result === 'derrota';

  try {
    // Transita para em_liquidacao ÔÇö participantes preenchem resultados depois.
    await saidaEngine.closeSaida(
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
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }

  pendingSaidaContext.delete(interaction.user.id);

  // Refresh session embed para mostrar estado de liquida├º├úo + bot├Áes
  const saidaSession = require('./saidaSession');
  saidaSession.refreshSessionEmbed(interaction.client, ctx.saidaId).catch(() => {});

  const resultLabel = RESULT_NAME[result] || result;

  // Phase 8b: DM cada participante automaticamente com bot├úo para preencher
  // o resultado. Substitui o antigo ping p├║blico (removido em phase 4) por
  // notifica├º├Áes privadas ÔÇö zero spam no canal, cada um recebe na sua DM.
  // Se DMs estiverem desligadas, fallback: painel vivo tem bot├úo tamb├®m.
  const saidaIndividual = require('./saidaIndividualResult');
  saidaIndividual.dmParticipantsForResults(interaction.client, ctx.saidaId, resultLabel).catch(e => {
    warn(`[CLOSE] dmParticipantsForResults falhou (non-fatal): ${e.message}`);
  });
  return safeReply(
    interaction,
    {
      content: `${EMOJI.OK} **Sa├¡da #${ctx.saidaId}** em liquida├º├úo ÔÇö resultado: **${resultLabel}**${enemy_name ? ` contra **${enemy_name}**` : ''}.\n\n${EMOJI.PENDENTE} Os participantes foram notificados para preencherem o resultado individual.\nQuando todos preencherem (ou quando quiseres for├ºar), usa **"Finalizar e Publicar"** no painel da sess├úo.`,
    },
    { messageClass: 'BANAL' }
  );
}

/**
 * Handler do bot├úo "Finalizar e Publicar" ÔÇö transita de em_liquidacao ÔåÆ concluida.
 * Corre scoring com dados reais, actualiza stats, publica resultados.
 */
async function handleFinalizeSaidaButton(interaction) {
  if (isDuplicate(interaction.id)) return;

  if (!(await requirePermission(interaction, isChefia))) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const saidaId = parseInt(interaction.customId.split('::')[2], 10);

  // Verificar estado
  const saida = await saidaRepo.findById(saidaId);
  if (!saida || saida.status !== 'em_liquidacao') {
    return safeReply(
      interaction,
      {
        content: `${EMOJI.WARN} Sa├¡da #${saidaId} n├úo est├í em liquida├º├úo (estado: ${saida?.status || 'n├úo encontrada'}).`,
      },
      { messageClass: 'WARN' }
    );
  }

  // Mostrar progresso antes de finalizar
  const progress = await saidaEngine.getResultProgress(saidaId);

  try {
    // Auto-preencher participantes que n├úo submeteram resultado como "sobreviveu, 0 kills"
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

    // Refresh session embed (mostra conclu├¡da)
    const saidaSession = require('./saidaSession');
    saidaSession.refreshSessionEmbed(interaction.client, saidaId).catch(() => {});

    const { SAIDAS: S } = require('../content');
    const mvp = result?.participants?.find(p => p.mvp_flag);
    const mvpLine = mvp
      ? `\n${EMOJI.MVP} MVP: **${mvp.display_name || 'Participante'}** (${mvp.kills || 0} kills, peso ${Math.round(mvp.performance_score || 0)})`
      : '';
    const v = result?.values || {};
    const profitLabel = v.was_profitable ? `${EMOJI.LUCRO} Lucro` : `${EMOJI.WARN} Preju├¡zo`;

    let pendingNote = '';
    if (progress.pending > 0) {
      pendingNote = `\n\n${EMOJI.INFO} _${progress.pending} participante(s) n├úo preencheram resultado ÔÇö auto-liquidados como vivos, 0 kills._`;
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
          `\n${profitLabel}: **${Math.round(v.net || 0).toLocaleString('pt-PT')}Ôé¼**` +
          pendingNote,
      },
      { messageClass: 'RESULT' }
    );
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// MARCAR MORTOS
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

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
      { content: `${EMOJI.INFO} Sa├¡da #${saidaId} ÔÇö nenhum morto marcado.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
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
        `${EMOJI.MORTE} <@${discordId}> ÔÇö ${diedWithItems.length ? `${diedWithItems.length} item(s) ÔåÆ perda` : 'sem material'}`
      );
    } catch (e) {
      report.push(`${EMOJI.ERRO} <@${discordId}> ÔÇö ${e.message}`);
    }
  }
  pendingSaidaContext.delete(interaction.user.id);
  const lines = [`Sa├¡da **#${saidaId}** ÔÇö cust├│dia liquidada:`, ...report];
  return safeReply(
    interaction,
    { content: lines.join('\n').slice(0, 1900), flags: MessageFlags.Ephemeral },
    { messageClass: 'ERROR' }
  );
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// VER SA├ìDAS
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

async function handleViewSaidasButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const list = await saidaRepo.findRecent(10);
  if (!list.length)
    return safeReply(interaction, { content: `${EMOJI.INFO} Sem sa├¡das registadas.` }, { messageClass: 'BANAL' });
  const statusEmoji = {
    aberta: EMOJI.ABERTO,
    em_preparacao: EMOJI.PREPARACAO,
    em_curso: EMOJI.EM_CURSO,
    em_liquidacao: EMOJI.LIQUIDACAO,
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
    const em = statusEmoji[s.status] || EMOJI.NEUTRO;
    const re = ['concluida', 'em_liquidacao'].includes(s.status) && s.result ? ` ${resultEmoji[s.result] || ''}` : '';
    // Data no formato dd/mm/yyyy. Se houver hora marcada, inclui.
    let when = formatPtDateOnly(s.date);
    if (s.scheduled_time) {
      const t = String(s.scheduled_time).slice(0, 5);
      if (t && t !== '00:00') when += ` ┬À ${t}`;
    }
    return `${em}${re} **#${s.id}** ÔÇö ${fmtSaidaType(s.operation_type)} ┬À ${when} ┬À ${s.spot || 'ÔÇö'} ┬À L├¡der: ${s.leader_name || 'ÔÇö'}`;
  });
  const embed = brandEmbed('MOVEMENT').setTitle(`${EMOJI.SAIDA} Sa├¡das recentes`).setDescription(lines.join('\n'));
  return replySafe(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// PARTICIPANTES
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

async function handleAddParticipantButton(interaction) {
  if (!(await requirePermission(interaction, isOficial))) return;
  const open = await saidaRepo.findOpen();
  if (!open.length)
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Sem sa├¡das abertas.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  const options = buildSaidaSelectOptions(open);
  const rows = buildSearchableSelect({
    customId: 'saida::select_add_participant',
    placeholder: SAIDAS.SELECTS.QUAL_SAIDA_PARTICIPANTE,
    options,
    searchKey: `addPart::${interaction.user.id}`,
    modalTitle: 'Pesquisar sa├¡da',
    messageClass: 'BANAL',
  });
  await safeReply(interaction, {
    content: `${EMOJI.PARTICIPANTE} Em que sa├¡da entram os nomes?`,
    components: rows,
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
      .setPlaceholder('Escolhe at├® 25 nomes')
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
      { content: `${EMOJI.WARN} Sa├¡da inv├ílida.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  const userIds = interaction.values || [];
  if (!userIds.length)
    return safeReply(
      interaction,
      { content: `${EMOJI.WARN} Nenhum nome escolhido.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );

  const added = [],
    errors = [];
  for (const uid of userIds) {
    try {
      await saidaEngine.addParticipant(saidaId, uid, { roleInSaida: 'membro' }, interaction.user.id, interaction.guild);
      added.push(uid);
    } catch (e) {
      errors.push(`<@${uid}> ÔÇö ${e.message}`);
    }
  }
  pendingSaidaContext.delete(interaction.user.id);
  const lines = [];
  if (added.length) {
    lines.push(`**${added.length}** no movimento da Sa├¡da **#${saidaId}**:`, added.map(u => `<@${u}>`).join(', '));
  }
  if (errors.length) {
    lines.push('', '**Falhas:**', ...errors);
  }
  return replySafe(
    interaction,
    { embeds: [successEmbed('Nomes no movimento', lines.join('\n'))], flags: MessageFlags.Ephemeral },
    { messageClass: 'RESULT' }
  );
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// MATERIAL DA SA├ìDA (aggregate: fornecido/devolvido/perdido/consumido)
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

async function handleRegisterMaterialButton(interaction) {
  if (!(await requirePermission(interaction, isChefia))) return;
  const open = await saidaRepo.findOpen();
  if (!open.length)
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Sem sa├¡das abertas.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  const options = buildSaidaSelectOptions(open);
  const rows = buildSearchableSelect({
    customId: 'saida::select_material_op',
    placeholder: SAIDAS.SELECTS.QUAL_SAIDA_MATERIAL,
    options,
    searchKey: `regMat::${interaction.user.id}`,
    modalTitle: 'Pesquisar sa├¡da',
    messageClass: 'BANAL',
  });
  await safeReply(interaction, {
    content: `${EMOJI.MATERIAL} Material em que sa├¡da?`,
    components: rows,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleMaterialOpSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.values[0]);
  _setContext(interaction.user.id, { saidaId, action: 'material_op' });
  const directionOptions = [
    {
      label: 'Fornecido',
      description: 'Material que saiu da firma ÔåÆ participante',
      value: 'fornecido',
      emoji: EMOJI.ENVIAR,
    },
    { label: 'Devolvido', description: 'Material que voltou ├á casa', value: 'devolvido', emoji: EMOJI.DEVOLVER },
    { label: 'Perdido', description: 'Material perdido na rua', value: 'perdido', emoji: EMOJI.PERDIDO },
    { label: 'Consumido', description: 'Material gasto durante a sa├¡da', value: 'consumido', emoji: EMOJI.CONSUMIDO },
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
      { content: `${EMOJI.PENDENTE} Sess├úo expirada ÔÇö come├ºa de novo.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  ctx.direction = direction;
  _setContext(interaction.user.id, ctx);
  const rows = await buildCategorySelectMenu('saida::cat_material', 'Seleciona a categoria', {
    searchKey: `saidaMat::${interaction.user.id}`,
    modalTitle: 'Pesquisar categoria',
  });
  await safeUpdate(interaction, {
    content: SAIDAS.PROMPTS.DIRECCAO_MATERIAL(direction),
    components: rows,
  });
}

// Step intermedi├írio: categoria seleccionada ÔåÆ mostrar itens dessa categoria
// Adiciona bot├úo "­ƒöÄ Procurar" em row separado para o user poder pesquisar
// directamente no cat├ílogo inteiro em vez de scrollar.
async function handleMaterialCategorySelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const category = interaction.values[0];
  if (category === 'none') return;
  const customId = interaction.customId;
  const isIssue = customId.includes('cat_issue');
  const itemPrefix = isIssue ? 'saida::issue_select_item' : 'saida::select_material_item';
  const rows = await buildItemSelectMenuForCategory(itemPrefix, 'Seleciona o item', category, {
    searchKey: `saidaItem::${interaction.user.id}::${category}`,
    modalTitle: 'Pesquisar item',
  });
  const itemSearch = require('../inventory/itemSearch');
  const searchRow = new ActionRowBuilder().addComponents(
    itemSearch.buildSearchButton(isIssue ? 'saida_issue' : 'saida_material', {
      label: 'Procurar em todo o cat├ílogo',
      style: 2, // Secondary
    })
  );
  await safeUpdate(interaction, {
    content: SAIDAS.PROMPTS.ESCOLHE_CATEGORIA_MATERIAL.replace('{category}', category),
    components: [...rows, searchRow],
  });
}

async function handleMaterialItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Sess├úo expirada.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  }
  ctx.itemId = itemId;
  _setContext(interaction.user.id, ctx);
  const { inventoryRepo } = require('../repositories');
  const item = await inventoryRepo.getItemById(itemId);
  const MF = MODALS.SAIDA_MATERIAL.FIELDS;
  const modal = new ModalBuilder()
    .setCustomId('saida::modal_material_qty')
    .setTitle(`${ctx.direction} ÔÇö ${item?.name || 'Item'}`)
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
    return safeReply(interaction, { content: `${EMOJI.PENDENTE} Sess├úo expirada.` }, { messageClass: 'BANAL' });
  }
  const quantity = parseInt(getModalField(interaction, 'quantity'));
  const notes = getModalField(interaction, 'notes');
  if (isNaN(quantity) || quantity <= 0)
    return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { messageClass: 'BANAL' });
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
      `**${quantity}├ù** ${item?.name || 'Item'} ÔÇö ${dirLabels[ctx.direction]}\nSa├¡da **#${ctx.saidaId}**${notes ? `\nNotas: ${notes}` : ''}`
    );
    return replySafe(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }
}

// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
// FORNECER A PARTICIPANTE (cust├│dia nominal)
// ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ

async function handleIssueToParticipantButton(interaction) {
  if (!(await requirePermission(interaction, isOficial))) return;
  const open = await saidaRepo.findOpen();
  if (!open.length)
    return safeReply(
      interaction,
      { content: `${EMOJI.INFO} Sem sa├¡das abertas.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  const options = buildSaidaSelectOptions(open);
  const rows = buildSearchableSelect({
    customId: 'saida::issue_select_saida',
    placeholder: SAIDAS.SELECTS.QUAL_SAIDA_MATERIAL,
    options,
    searchKey: `issueSaida::${interaction.user.id}`,
    modalTitle: 'Pesquisar sa├¡da',
    messageClass: 'BANAL',
  });
  await safeReply(interaction, {
    content: `${EMOJI.FORNECER} Fornecer material nominal ÔÇö qual sa├¡da?`,
    components: rows,
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
      content: `${EMOJI.WARN} Sa├¡da **#${saidaId}** sem nomes. Adiciona primeiro em "Participantes".`,
      components: [],
    });
  }
  const options = participants.slice(0, 25).map(p => {
    const typeTag =
      p.participant_type === 'trabalhador' ? `${EMOJI.CRAFT} Trabalhador` : `${EMOJI.SAIDA} Caracterizado`;
    const weapon = p.own_weapon ? ' ┬À arma pr├│pria' : '';
    return {
      label: `${p.display_name || p.discord_id}`.slice(0, 100),
      description: `${typeTag}${weapon}`.slice(0, 100),
      value: p.discord_id,
      emoji: p.participant_type === 'trabalhador' ? EMOJI.CRAFT : EMOJI.SAIDA,
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
  await safeUpdate(interaction, {
    content: `${EMOJI.FORNECER} Sa├¡da **#${saidaId}** ÔÇö para quem?`,
    components: [row],
  });
}

async function handleIssueParticipantSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const discordId = interaction.values[0];
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant')
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Sess├úo expirada.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  ctx.participantDiscordId = discordId;
  _setContext(interaction.user.id, ctx);
  const rows = await buildCategorySelectMenu('saida::cat_issue', 'Seleciona a categoria', {
    searchKey: `saidaIssue::${interaction.user.id}`,
    modalTitle: 'Pesquisar categoria',
  });
  await safeUpdate(interaction, {
    content: SAIDAS.PROMPTS.PARTICIPANT_CATEGORY(ctx.saidaId, discordId),
    components: rows,
  });
}

async function handleIssueItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant')
    return safeReply(
      interaction,
      { content: `${EMOJI.PENDENTE} Sess├úo expirada.`, flags: MessageFlags.Ephemeral },
      { messageClass: 'BANAL' }
    );
  ctx.itemId = itemId;
  _setContext(interaction.user.id, ctx);
  const { inventoryRepo } = require('../repositories');
  const item = await inventoryRepo.getItemById(itemId);
  const IF = MODALS.SAIDA_MATERIAL.FIELDS;
  const modal = new ModalBuilder()
    .setCustomId('saida::issue_modal_qty')
    .setTitle(`${EMOJI.FORNECER} Fornecer ÔÇö ${item?.name || 'Item'}`)
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
    return safeReply(interaction, { content: `${EMOJI.PENDENTE} Sess├úo expirada.` }, { messageClass: 'BANAL' });
  const qty = parseInt(getModalField(interaction, 'quantity'));
  const notes = getModalField(interaction, 'notes');
  if (isNaN(qty) || qty <= 0)
    return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { messageClass: 'BANAL' });
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
      `${EMOJI.FORNECER} **${qty}├ù** ${item?.name || 'Item'} ÔåÆ <@${ctx.participantDiscordId}>\nSa├¡da **#${ctx.saidaId}**${notes ? `\nNotas: ${notes}` : ''}`
    );
    return replySafe(interaction, { embeds: [embed] }, { messageClass: 'RESULT' });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { messageClass: 'ERROR' });
  }
}

// ÔöÇÔöÇ Registo de pick handlers do itemSearch ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Quando user pica um item no select filtrado, estes reencaminham para o
// modal de quantidade que os flows j├í usam (saida::modal_material_qty +
// saida::issue_modal_qty).
(() => {
  const itemSearch = require('../inventory/itemSearch');

  itemSearch.registerPickHandler('saida_material', async ({ interaction, item }) => {
    const ctx = pendingSaidaContext.get(interaction.user.id);
    if (!ctx || ctx.action !== 'material_op') {
      return safeReply(
        interaction,
        { content: `${EMOJI.PENDENTE} Sess├úo expirada. Recome├ºa o fluxo.`, flags: MessageFlags.Ephemeral },
        { messageClass: 'BANAL' }
      );
    }
    ctx.itemId = item.id;
    _setContext(interaction.user.id, ctx);
    const MF = MODALS.SAIDA_MATERIAL.FIELDS;
    const modal = new ModalBuilder()
      .setCustomId('saida::modal_material_qty')
      .setTitle(`${ctx.direction} ÔÇö ${item.name}`.slice(0, 45))
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
    parentStore.deleteParentEphemeral(interaction.user.id).catch(() => {});
    await safeShowModal(interaction, modal);
  });

  itemSearch.registerPickHandler('saida_issue', async ({ interaction, item }) => {
    const ctx = pendingSaidaContext.get(interaction.user.id);
    if (!ctx || ctx.action !== 'issue_to_participant') {
      return safeReply(
        interaction,
        { content: `${EMOJI.PENDENTE} Sess├úo expirada. Recome├ºa o fluxo.`, flags: MessageFlags.Ephemeral },
        { messageClass: 'BANAL' }
      );
    }
    ctx.itemId = item.id;
    _setContext(interaction.user.id, ctx);
    const IF = MODALS.SAIDA_MATERIAL.FIELDS;
    const modal = new ModalBuilder()
      .setCustomId('saida::issue_modal_qty')
      .setTitle(`${EMOJI.FORNECER} Fornecer ÔÇö ${item.name}`.slice(0, 45))
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
    parentStore.deleteParentEphemeral(interaction.user.id).catch(() => {});
    await safeShowModal(interaction, modal);
  });
})();

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
