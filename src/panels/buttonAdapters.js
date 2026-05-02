'use strict';
/**
 * Button adapters — mapeia novos customIds de painel para lógica existente.
 * Reutiliza handlers de slash commands e queries sem duplicar código.
 */

const {
  ModalBuilder,
  TextInputBuilder,
  ActionRowBuilder,
  TextInputStyle,
  MessageFlags,
  StringSelectMenuBuilder,
} = require('discord.js');
const { safeReply, safeShowModal } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');
const { EMOJI } = require('../content');

// ── Consultas simples (reutilizam handlers de /queries) ─────────────────────

async function handleCatalogoButton(interaction) {
  const { handle } = require('../queries/catalogo');
  return handle(interaction);
}

async function handlePrecariosButton(interaction) {
  const { handlePrecariosButton: handler } = require('../prices/priceListInteractive');
  return handler(interaction);
}

async function handleMinhasSaidasButton(interaction) {
  const { handle } = require('../queries/saidasMinhas');
  interaction.options = { getInteger: () => null, getSubcommand: () => null };
  return handle(interaction);
}

async function handleMeuResumoButton(interaction) {
  const { handle } = require('../queries/meuResumo');
  return handle(interaction);
}

async function handlePainelPendenciasButton(interaction) {
  const { handle } = require('../queries/painelPendencias');
  return handle(interaction);
}

async function handleRelatorioButton(interaction) {
  const { handle } = require('../queries/relatorio');
  interaction.options = {
    getString: () => 'week',
    getSubcommand: () => null,
  };
  return handle(interaction);
}

async function handleDashboardButton(interaction) {
  const { handle } = require('../queries/dashboard');
  return handle(interaction);
}

async function handleInactivosButton(interaction) {
  const { handle } = require('../queries/inactivosBairristas');
  interaction.options = {
    getInteger: name => (name === 'dias_sem_actividade' ? 30 : 14),
    getSubcommand: () => null,
  };
  return handle(interaction);
}

async function handleSyncSheetsButton(interaction) {
  const { handle } = require('../queries/syncSheets');
  interaction.options = {
    getString: name => (name === 'acao' ? 'status' : null),
    getSubcommand: () => null,
  };
  return handle(interaction);
}

// ── Acções com modal ────────────────────────────────────────────────────────

async function handleVenderButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('adapter::modal_vender')
    .setTitle('Vender Material')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('item')
          .setLabel('Item (nome)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: AK-47')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantidade')
          .setLabel('Quantidade')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: 10')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('preco')
          .setLabel('Preço por unidade (€) — opcional')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Deixa vazio para usar catálogo')
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nota')
          .setLabel('Nota — opcional')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Nota adicional...')
          .setRequired(false)
      )
    );
  return safeShowModal(interaction, modal);
}

async function handleKillButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('kill::modal')
    .setTitle('Registar Kill')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('victim')
          .setLabel('Vítima (nome ou descrição)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Rival da Ballas')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('context')
          .setLabel('Contexto — opcional')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Ex: Saída na Grove, arma usada...')
          .setRequired(false)
      )
    );
  return safeShowModal(interaction, modal);
}

async function handleAusenciaButton(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('adapter::modal_ausencia')
    .setTitle('Submeter Ausência')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('inicio')
          .setLabel('Data início (YYYY-MM-DD)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('2024-06-01')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('fim')
          .setLabel('Data fim (YYYY-MM-DD)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('2024-06-07')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('motivo')
          .setLabel('Motivo — opcional')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Motivo da ausência...')
          .setRequired(false)
      )
    );
  return safeShowModal(interaction, modal);
}

async function handleCriarIncidenteButton(interaction) {
  if (!(await requirePermission(interaction, { minRole: 'OG' }))) return;
  const modal = new ModalBuilder()
    .setCustomId('adapter::modal_criar_incidente')
    .setTitle('Criar Incidente')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('titulo')
          .setLabel('Título')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Desaparecimento de stock')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('descricao')
          .setLabel('Descrição — opcional')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Descreve o incidente...')
          .setRequired(false)
      )
    );
  return safeShowModal(interaction, modal);
}

async function handleTransferirStockButton(interaction) {
  if (!(await requirePermission(interaction, { minRole: 'OG' }))) return;
  const modal = new ModalBuilder()
    .setCustomId('adapter::modal_transferir')
    .setTitle('Transferir Stock')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('item')
          .setLabel('Item (nome)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: AK-47')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('quantidade')
          .setLabel('Quantidade')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('10')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('origem')
          .setLabel('Origem (armazem/grupo)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('armazem')
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('destino')
          .setLabel('Destino (armazem/grupo)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('grupo')
          .setRequired(true)
      )
    );
  return safeShowModal(interaction, modal);
}

// ── Delegação para handlers existentes ──────────────────────────────────────

async function handleFecharSaidaButton(interaction) {
  const { handleCloseSaidaButton } = require('../saidas/saidaHandlers');
  return handleCloseSaidaButton(interaction);
}

async function handleEmitirMaterialButton(interaction) {
  const { handleIssueToParticipantButton } = require('../saidas/saidaHandlers');
  return handleIssueToParticipantButton(interaction);
}

async function handleAddParticipanteButton(interaction) {
  const { handleAddParticipantButton } = require('../saidas/saidaHandlers');
  return handleAddParticipantButton(interaction);
}

async function handleEntregarMaterialButton(interaction) {
  const { handleRegistarMaterialButton } = require('../inventory/inventoryHandlers');
  return handleRegistarMaterialButton(interaction);
}

// ── Modal submits ───────────────────────────────────────────────────────────

async function handleVenderModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { SANITY_MAX_QTY } = require('../shared/constants');
  const item = interaction.fields.getTextInputValue('item');
  const qty = parseInt(interaction.fields.getTextInputValue('quantidade'), 10);
  const preco = interaction.fields.getTextInputValue('preco') || null;
  const nota = interaction.fields.getTextInputValue('nota') || null;

  if (!item || !qty || qty < 1 || qty > SANITY_MAX_QTY) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INDISPONIVEL} Quantidade inválida. Máximo: ${SANITY_MAX_QTY.toLocaleString('pt-PT')}.` },
      { messageClass: 'BANAL' }
    );
  }

  // Reutiliza a lógica de /venda via inventoryEngine
  const { inventoryEngine } = require('../inventory/inventoryEngine');
  try {
    await inventoryEngine.registerSale({
      memberId: interaction.user.id,
      itemName: item,
      quantity: qty,
      price: preco ? parseFloat(preco) : null,
      note: nota,
    });

    return safeReply(
      interaction,
      { content: `${EMOJI.OK} Venda registada: **${qty}x ${item}**` },
      { messageClass: 'BANAL' }
    );
  } catch (e) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INDISPONIVEL} ${e.message || 'Erro ao registar venda.'}` },
      { messageClass: 'BANAL' }
    );
  }
}

async function handleAusenciaModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const inicio = interaction.fields.getTextInputValue('inicio');
  const fim = interaction.fields.getTextInputValue('fim');
  const motivo = interaction.fields.getTextInputValue('motivo') || null;

  const { absenceRepo } = require('../repositories');
  await absenceRepo.create({
    discordId: interaction.user.id,
    startDate: inicio,
    endDate: fim,
    reason: motivo,
    status: 'pending',
  });

  return safeReply(
    interaction,
    { content: `${EMOJI.OK} Ausência submetida: **${inicio}** a **${fim}**. Aguarda aprovação.` },
    { messageClass: 'BANAL' }
  );
}

async function handleCriarIncidenteModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const titulo = interaction.fields.getTextInputValue('titulo');
  const descricao = interaction.fields.getTextInputValue('descricao') || null;

  const { incidentRepo } = require('../repositories');
  const inc = await incidentRepo.create({
    title: titulo,
    description: descricao,
    severity: 'medium',
    state: 'open',
    source: 'panel',
    createdBy: interaction.user.id,
  });

  return safeReply(
    interaction,
    { content: `${EMOJI.OK} Incidente \`#${inc.id}\` criado: **${titulo}**` },
    { messageClass: 'BANAL' }
  );
}

async function handleTransferirModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { SANITY_MAX_QTY } = require('../shared/constants');
  const item = interaction.fields.getTextInputValue('item');
  const qty = parseInt(interaction.fields.getTextInputValue('quantidade'), 10);
  const origem = interaction.fields.getTextInputValue('origem');
  const destino = interaction.fields.getTextInputValue('destino');

  if (!item || !qty || qty < 1 || qty > SANITY_MAX_QTY) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INDISPONIVEL} Quantidade inválida. Máximo: ${SANITY_MAX_QTY.toLocaleString('pt-PT')}.` },
      { messageClass: 'BANAL' }
    );
  }

  const { inventoryEngine } = require('../inventory/inventoryEngine');
  try {
    await inventoryEngine.transferStock({
      itemName: item,
      quantity: qty,
      from: origem,
      to: destino,
      actorId: interaction.user.id,
    });

    return safeReply(
      interaction,
      { content: `${EMOJI.OK} Transferido **${qty}x ${item}** de **${origem}** → **${destino}**.` },
      { messageClass: 'BANAL' }
    );
  } catch (e) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INDISPONIVEL} ${e.message || 'Erro na transferência.'}` },
      { messageClass: 'BANAL' }
    );
  }
}

async function handlePromoverButton(interaction) {
  if (!(await requirePermission(interaction, { minRole: 'OG' }))) return;
  const { query } = require('../db');

  const members = await query(`
    SELECT id, discord_id, display_name, role
    FROM members
    WHERE status = 'ativo'
    ORDER BY display_name NULLS LAST
    LIMIT 25
  `);

  if (members.rows.length === 0) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INDISPONIVEL} Nenhum membro activo encontrado.` },
      { messageClass: 'BANAL' }
    );
  }

  const options = members.rows.map(m => ({
    label: m.display_name || m.discord_id,
    value: m.discord_id,
    description: `Cargo actual: ${m.role || '—'}`,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('adapter::select_promover_membro')
    .setPlaceholder('Escolhe o membro a promover...')
    .setOptions(options);

  return safeReply(
    interaction,
    {
      content: `${EMOJI.PROGRESSO} **Promover Membro** — passo 1 de 3`,
      components: [new ActionRowBuilder().addComponents(select)],
    },
    { messageClass: 'BANAL' }
  );
}

async function handlePromoverMembroSelect(interaction) {
  const discordId = interaction.values[0];
  const CARGOS = [
    { label: 'Bairrista', value: 'bairrista' },
    { label: 'Oficial', value: 'oficial' },
    { label: 'Patrão di Zona', value: 'patrao_di_zona' },
    { label: 'Chefia', value: 'chefia' },
    { label: 'Inactivo', value: 'inativo' },
  ];

  const select = new StringSelectMenuBuilder()
    .setCustomId(`adapter::select_promover_cargo::${discordId}`)
    .setPlaceholder('Escolhe o novo cargo...')
    .setOptions(CARGOS.map(c => ({ label: c.label, value: c.value, description: `Novo cargo: ${c.label}` })));

  return safeReply(
    interaction,
    {
      content: `${EMOJI.PROGRESSO} **Promover Membro** — passo 2 de 3`,
      components: [new ActionRowBuilder().addComponents(select)],
    },
    { messageClass: 'BANAL' }
  );
}

async function handlePromoverCargoSelect(interaction) {
  const cargo = interaction.values[0];
  const discordId = interaction.customId.split('::')[3];

  const modal = new ModalBuilder()
    .setCustomId(`adapter::modal_promover::${discordId}::${cargo}`)
    .setTitle('Promover Membro')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('motivo')
          .setLabel('Motivo — opcional')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Motivo da promoção...')
          .setRequired(false)
      )
    );
  return safeShowModal(interaction, modal);
}

async function handlePromoverModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const parts = interaction.customId.split('::');
  const memberIdInput = parts.length >= 5 ? parts[3] : interaction.fields.getTextInputValue('member_id');
  const cargo = parts.length >= 5 ? parts[4] : interaction.fields.getTextInputValue('cargo');
  const motivo = interaction.fields.getTextInputValue('motivo') || '';

  const guildMember = await interaction.guild.members.fetch(memberIdInput).catch(() => null);
  if (!guildMember) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INDISPONIVEL} Membro não encontrado no servidor.` },
      { messageClass: 'BANAL' }
    );
  }

  const { memberRepo } = require('../repositories');
  const dbMember = await memberRepo.findByDiscordId(guildMember.id);
  if (!dbMember) {
    return safeReply(
      interaction,
      { content: `${EMOJI.INDISPONIVEL} Membro não encontrado na base de dados.` },
      { messageClass: 'BANAL' }
    );
  }

  try {
    const { promoteMember } = require('../members/promotionEngine');
    await promoteMember(dbMember.id, cargo, {
      guildMember,
      client: interaction.client,
      reason: motivo,
      actorTag: interaction.user.tag,
      actorId: interaction.user.id,
      changedBy: interaction.user.id,
    });
    return safeReply(
      interaction,
      {
        content: `${EMOJI.OK} **${guildMember.displayName}** promovido para **${cargo}**${motivo ? ` — ${motivo}` : ''}`,
      },
      { messageClass: 'BANAL' }
    );
  } catch (e) {
    return safeReply(interaction, { content: `${EMOJI.INDISPONIVEL} Erro: ${e.message}` }, { messageClass: 'BANAL' });
  }
}

async function handleChefiaAusenciasButton(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });
  const { query } = require('../db');
  const { brandEmbed } = require('../shared/embedBuilders');

  const result = await query(`
    SELECT m.display_name, a.start_date, a.end_date, a.reason
    FROM member_absences a
    JOIN members m ON m.id = a.member_id
    WHERE a.status = 'approved' AND CURRENT_DATE BETWEEN a.start_date AND a.end_date
    ORDER BY a.end_date DESC
  `);

  const embed = brandEmbed('MOVEMENT')
    .setTitle(`${EMOJI.PENDENTE} Ausências Activas`)
    .setDescription('Membros em ausência no momento:');

  if (result.rows.length === 0) {
    embed.addFields({ name: 'Tudo em ordem', value: 'Nenhum membro em ausência activa.' });
  } else {
    const lines = result.rows.map(r => {
      const reason = r.reason ? ` — *${r.reason}*` : '';
      return `• **${r.display_name}**: ${r.start_date} → ${r.end_date}${reason}`;
    });
    embed.addFields({ name: `${result.rows.length} membro(s)`, value: lines.join('\n') });
  }

  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = {
  // Consultas
  handleCatalogoButton,
  handlePrecariosButton,
  handleMinhasSaidasButton,
  handleMeuResumoButton,
  handlePainelPendenciasButton,
  handleRelatorioButton,
  handleDashboardButton,
  handleInactivosButton,
  handleSyncSheetsButton,
  // Modais (abrir)
  handleVenderButton,
  handleKillButton,
  handleAusenciaButton,
  handleCriarIncidenteButton,
  handleTransferirStockButton,
  handleChefiaAusenciasButton,
  // Delegação
  handleFecharSaidaButton,
  handleEmitirMaterialButton,
  handleAddParticipanteButton,
  handleEntregarMaterialButton,
  // Modal submits
  handleVenderModalSubmit,
  handleAusenciaModalSubmit,
  handleCriarIncidenteModalSubmit,
  handleTransferirModalSubmit,
  handlePromoverButton,
  handlePromoverMembroSelect,
  handlePromoverCargoSelect,
  handlePromoverModalSubmit,
};
