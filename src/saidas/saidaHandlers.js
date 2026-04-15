'use strict';
const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder,
} = require('discord.js');
const {
  safeReply, safeUpdate, safeShowModal,
  getModalField, isDuplicate,
} = require('../shared/interactionHelpers');
const { successEmbed, brandEmbed } = require('../shared/embedBuilders');
const { buildItemSelectMenu } = require('../inventory/inventoryMenus');
const { isChefia, isOficial } = require('../permissions/permissionEngine');
const { saidaRepo } = require('../repositories');
const saidaEngine = require('./saidaEngine');
const MESSAGES = require('../shared/errorMessages');
const { EMOJI, ERRORS, SUCCESS, SAIDAS } = require('../content');

// Context efémero por user durante fluxos multi-step (manteve nome legado
// `pendingOpContext` só para não partir imports de código que ainda referencia).
const pendingSaidaContext = new Map();
const pendingOpContext = pendingSaidaContext; // alias

const SAIDA_TYPES = ['craft', 'dominio', 'ataque', 'defesa', 'recolha', 'outra'];
const VALID_RESULTS = ['vitoria', 'derrota', 'empate', 'sem_conflito', 'abortada'];

// ═══════════════════════════════════════════════════════════════════════════
// CRIAR SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

async function handleCreateSaidaButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: ERRORS.NO_PERMISSION('criar saídas'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  const modal = new ModalBuilder()
    .setCustomId('saida::modal_create')
    .setTitle(SAIDAS.CREATE_TITLE)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('date').setLabel('Data (YYYY-MM-DD)').setStyle(TextInputStyle.Short)
          .setPlaceholder(new Date().toISOString().split('T')[0]).setRequired(true).setMaxLength(10)),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('time').setLabel('Hora (HH:MM)').setStyle(TextInputStyle.Short)
          .setPlaceholder('21:30').setRequired(false).setMaxLength(5)),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('spot').setLabel('Spot').setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(100)),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('type').setLabel('Tipo')
          .setStyle(TextInputStyle.Short).setPlaceholder('craft / dominio / ataque / defesa / recolha / outra')
          .setRequired(true).setMaxLength(20)),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes').setLabel('Notas').setStyle(TextInputStyle.Paragraph)
          .setRequired(false).setMaxLength(500)),
    );
  await safeShowModal(interaction, modal);
}

async function handleCreateSaidaModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const date = getModalField(interaction, 'date');
  const time = getModalField(interaction, 'time');
  const spot = getModalField(interaction, 'spot');
  const type = getModalField(interaction, 'type').toLowerCase();
  const notes = getModalField(interaction, 'notes');
  if (!SAIDA_TYPES.includes(type)) {
    return safeReply(interaction, { content: `${EMOJI.WARN} Tipo inválido. Usa: ${SAIDA_TYPES.join(', ')}.` }, { dismissible: true });
  }
  try {
    const s = await saidaEngine.createSaida({
      date, scheduledTime: time || null, spot, saidaType: type,
      leaderDiscordId: null, groupNumber: 1, maxParticipants: 12,
      notes, createdBy: interaction.user.id,
    });
    const embed = successEmbed('Saída aberta', `**#${s.id}** — ${type}\nData: ${date}${spot ? `\nSpot: ${spot}` : ''}`);
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
    return safeReply(interaction, { content: ERRORS.NO_PERMISSION('fechar saídas'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  const open = await saidaRepo.findOpen();
  if (!open.length) {
    return safeReply(interaction, { content: `${EMOJI.INFO} Sem saídas abertas.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  const options = open.map(s => ({
    label: `#${s.id} — ${s.operation_type} (${s.date})`.slice(0, 100),
    description: s.spot || 'Sem spot',
    value: String(s.id),
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('saida::select_close')
      .setPlaceholder('Qual saída vais fechar?').setMinValues(1).setMaxValues(1)
      .addOptions(options.slice(0, 25)));
  await safeReply(interaction, { content: `${EMOJI.FECHAR} Escolhe a saída a fechar:`, components: [row], flags: MessageFlags.Ephemeral });
}

async function handleCloseSaidaSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.values[0]);
  pendingSaidaContext.set(interaction.user.id, { saidaId });
  // Close modal captura APENAS o contexto macro (result, inimigo, craft, notas).
  // Kills/deaths per-participante ficam para o wizard a seguir.
  const modal = new ModalBuilder()
    .setCustomId('saida::modal_close')
    .setTitle(`Fechar Saída #${saidaId}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('result').setLabel('Resultado')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('vitoria / derrota / empate / sem_conflito / abortada')
          .setRequired(true).setMaxLength(15)),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('enemy').setLabel('Inimigo · facção')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120)
          .setPlaceholder('Ex: Tony Bloods · Red Street')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('craft_amount').setLabel('Valor craftado (€)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(6).setPlaceholder('0')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('flags').setLabel('Flags (vírgulas)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120)
          .setPlaceholder('craft, dominio, voltaram')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('result_notes').setLabel('Notas')
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
    );
  await safeShowModal(interaction, modal);
}

async function handleCloseSaidaModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx) return safeReply(interaction, { content: `${EMOJI.PENDENTE} Sessão expirada — começa de novo.` }, { dismissible: true });

  const resultRaw = getModalField(interaction, 'result').toLowerCase().trim();
  const result = VALID_RESULTS.includes(resultRaw) ? resultRaw : 'sem_conflito';
  const enemyRaw = getModalField(interaction, 'enemy');
  let enemy_name = enemyRaw, enemy_faction = '';
  const sepMatch = enemyRaw.match(/^(.+?)\s*[·\-—]\s*(.+)$/);
  if (sepMatch) { enemy_name = sepMatch[1].trim(); enemy_faction = sepMatch[2].trim(); }
  const craft_amount = parseInt(getModalField(interaction, 'craft_amount')) || 0;
  const flagsRaw = (getModalField(interaction, 'flags') || '').toLowerCase();
  const result_notes = getModalField(interaction, 'result_notes') || '';
  const had_craft = flagsRaw.includes('craft') || craft_amount > 0;
  const had_domination = flagsRaw.includes('dominio') || flagsRaw.includes('domínio');
  const had_fight = result === 'vitoria' || result === 'derrota';

  try {
    await saidaRepo.updateStatus(ctx.saidaId, 'em_curso', {
      result, had_fight, had_craft, had_domination,
      enemy_name, enemy_faction,
      craft_amount,
      result_notes,
    });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }

  // Lança o wizard de liquidação por participante
  const { handleStart } = require('./saidaSettlementWizard');
  pendingSaidaContext.delete(interaction.user.id);
  return handleStart(interaction, ctx.saidaId);
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
    return safeReply(interaction, { content: `${EMOJI.INFO} Saída #${saidaId} — nenhum morto marcado.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
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
      await saidaEngine.settleParticipantCustody(saidaId, discordId, {
        diedWithItems, died: true, survived: false, returned: false,
      }, interaction.user.id, interaction.guild);
      report.push(`${EMOJI.MORTE} <@${discordId}> — ${diedWithItems.length ? `${diedWithItems.length} item(s) → perda` : 'sem material'}`);
    } catch (e) {
      report.push(`${EMOJI.ERRO} <@${discordId}> — ${e.message}`);
    }
  }
  pendingSaidaContext.delete(interaction.user.id);
  const lines = [`Saída **#${saidaId}** — custódia liquidada:`, ...report];
  return safeReply(interaction, { content: lines.join('\n').slice(0, 1900), flags: MessageFlags.Ephemeral }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// VER SAÍDAS
// ═══════════════════════════════════════════════════════════════════════════

async function handleViewSaidasButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const list = await saidaRepo.findRecent(10);
  if (!list.length) return safeReply(interaction, { content: `${EMOJI.INFO} Sem saídas registadas.` }, { dismissible: true });
  const statusEmoji = { aberta: '🟢', em_preparacao: '🟡', em_curso: '🟠', concluida: EMOJI.OK, cancelada: EMOJI.ERRO };
  const resultEmoji = { vitoria: EMOJI.VITORIA, derrota: EMOJI.DERROTA, empate: EMOJI.EMPATE, sem_conflito: EMOJI.INFO, abortada: EMOJI.WARN };
  const lines = list.map(s => {
    const em = statusEmoji[s.status] || '⬜';
    const re = s.status === 'concluida' && s.result ? ` ${resultEmoji[s.result] || ''}` : '';
    return `${em}${re} **#${s.id}** — ${s.operation_type} | ${s.date} | ${s.spot || '-'} | Líder: ${s.leader_name || '-'}`;
  });
  const embed = brandEmbed('MOVEMENT').setTitle(`${EMOJI.SAIDA} Saídas recentes`).setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// PARTICIPANTES
// ═══════════════════════════════════════════════════════════════════════════

async function handleAddParticipantButton(interaction) {
  if (!isChefia(interaction.member) && !isOficial(interaction.member)) {
    return safeReply(interaction, { content: ERRORS.NO_PERMISSION('mexer em participantes'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  const open = await saidaRepo.findOpen();
  if (!open.length) return safeReply(interaction, { content: `${EMOJI.INFO} Sem saídas abertas.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
  const options = open.map(s => ({
    label: `#${s.id} — ${s.operation_type} (${s.date})`.slice(0, 100),
    description: s.spot || 'Sem spot',
    value: String(s.id),
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('saida::select_add_participant')
      .setPlaceholder('Qual saída?').setMinValues(1).setMaxValues(1)
      .addOptions(options.slice(0, 25)));
  await safeReply(interaction, { content: `${EMOJI.PARTICIPANTE} Em que saída entram os nomes?`, components: [row], flags: MessageFlags.Ephemeral });
}

async function handleAddParticipantSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.values[0]);
  pendingSaidaContext.set(interaction.user.id, { saidaId, action: 'add_participant' });
  const userMenu = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`saida::user_select_participants::${saidaId}`)
      .setPlaceholder('Escolhe até 25 nomes')
      .setMinValues(1).setMaxValues(25));
  await safeUpdate(interaction, {
    content: `Saída **#${saidaId}** — escolhe quem entra:`,
    components: [userMenu],
  });
}

async function handleParticipantUsersSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});
  const parts = interaction.customId.split('::');
  const saidaId = parseInt(parts[2]);
  if (!saidaId) return safeReply(interaction, { content: `${EMOJI.WARN} Saída inválida.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
  const userIds = interaction.values || [];
  if (!userIds.length) return safeReply(interaction, { content: `${EMOJI.WARN} Nenhum nome escolhido.`, flags: MessageFlags.Ephemeral }, { dismissible: true });

  const added = [], errors = [];
  for (const uid of userIds) {
    try {
      await saidaEngine.addParticipant(saidaId, uid, { roleInSaida: 'membro' }, interaction.user.id, interaction.guild);
      added.push(uid);
    } catch (e) { errors.push(`<@${uid}> — ${e.message}`); }
  }
  pendingSaidaContext.delete(interaction.user.id);
  const lines = [];
  if (added.length) {
    lines.push(`**${added.length}** no movimento da Saída **#${saidaId}**:`, added.map(u => `<@${u}>`).join(', '));
  }
  if (errors.length) { lines.push('', '**Falhas:**', ...errors); }
  return safeReply(interaction, { embeds: [successEmbed('Nomes no movimento', lines.join('\n'))], flags: MessageFlags.Ephemeral }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// MATERIAL DA SAÍDA (aggregate: fornecido/devolvido/perdido/consumido)
// ═══════════════════════════════════════════════════════════════════════════

async function handleRegisterMaterialButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: ERRORS.NO_PERMISSION('mexer no material das saídas'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  const open = await saidaRepo.findOpen();
  if (!open.length) return safeReply(interaction, { content: `${EMOJI.INFO} Sem saídas abertas.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
  const options = open.map(s => ({
    label: `#${s.id} — ${s.operation_type}`.slice(0, 100),
    description: s.spot || 'Sem spot',
    value: String(s.id),
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('saida::select_material_op')
      .setPlaceholder('Qual saída?').setMinValues(1).setMaxValues(1)
      .addOptions(options.slice(0, 25)));
  await safeReply(interaction, { content: `${EMOJI.MATERIAL} Material em que saída?`, components: [row], flags: MessageFlags.Ephemeral });
}

async function handleMaterialOpSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.values[0]);
  pendingSaidaContext.set(interaction.user.id, { saidaId, action: 'material_op' });
  const directionOptions = [
    { label: 'Fornecido', description: 'Material que saiu da firma', value: 'fornecido' },
    { label: 'Devolvido', description: 'Material que voltou à casa', value: 'devolvido' },
    { label: 'Perdido', description: 'Material perdido na rua', value: 'perdido' },
    { label: 'Consumido', description: 'Material gasto durante a saída', value: 'consumido' },
  ];
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('saida::select_material_direction')
      .setPlaceholder('Direcção do material').setMinValues(1).setMaxValues(1)
      .addOptions(directionOptions));
  await safeUpdate(interaction, { content: `Saída **#${saidaId}** — direcção:`, components: [row] });
}

async function handleMaterialDirectionSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const direction = interaction.values[0];
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return safeReply(interaction, { content: `${EMOJI.PENDENTE} Sessão expirada — começa de novo.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  ctx.direction = direction;
  pendingSaidaContext.set(interaction.user.id, ctx);
  const menu = await buildItemSelectMenu('saida::select_material_item', 'Escolhe o material');
  await safeUpdate(interaction, { content: `Que material foi **${direction}**?`, components: [menu] });
}

async function handleMaterialItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return safeReply(interaction, { content: `${EMOJI.PENDENTE} Sessão expirada.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  ctx.itemId = itemId;
  pendingSaidaContext.set(interaction.user.id, ctx);
  const { inventoryRepo } = require('../repositories');
  const item = await inventoryRepo.getItemById(itemId);
  const modal = new ModalBuilder()
    .setCustomId('saida::modal_material_qty')
    .setTitle(`${ctx.direction} — ${item?.name || 'Item'}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('quantity').setLabel('Quantidade')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder('Ex: 10')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes').setLabel('Notas')
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)));
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
  if (isNaN(quantity) || quantity <= 0) return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { dismissible: true });
  try {
    await saidaEngine.registerSaidaMaterial(ctx.saidaId, ctx.itemId, ctx.direction, quantity, null, notes, interaction.user.id);
    pendingSaidaContext.delete(interaction.user.id);
    const { inventoryRepo } = require('../repositories');
    const item = await inventoryRepo.getItemById(ctx.itemId);
    const dirLabels = { fornecido: 'Fornecido', devolvido: 'Devolvido', perdido: 'Perdido', consumido: 'Consumido' };
    const embed = successEmbed('Material registado',
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
    return safeReply(interaction, { content: ERRORS.NO_PERMISSION('fornecer material'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  const open = await saidaRepo.findOpen();
  if (!open.length) return safeReply(interaction, { content: `${EMOJI.INFO} Sem saídas abertas.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
  const options = open.map(s => ({
    label: `#${s.id} — ${s.operation_type} (${s.date})`.slice(0, 100),
    description: s.spot || 'Sem spot',
    value: String(s.id),
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('saida::issue_select_saida')
      .setPlaceholder('Qual saída?').setMinValues(1).setMaxValues(1)
      .addOptions(options.slice(0, 25)));
  await safeReply(interaction, { content: `${EMOJI.FORNECER} Fornecer material nominal — qual saída?`, components: [row], flags: MessageFlags.Ephemeral });
}

async function handleIssueSaidaSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const saidaId = parseInt(interaction.values[0]);
  pendingSaidaContext.set(interaction.user.id, { saidaId, action: 'issue_to_participant' });
  const participants = await saidaRepo.getParticipants(saidaId);
  if (!participants.length) {
    pendingSaidaContext.delete(interaction.user.id);
    return safeUpdate(interaction, { content: `${EMOJI.WARN} Saída **#${saidaId}** sem nomes. Adiciona primeiro em "Participantes".`, components: [] });
  }
  const options = participants.slice(0, 25).map(p => ({
    label: `${p.display_name || p.discord_id}`.slice(0, 100),
    description: p.role_in_op || 'membro',
    value: p.discord_id,
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('saida::issue_select_participant')
      .setPlaceholder('Para quem vai?').setMinValues(1).setMaxValues(1)
      .addOptions(options));
  await safeUpdate(interaction, { content: `Saída **#${saidaId}** — para quem?`, components: [row] });
}

async function handleIssueParticipantSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const discordId = interaction.values[0];
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant') return safeReply(interaction, { content: `${EMOJI.PENDENTE} Sessão expirada.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
  ctx.participantDiscordId = discordId;
  pendingSaidaContext.set(interaction.user.id, ctx);
  const menu = await buildItemSelectMenu('saida::issue_select_item', 'Que material?');
  await safeUpdate(interaction, { content: `Saída **#${ctx.saidaId}** → <@${discordId}> — item:`, components: [menu] });
}

async function handleIssueItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant') return safeReply(interaction, { content: `${EMOJI.PENDENTE} Sessão expirada.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
  ctx.itemId = itemId;
  pendingSaidaContext.set(interaction.user.id, ctx);
  const { inventoryRepo } = require('../repositories');
  const item = await inventoryRepo.getItemById(itemId);
  const modal = new ModalBuilder()
    .setCustomId('saida::issue_modal_qty')
    .setTitle(`Fornecer — ${item?.name || 'Item'}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('quantity').setLabel('Quantidade').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder('Ex: 1')),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes').setLabel('Notas').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200)));
  await safeShowModal(interaction, modal);
}

async function handleIssueQtyModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ctx = pendingSaidaContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant') return safeReply(interaction, { content: `${EMOJI.PENDENTE} Sessão expirada.` }, { dismissible: true });
  const qty = parseInt(getModalField(interaction, 'quantity'));
  const notes = getModalField(interaction, 'notes');
  if (isNaN(qty) || qty <= 0) return safeReply(interaction, { content: ERRORS.INVALID_QUANTITY() }, { dismissible: true });
  try {
    await saidaEngine.issueMaterialToParticipant(ctx.saidaId, ctx.participantDiscordId, ctx.itemId, qty, interaction.user.id, notes, interaction.guild);
    pendingSaidaContext.delete(interaction.user.id);
    const { inventoryRepo } = require('../repositories');
    const item = await inventoryRepo.getItemById(ctx.itemId);
    const embed = successEmbed('Material fornecido',
      `${EMOJI.FORNECER} **${qty}×** ${item?.name || 'Item'} → <@${ctx.participantDiscordId}>\nSaída **#${ctx.saidaId}**${notes ? `\nNotas: ${notes}` : ''}`
    );
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
  }
}

module.exports = {
  handleCreateSaidaButton, handleCreateSaidaModal,
  handleCloseSaidaButton, handleCloseSaidaSelect, handleCloseSaidaModal,
  handleMarkDeadSelect,
  handleViewSaidasButton,
  handleAddParticipantButton, handleAddParticipantSelect, handleParticipantUsersSelect,
  handleRegisterMaterialButton, handleMaterialOpSelect, handleMaterialDirectionSelect,
  handleMaterialItemSelect, handleMaterialQtyModal,
  handleIssueToParticipantButton, handleIssueSaidaSelect, handleIssueParticipantSelect,
  handleIssueItemSelect, handleIssueQtyModal,
  pendingSaidaContext,
};
