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
    const closed = await opEngine.closeOperation(ctx.opId, {
      had_fight: hadFight,
      enemy_name: enemy,
      deaths,
      survivors,
      result_notes: resultNotes,
    }, interaction.user.id);

    // Reconciliação já foi calculada dentro de closeOperation
    const r = closed?.reconciliation || {};

    // Próximo passo: marcar mortos nominais (quem morreu + auto-registar material
    // fornecido como perdido). Se não houve fight/mortes, pulamos.
    if (hadFight && deaths > 0) {
      const participants = await operationRepo.getParticipants(ctx.opId);
      if (participants.length) {
        ctx.closed = true;
        pendingOpContext.set(interaction.user.id, ctx);

        const options = participants.slice(0, 25).map(p => ({
          label: `${p.display_name || p.discord_id}`.slice(0, 100),
          description: p.role_in_op || 'membro',
          value: p.discord_id,
        }));
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`op::mark_dead::${ctx.opId}`)
            .setPlaceholder('Marca quem morreu (multi-select)')
            .setMinValues(0).setMaxValues(Math.min(options.length, 25))
            .addOptions(options)
        );

        const summary = [
          `Operação **#${ctx.opId}** fechada.`,
          `Fight contra **${enemy || 'desconhecido'}** — ${deaths} mortes, ${survivors} sobreviventes.`,
          r.unaccounted > 0 ? `\n⚠️ **${r.unaccounted}** unidades de material por contabilizar.` : '',
          '\n**Marca quem dos participantes morreu** (o material fornecido a essas pessoas é auto-registado como perda):',
        ].filter(Boolean).join('\n');

        return safeReply(interaction, { content: summary, components: [row] }, { dismissible: true });
      }
    }

    pendingOpContext.delete(interaction.user.id);
    const lines = [`✅ Operação **#${ctx.opId}** fechada.`];
    lines.push(`📦 Material — fornecido: ${r.fornecido || 0}, devolvido: ${r.devolvido || 0}, perdido: ${r.perdido || 0}, consumido: ${r.consumido || 0}.`);
    if (r.unaccounted > 0) {
      lines.push(`⚠️ **${r.unaccounted}** unidades por contabilizar.`);
    }
    const embed = successEmbed('Operação Concluída', lines.join('\n'));
    return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
  } catch (e) {
    return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MARCAR MORTOS (após modal de fecho)
// Para cada participante seleccionado:
//   - marca participant.died=true, survived=false, returned=false
//   - se recebeu material da org (fornecido), regista esse material como
//     perda_operacao via settleParticipantCustody(... diedWithItems=[...])
// ═══════════════════════════════════════════════════════════════════════════

async function handleMarkDeadSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferUpdate().catch(() => {});

  const parts = interaction.customId.split('::');
  const opId = parseInt(parts[2]);
  const deadIds = interaction.values || [];

  if (!deadIds.length) {
    // Ninguém morreu — apenas fecha a UI
    pendingOpContext.delete(interaction.user.id);
    return safeReply(interaction, { content: `Operação #${opId} — nenhum morto marcado.`, flags: MessageFlags.Ephemeral }, { dismissible: true });
  }

  const report = [];
  for (const discordId of deadIds) {
    try {
      // Material fornecido nominal a este participante (direction=fornecido, memberId=X)
      const { query } = require('../db');
      const res = await query(
        `SELECT om.item_id, om.quantity
           FROM operation_materials om
           JOIN members m ON m.id = om.member_id
          WHERE om.operation_id = $1 AND om.direction = 'fornecido' AND m.discord_id = $2`,
        [opId, discordId]
      );
      const diedWithItems = res.rows.map(r => ({ itemId: r.item_id, qty: r.quantity }));

      // settleParticipantCustody regista tudo como perdido + marca died=true
      await opEngine.settleParticipantCustody(opId, discordId, {
        diedWithItems, died: true, survived: false, returned: false,
      }, interaction.user.id);

      report.push(`☠️ <@${discordId}> — ${diedWithItems.length ? `${diedWithItems.length} item(s) registado(s) como perda` : 'sem material fornecido'}`);
    } catch (e) {
      report.push(`❌ <@${discordId}> — erro: ${e.message}`);
    }
  }

  pendingOpContext.delete(interaction.user.id);
  const lines = [`Operação **#${opId}** — custódia liquidada:`, ...report];
  return safeReply(interaction, { content: lines.join('\n').slice(0, 1900), flags: MessageFlags.Ephemeral }, { dismissible: true });
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

// ═══════════════════════════════════════════════════════════════════════════
// FORNECER MATERIAL A PARTICIPANTE (custódia nominal)
// Flow: op → participante (UserSelect das pessoas da op) → item → qty modal
// Chama opEngine.issueMaterialToParticipant — cria movimento fornecimento_org
// nominal e marca participant.received_org_material=true + material_source='org'.
// ═══════════════════════════════════════════════════════════════════════════

async function handleIssueToParticipantButton(interaction) {
  if (!isChefia(interaction.member) && !isOficial(interaction.member)) {
    return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('fornecer material'), flags: MessageFlags.Ephemeral }, { dismissible: true });
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
      .setCustomId('op::issue_select_op')
      .setPlaceholder('Seleciona a operação')
      .setMinValues(1).setMaxValues(1)
      .addOptions(options.slice(0, 25))
  );
  await safeReply(interaction, { content: '🎯 Fornecer material nominal — em que operação?', components: [row], flags: MessageFlags.Ephemeral });
}

async function handleIssueOpSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const opId = parseInt(interaction.values[0]);
  pendingOpContext.set(interaction.user.id, { opId, action: 'issue_to_participant' });

  // Lista participantes já adicionados à op para escolher um
  const participants = await operationRepo.getParticipants(opId);
  if (!participants.length) {
    pendingOpContext.delete(interaction.user.id);
    return safeUpdate(interaction, { content: `Operação **#${opId}** não tem participantes ainda. Adiciona-os primeiro no botão "Participantes".`, components: [] });
  }

  const options = participants.slice(0, 25).map(p => ({
    label: `${p.display_name || p.discord_id}`.slice(0, 100),
    description: p.role_in_op || 'membro',
    value: p.discord_id,
  }));
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('op::issue_select_participant')
      .setPlaceholder('A quem vai o material?')
      .setMinValues(1).setMaxValues(1)
      .addOptions(options)
  );
  await safeUpdate(interaction, { content: `Operação **#${opId}** — escolhe o participante:`, components: [row] });
}

async function handleIssueParticipantSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const discordId = interaction.values[0];
  const ctx = pendingOpContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant') {
    return safeReply(interaction, { content: 'Sessão expirada.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  ctx.participantDiscordId = discordId;
  pendingOpContext.set(interaction.user.id, ctx);

  const menu = await buildItemSelectMenu('op::issue_select_item', 'Que material vai a este participante?');
  await safeUpdate(interaction, { content: `Operação **#${ctx.opId}** → <@${discordId}> — escolhe o item:`, components: [menu] });
}

async function handleIssueItemSelect(interaction) {
  if (isDuplicate(interaction.id)) return;
  const itemId = parseInt(interaction.values[0]);
  const ctx = pendingOpContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant') {
    return safeReply(interaction, { content: 'Sessão expirada.', flags: MessageFlags.Ephemeral }, { dismissible: true });
  }
  ctx.itemId = itemId;
  pendingOpContext.set(interaction.user.id, ctx);

  const { inventoryRepo } = require('../repositories');
  const item = await inventoryRepo.getItemById(itemId);

  const modal = new ModalBuilder()
    .setCustomId('op::issue_modal_qty')
    .setTitle(`Fornecer — ${item?.name || 'Item'}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('quantity').setLabel('Quantidade').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder('Ex: 1')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('notes').setLabel('Observações (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200)
      ),
    );
  await safeShowModal(interaction, modal);
}

async function handleIssueQtyModal(interaction) {
  if (isDuplicate(interaction.id)) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ctx = pendingOpContext.get(interaction.user.id);
  if (!ctx || ctx.action !== 'issue_to_participant') {
    return safeReply(interaction, { content: 'Sessão expirada.' }, { dismissible: true });
  }
  const qty = parseInt(getModalField(interaction, 'quantity'));
  const notes = getModalField(interaction, 'notes');
  if (isNaN(qty) || qty <= 0) return safeReply(interaction, { content: MESSAGES.INVALID_QUANTITY() }, { dismissible: true });

  try {
    await opEngine.issueMaterialToParticipant(ctx.opId, ctx.participantDiscordId, ctx.itemId, qty, interaction.user.id, notes);
    pendingOpContext.delete(interaction.user.id);
    const { inventoryRepo } = require('../repositories');
    const item = await inventoryRepo.getItemById(ctx.itemId);
    const embed = successEmbed('Material Fornecido',
      `🎯 **${qty}x** ${item?.name || 'Item'} → <@${ctx.participantDiscordId}>\nOperação **#${ctx.opId}**${notes ? `\nNotas: ${notes}` : ''}`
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
  // Fase 10 — custódia nominal
  handleIssueToParticipantButton,
  handleIssueOpSelect,
  handleIssueParticipantSelect,
  handleIssueItemSelect,
  handleIssueQtyModal,
  handleMarkDeadSelect,
  pendingOpContext,
};
