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
const { operationRepo } = require('../repositories');
const opEngine = require('./operationEngine');
const MESSAGES = require('../shared/errorMessages');

const pendingOpContext = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// CRIAR OPERAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

async function handleCreateOperationButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('criar operações'), flags: MessageFlags.Ephemeral }, { dismissible: true });
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
        new TextInputBuilder().setCustomId('type').setLabel('Tipo')
          .setStyle(TextInputStyle.Short).setPlaceholder('craft / dominio / ataque / defesa / recolha / outra')
          .setRequired(true).setMaxLength(20)
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
    return safeReply(interaction, { content: `Tipo inválido. Usa: ${validTypes.join(', ')}` }, { dismissible: true });
  }

  try {
    const op = await opEngine.createOperation({
      date, scheduledTime: time || null, spot, operationType: type,
      leaderDiscordId: null, groupNumber: 1, maxParticipants: 12,
      notes, createdBy: interaction.user.id,
    });

    const embed = successEmbed('Operação Criada', `Operação **#${op.id}** — ${type}\nData: ${date}${spot ? `\nSpot: ${spot}` : ''}`);
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FECHAR OPERAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

async function handleCloseOperationButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('fechar operações'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const openOps = await operationRepo.findOpen();
  if (!openOps.length) {
    return safeReply(interaction, { content: 'Sem operações abertas.', flags: MessageFlags.Ephemeral }, { dismissible: true });
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
      .setMinValues(1).setMaxValues(1)
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
  if (!ctx) return safeReply(interaction, { content: 'Sessão expirada.' }, { dismissible: true });

  const hadFight = getModalField(interaction, 'had_fight').toLowerCase().startsWith('s');
  const enemy = getModalField(interaction, 'enemy');
  const deaths = parseInt(getModalField(interaction, 'deaths')) || 0;
  const survivors = parseInt(getModalField(interaction, 'survivors')) || 0;
  const resultNotes = getModalField(interaction, 'result_notes');

  try {
    await opEngine.closeOperation(ctx.opId, {
      had_fight: hadFight,
      enemy_name: enemy,
      deaths,
      survivors,
      result_notes: resultNotes,
    }, interaction.user.id);

    pendingOpContext.delete(interaction.user.id);

    const embed = successEmbed('Operação Concluída', `Operação **#${ctx.opId}** fechada.\n${hadFight ? `Fight contra ${enemy || 'desconhecido'}` : 'Sem fight'}\nMortes: ${deaths} | Sobreviventes: ${survivors}`);
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VER OPERAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

async function handleViewOperationsButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ops = await operationRepo.findRecent(10);
  if (!ops.length) {
    return safeReply(interaction, { content: 'Sem operações registadas.' }, { dismissible: true });
  }

  const statusEmoji = { aberta: '\uD83D\uDFE2', em_preparacao: '\uD83D\uDFE1', em_curso: '\uD83D\uDFE0', concluida: '\u2705', cancelada: '\u274C' };
  const lines = ops.map(op => {
    const emoji = statusEmoji[op.status] || '\u2B1C';
    return `${emoji} **#${op.id}** — ${op.operation_type} | ${op.date} | ${op.spot || '-'} | Líder: ${op.leader_name || '-'}`;
  });

  const embed = brandEmbed()
    .setTitle('Operações Recentes')
    .setDescription(lines.join('\n'));

  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// ADICIONAR PARTICIPANTES — UserSelectMenu (multi-select com pesquisa)
// ═══════════════════════════════════════════════════════════════════════════

async function handleAddParticipantButton(interaction) {
  if (!isChefia(interaction.member) && !isOficial(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('adicionar participantes'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const openOps = await operationRepo.findOpen();
  if (!openOps.length) {
    return safeReply(interaction, { content: 'Sem operações abertas.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const options = openOps.map(op => ({
    label: `#${op.id} — ${op.operation_type} (${op.date})`,
    description: op.spot || 'Sem spot',
    value: String(op.id),
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('op::select_add_participant')
      .setPlaceholder('Seleciona a operação')
      .setMinValues(1).setMaxValues(1)
      .addOptions(options.slice(0, 25))
  );

  await safeReply(interaction, { content: 'Em que operação queres adicionar participantes?', components: [row], flags: MessageFlags.Ephemeral });
}

// Step: escolheu operação → mostra UserSelectMenu (multi-select, pesquisa por nome)
async function handleAddParticipantSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const opId = parseInt(interaction.values[0]);
  pendingOpContext.set(interaction.user.id, { opId, action: 'add_participant' });

  const userMenu = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`op::user_select_participants::${opId}`)
      .setPlaceholder('Procura e selecciona membros (até 25)')
      .setMinValues(1)
      .setMaxValues(25)
  );

  await safeUpdate(interaction, {
    content: `Operação **#${opId}** — selecciona os participantes (podes pesquisar por nome).`,
    components: [userMenu],
  });
}

// Step: utilizadores escolhidos → adiciona todos com defaults
async function handleParticipantUsersSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});

  const parts = interaction.customId.split('::');
  const opId = parseInt(parts[2]);
  if (!opId) return safeReply(interaction, { content: 'Operação inválida.', flags: MessageFlags.Ephemeral }, { dismissible: true });

  const userIds = interaction.values || [];
  if (!userIds.length) return safeReply(interaction, { content: 'Nenhum membro seleccionado.', flags: MessageFlags.Ephemeral }, { dismissible: true });

  const added = [];
  const errors = [];
  for (const uid of userIds) {
    try {
      await opEngine.addParticipant(opId, uid, {
        roleInOp: 'membro',
        broughtOwn: false,
        receivedOrg: false,
        notes: '',
      }, interaction.user.id);
      added.push(uid);
    } catch (e) {
      errors.push(`<@${uid}> — ${e.message}`);
    }
  }

  pendingOpContext.delete(interaction.user.id);

  const lines = [];
  if (added.length) {
    lines.push(`**${added.length}** participante(s) adicionado(s) à Operação **#${opId}**:`);
    lines.push(added.map(u => `<@${u}>`).join(', '));
  }
  if (errors.length) {
    lines.push('');
    lines.push('**Falhas:**');
    lines.push(...errors);
  }

  const embed = successEmbed('Participantes Adicionados', lines.join('\n'));
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral }, { dismissible: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTAR MATERIAL EM OPERAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

async function handleRegisterMaterialButton(interaction) {
  if (!isChefia(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('registar material em operações'), flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const openOps = await operationRepo.findOpen();
  if (!openOps.length) {
    return safeReply(interaction, { content: 'Sem operações abertas.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const options = openOps.map(op => ({
    label: `#${op.id} — ${op.operation_type}`,
    description: op.spot || 'Sem spot',
    value: String(op.id),
  }));

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('op::select_material_op')
      .setPlaceholder('Seleciona a operação')
      .setMinValues(1).setMaxValues(1)
      .addOptions(options.slice(0, 25))
  );

  await safeReply(interaction, { content: 'Material para que operação?', components: [row], flags: MessageFlags.Ephemeral });
}

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
      .setMinValues(1).setMaxValues(1)
      .addOptions(directionOptions)
  );

  await safeUpdate(interaction, {
    content: `Operação **#${opId}** — que tipo de registo de material?`,
    components: [row],
  });
}

async function handleMaterialDirectionSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const direction = interaction.values[0];
  const ctx = pendingOpContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return safeReply(interaction, { content: 'Sessão expirada.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  ctx.direction = direction;
  pendingOpContext.set(interaction.user.id, ctx);

  const menu = await buildItemSelectMenu('op::select_material_item', 'Seleciona o material');
  await safeUpdate(interaction, {
    content: `Que material foi **${direction}**?`,
    components: [menu],
  });
}

async function handleMaterialItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const ctx = pendingOpContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'material_op') {
    return safeReply(interaction, { content: 'Sessão expirada.', flags: MessageFlags.Ephemeral }, { dismissible: true });
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
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder('Ex: 10')
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
    return safeReply(interaction, { content: 'Sessão expirada.' }, { dismissible: true });
  }

  const quantityStr = getModalField(interaction, 'quantity');
  const notes = getModalField(interaction, 'notes');
  const quantity = parseInt(quantityStr);

  if (isNaN(quantity) || quantity <= 0) {
    return safeReply(interaction, { content: MESSAGES.INVALID_QUANTITY() }, { dismissible: true });
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
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
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
  handleParticipantUsersSelect,
  handleRegisterMaterialButton,
  handleMaterialOpSelect,
  handleMaterialDirectionSelect,
  handleMaterialItemSelect,
  handleMaterialQtyModal,
  pendingOpContext,
};
