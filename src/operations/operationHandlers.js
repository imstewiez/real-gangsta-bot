'use strict';
const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { safeReply, safeShowModal, getModalField, isDuplicate } = require('../shared/interactionHelpers');
const { successEmbed, errorEmbed, operationEmbed, brandEmbed } = require('../shared/embedBuilders');
const { buildItemSelectMenu } = require('../inventory/inventoryMenus');
const { isChefia, isOficial } = require('../permissions/permissionEngine');
const { operationRepo } = require('../repositories');
const opEngine = require('./operationEngine');
const MESSAGES = require('../shared/errorMessages');

const pendingOpContext = new Map();

async function handleCreateOperationButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('criar operações'), flags: MessageFlags.Ephemeral });
  }

  const modal = new ModalBuilder()
    .setCustomId('op::modal_create')
    .setTitle('Nova Operação / Saída')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('date').setLabel('Data (YYYY-MM-DD)').setStyle(TextInputStyle.Short)
          .setPlaceholder(new Date().toISOString().split('T')[0]).setRequired(true).setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('time').setLabel('Hora prevista (HH:MM)').setStyle(TextInputStyle.Short)
          .setPlaceholder('21:30').setRequired(false).setMaxLength(5)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('spot').setLabel('Spot / Local').setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('type').setLabel('Tipo (craft/dominio/ataque/defesa/recolha/outra)')
          .setStyle(TextInputStyle.Short).setPlaceholder('craft').setRequired(true).setMaxLength(20)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes').setLabel('Notas (opcional)').setStyle(TextInputStyle.Paragraph)
          .setRequired(false).setMaxLength(500)
      ),
    );

  await safeShowModal(interaction, modal);
}

async function handleCreateOperationModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const date = getModalField(interaction, 'date');
  const time = getModalField(interaction, 'time');
  const spot = getModalField(interaction, 'spot');
  const type = getModalField(interaction, 'type').toLowerCase();
  const notes = getModalField(interaction, 'notes');

  const validTypes = ['craft', 'dominio', 'ataque', 'defesa', 'recolha', 'outra'];
  if (!validTypes.includes(type)) {
    return interaction.editReply({ content: `Tipo inválido. Usa: ${validTypes.join(', ')}` });
  }

  try {
    const op = await opEngine.createOperation({
      date, scheduledTime: time || null, spot, operationType: type,
      leaderDiscordId: null, groupNumber: 1, maxParticipants: 12,
      notes, createdBy: interaction.user.id,
    });

    const embed = successEmbed('Operação Criada', `Operação **#${op.id}** — ${type}\nData: ${date}${spot ? `\nSpot: ${spot}` : ''}`);
    return interaction.editReply({ embeds: [embed] });
  } catch (e) {
    return interaction.editReply({ content: `Erro: ${e.message}` });
  }
}

async function handleCloseOperationButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('fechar operações'), flags: MessageFlags.Ephemeral });
  }

  const openOps = await operationRepo.findOpen();
  if (!openOps.length) {
    return safeReply(interaction, { content: 'Sem operações abertas.', flags: MessageFlags.Ephemeral });
  }

  const options = openOps.map(op => ({
    label: `#${op.id} — ${op.operation_type} (${op.date})`,
    description: op.spot || 'Sem spot',
    value: String(op.id),
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('op::select_close')
      .setPlaceholder('Seleciona a operação a fechar')
      .addOptions(options.slice(0, 25))
  );

  await safeReply(interaction, { content: 'Que operação queres fechar?', components: [row], flags: MessageFlags.Ephemeral });
}

async function handleCloseOperationSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const opId = parseInt(interaction.values[0]);
  pendingOpContext.set(interaction.user.id, { opId });

  const modal = new ModalBuilder()
    .setCustomId('op::modal_close')
    .setTitle(`Fechar Operação #${opId}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('had_fight').setLabel('Houve fight? (sim/não)')
          .setStyle(TextInputStyle.Short).setPlaceholder('não').setRequired(true).setMaxLength(5)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('enemy').setLabel('Contra quem? (se houve fight)')
          .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('deaths').setLabel('Mortes do nosso lado')
          .setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(false).setMaxLength(5)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('survivors').setLabel('Sobreviventes')
          .setStyle(TextInputStyle.Short).setPlaceholder('12').setRequired(false).setMaxLength(5)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('result_notes').setLabel('Notas do resultado')
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
      ),
    );

  await safeShowModal(interaction, modal);
}

async function handleCloseOperationModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ctx = pendingOpContext.get(interaction.user.id);
  if (!ctx) return interaction.editReply({ content: 'Sessão expirada.' });

  const hadFight = getModalField(interaction, 'had_fight').toLowerCase().startsWith('s');
  const enemy = getModalField(interaction, 'enemy');
  const deaths = parseInt(getModalField(interaction, 'deaths')) || 0;
  const survivors = parseInt(getModalField(interaction, 'survivors')) || 0;
  const resultNotes = getModalField(interaction, 'result_notes');

  try {
    const op = await opEngine.closeOperation(ctx.opId, {
      had_fight: hadFight,
      enemy_name: enemy,
      deaths,
      survivors,
      result_notes: resultNotes,
    }, interaction.user.id);

    pendingOpContext.delete(interaction.user.id);

    const embed = successEmbed('Operação Concluída', `Operação **#${ctx.opId}** fechada.\n${hadFight ? `Fight contra ${enemy || 'desconhecido'}` : 'Sem fight'}\nMortes: ${deaths} | Sobreviventes: ${survivors}`);
    return interaction.editReply({ embeds: [embed] });
  } catch (e) {
    return interaction.editReply({ content: `Erro: ${e.message}` });
  }
}

async function handleViewOperationsButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ops = await operationRepo.findRecent(10);
  if (!ops.length) {
    return interaction.editReply({ content: 'Sem operações registadas.' });
  }

  const statusEmoji = { aberta: '\uD83D\uDFE2', em_preparacao: '\uD83D\uDFE1', em_curso: '\uD83D\uDFE0', concluida: '\u2705', cancelada: '\u274C' };
  const lines = ops.map(op => {
    const emoji = statusEmoji[op.status] || '\u2B1C';
    return `${emoji} **#${op.id}** — ${op.operation_type} | ${op.date} | ${op.spot || '-'} | Líder: ${op.leader_name || '-'}`;
  });

  const embed = brandEmbed()
    .setTitle('Operações Recentes')
    .setDescription(lines.join('\n'));

  return interaction.editReply({ embeds: [embed] });
}

async function handleAddParticipantButton(interaction) {
  if (!isChefia(interaction.member) && !isOficial(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('adicionar participantes'), flags: MessageFlags.Ephemeral });
  }

  const openOps = await operationRepo.findOpen();
  if (!openOps.length) {
    return safeReply(interaction, { content: 'Sem operações abertas.', flags: MessageFlags.Ephemeral });
  }

  const options = openOps.map(op => ({
    label: `#${op.id} — ${op.operation_type} (${op.date})`,
    value: String(op.id),
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('op::select_add_participant')
      .setPlaceholder('Seleciona a operação')
      .addOptions(options.slice(0, 25))
  );

  await safeReply(interaction, { content: 'Em que operação queres adicionar participantes?', components: [row], flags: MessageFlags.Ephemeral });
}

async function handleRegisterMaterialButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('registar material em operações'), flags: MessageFlags.Ephemeral });
  }

  const openOps = await operationRepo.findOpen();
  if (!openOps.length) {
    return safeReply(interaction, { content: 'Sem operações abertas.', flags: MessageFlags.Ephemeral });
  }

  const options = openOps.map(op => ({
    label: `#${op.id} — ${op.operation_type}`,
    value: String(op.id),
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('op::select_material_op')
      .setPlaceholder('Seleciona a operação')
      .addOptions(options.slice(0, 25))
  );

  await safeReply(interaction, { content: 'Material para que operação?', components: [row], flags: MessageFlags.Ephemeral });
}

// ── Adicionar participante: seleciona operação → modal com user ID ──────────
async function handleAddParticipantSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const opId = parseInt(interaction.values[0]);
  pendingOpContext.set(interaction.user.id, { opId, action: 'add_participant' });

  const modal = new ModalBuilder()
    .setCustomId('op::modal_add_participant')
    .setTitle(`Adicionar Participante — Op #${opId}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('user_id').setLabel('ID Discord do participante')
          .setStyle(TextInputStyle.Short).setPlaceholder('Ex: 123456789012345678').setRequired(true).setMaxLength(20)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('role_in_op').setLabel('Papel na saída (membro/líder/suporte)')
          .setStyle(TextInputStyle.Short).setPlaceholder('membro').setRequired(false).setMaxLength(30)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('received_org').setLabel('Recebeu material da org? (sim/não)')
          .setStyle(TextInputStyle.Short).setPlaceholder('não').setRequired(false).setMaxLength(5)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes').setLabel('Observações (opcional)')
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)
      ),
    );

  await safeShowModal(interaction, modal);
}

async function handleAddParticipantModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ctx = pendingOpContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'add_participant') {
    return interaction.editReply({ content: 'Sessão expirada. Tenta novamente.' });
  }

  const userId = getModalField(interaction, 'user_id').trim();
  const roleInOp = getModalField(interaction, 'role_in_op') || 'membro';
  const receivedOrg = getModalField(interaction, 'received_org').toLowerCase().startsWith('s');
  const notes = getModalField(interaction, 'notes');

  if (!userId || !/^\d{15,20}$/.test(userId)) {
    return interaction.editReply({ content: 'ID Discord inválido. Deve ser um número de 15-20 dígitos.' });
  }

  try {
    await opEngine.addParticipant(ctx.opId, userId, {
      roleInOp,
      broughtOwn: false,
      receivedOrg,
      notes,
    }, interaction.user.id);

    pendingOpContext.delete(interaction.user.id);

    const embed = successEmbed('Participante Adicionado', `<@${userId}> adicionado à Operação **#${ctx.opId}**\nPapel: ${roleInOp}`);
    return interaction.editReply({ embeds: [embed] });
  } catch (e) {
    return interaction.editReply({ content: `Erro: ${e.message}` });
  }
}

// ── Registar material em operação: seleciona op → seleciona direção → seleciona item → modal quantidade ──
async function handleMaterialOpSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const opId = parseInt(interaction.values[0]);
  pendingOpContext.set(interaction.user.id, { opId, action: 'material_op' });

  const directionOptions = [
    { label: 'Fornecido pela org', description: 'Material entregue à equipa', value: 'fornecido' },
    { label: 'Devolvido', description: 'Material devolvido à org', value: 'devolvido' },
    { label: 'Perdido', description: 'Material perdido na saída', value: 'perdido' },
    { label: 'Consumido', description: 'Material gasto durante a saída', value: 'consumido' },
  ];

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('op::select_material_direction')
      .setPlaceholder('Tipo de movimento')
      .addOptions(directionOptions)
  );

  await safeReply(interaction, { content: `Operação **#${opId}** — que tipo de registo de material?`, components: [row], flags: MessageFlags.Ephemeral });
}

async function handleMaterialDirectionSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const direction = interaction.values[0];
  const ctx = pendingOpContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return safeReply(interaction, { content: 'Sessão expirada.', flags: MessageFlags.Ephemeral });
  }

  ctx.direction = direction;
  pendingOpContext.set(interaction.user.id, ctx);

  const menu = await buildItemSelectMenu('op::select_material_item', 'Seleciona o material');
  await safeReply(interaction, { content: `Que material foi **${direction}**?`, components: [menu], flags: MessageFlags.Ephemeral });
}

async function handleMaterialItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const ctx = pendingOpContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return safeReply(interaction, { content: 'Sessão expirada.', flags: MessageFlags.Ephemeral });
  }

  ctx.itemId = itemId;
  pendingOpContext.set(interaction.user.id, ctx);

  const { inventoryRepo } = require('../repositories');
  const item = await inventoryRepo.getItemById(itemId);

  const modal = new ModalBuilder()
    .setCustomId('op::modal_material_qty')
    .setTitle(`${ctx.direction} — ${item?.name || 'Item'}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('quantity').setLabel('Quantidade')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes').setLabel('Observações (opcional)')
          .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)
      ),
    );

  await safeShowModal(interaction, modal);
}

async function handleMaterialQtyModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ctx = pendingOpContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return interaction.editReply({ content: 'Sessão expirada.' });
  }

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr);

  if (isNaN(quantity) || quantity <= 0) {
    return interaction.editReply({ content: MESSAGES.INVALID_QUANTITY() });
  }

  try {
    await opEngine.registerOperationMaterial(
      ctx.opId, ctx.itemId, ctx.direction, quantity, null, notes, interaction.user.id
    );

    pendingOpContext.delete(interaction.user.id);

    const { inventoryRepo } = require('../repositories');
    const item = await inventoryRepo.getItemById(ctx.itemId);
    const dirLabels = { fornecido: 'Fornecido', devolvido: 'Devolvido', perdido: 'Perdido', consumido: 'Consumido' };

    const embed = successEmbed('Material Registado',
      `**${quantity}x** ${item?.name || 'Item'} — ${dirLabels[ctx.direction] || ctx.direction}\nOperação **#${ctx.opId}**${notes ? `\nNotas: ${notes}` : ''}`
    );
    return interaction.editReply({ embeds: [embed] });
  } catch (e) {
    return interaction.editReply({ content: `Erro: ${e.message}` });
  }
}

module.exports = {
  handleCreateOperationButton,
  handleCreateOperationModal,
  handleCloseOperationButton,
  handleCloseOperationSelect,
  handleCloseOperationModal,
  handleViewOperationsButton,
  handleAddParticipantButton,
  handleAddParticipantSelect,
  handleAddParticipantModal,
  handleRegisterMaterialButton,
  handleMaterialOpSelect,
  handleMaterialDirectionSelect,
  handleMaterialItemSelect,
  handleMaterialQtyModal,
  pendingOpContext,
};
