'use strict';
const { Client, GatewayIntentBits, Events, REST, Routes, MessageFlags, Collection } = require('discord.js');
const CONFIG = require('./config');
const { pool, acquireInstanceLockWithRetry, releaseInstanceLock } = require('./db');
const { runMigrations } = require('./dbMigrate');
const { log, warn, error } = require('./logger');
const metrics = require('./lib/metrics');
const { commands } = require('./slashCommands');
const { bootstrapAll } = require('./panelBootstrap');
const { seedFromCatalog } = require('./inventory/itemCatalog');
const { startAll: startScheduler, stopAll: stopScheduler } = require('./jobs/scheduler');
const { createServer, setClient: setWebClient } = require('./web/server');

// ── Domain handlers ─────────────────────────────────────────────────────────
const { handleMoradorRoleAdded, handlePromotionToOficial } = require('./onboarding/onboardingEngine');
const { handleMemberCommand, handleMemberHistoryButton, handleMemberTotalsButton } = require('./members/memberHandlers');
const {
  handleRegistarMaterialButton, handleTipoRegistoSelect,
  handleItemSelect, handleQuantityModal,
  handleStockCommand, handleAdjustStockButton,
  handleAdjustSelect, handleAdjustModal,
  handleGerirMateriaisButton, handleGerirActionSelect,
  handleAddItemModal, handleEditItemSelect, handleEditPriceModal,
  handleDeactivateItemSelect, handleReactivateItemSelect,
} = require('./inventory/inventoryHandlers');
const {
  handleCreateOperationButton, handleCreateOperationModal,
  handleCloseOperationButton, handleCloseOperationSelect, handleCloseOperationModal,
  handleViewOperationsButton, handleAddParticipantButton,
  handleAddParticipantSelect, handleAddParticipantModal,
  handleRegisterMaterialButton,
  handleMaterialOpSelect, handleMaterialDirectionSelect,
  handleMaterialItemSelect, handleMaterialQtyModal,
} = require('./operations/operationHandlers');
const { getCurrentWeekRanking, getPreviousWeekRanking } = require('./rankings/rankingEngine');
const { rankingEmbed, brandEmbed, stockEmbed } = require('./shared/embedBuilders');
const { inventoryRepo } = require('./repositories');
const { getRecentLogs, sendAuditToChannel } = require('./audit/auditEngine');
const { isChefia, isChefeMoradores } = require('./permissions/permissionEngine');
const { isDuplicate } = require('./shared/interactionHelpers');
const { safeReply } = require('./shared/interactionHelpers');
const MESSAGES = require('./shared/errorMessages');
const { weekBounds } = require('./util');
const { memberRepo } = require('./repositories');

// ── Discord client ──────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ── Boot ────────────────────────────────────────────────────────────────────
async function boot() {
  log(`[BOOT] Real Gangsta a iniciar...`);

  const locked = await acquireInstanceLockWithRetry(30000);
  if (!locked) {
    error('[BOOT] Não foi possível adquirir lock. Outra instância está a correr.');
    process.exit(1);
  }

  await runMigrations();
  await seedFromCatalog();

  await client.login(CONFIG.DISCORD_BOT_TOKEN);
}

// ── Ready ───────────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  log(`[READY] Logged in as ${client.user.tag}`);
  metrics.discordPingMs.set(client.ws.ping);

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_BOT_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, CONFIG.DISCORD_GUILD_ID),
      { body: commands.map(c => c.toJSON()) }
    );
    log('[READY] Slash commands registados.');
  } catch (e) {
    warn(`[READY] Falha ao registar slash commands: ${e.message}`);
  }

  // Bootstrap panels
  if (CONFIG.PANEL_BOOTSTRAP_ON_READY) {
    await bootstrapAll(client);
  }

  // Start background jobs
  startScheduler(client);

  // Start web server
  setWebClient(client);
  createServer(Number(process.env.PORT) || 3000);

  log('[READY] Real Gangsta operacional.');
});

// ── Role change detection (onboarding/promotion) ────────────────────────────
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    // Morador role added
    if (CONFIG.MORADOR_ROLE_ID && !oldRoles.has(CONFIG.MORADOR_ROLE_ID) && newRoles.has(CONFIG.MORADOR_ROLE_ID)) {
      await handleMoradorRoleAdded(newMember, client);
    }

    // Oficial role added (promotion from morador)
    if (CONFIG.OFICIAL_ROLE_ID && !oldRoles.has(CONFIG.OFICIAL_ROLE_ID) && newRoles.has(CONFIG.OFICIAL_ROLE_ID)) {
      if (oldRoles.has(CONFIG.MORADOR_ROLE_ID)) {
        await handlePromotionToOficial(newMember, client);
      }
    }
  } catch (e) {
    warn(`[ROLE_UPDATE] Error: ${e.message}`);
  }
});

// ── Interaction handler ─────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  metrics.discordEventsTotal.inc();

  try {
    // ── Slash commands ──────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      metrics.commandInvocationsTotal.inc();
      const cmd = interaction.commandName;

      if (cmd === 'rg-setup') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('setup'), flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await bootstrapAll(client);
        return interaction.editReply({ content: 'Painéis configurados com sucesso.' });
      }

      if (cmd === 'rg-sync-panels') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('sync panels'), flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await bootstrapAll(client);
        return interaction.editReply({ content: 'Painéis sincronizados.' });
      }

      if (cmd === 'rg-stock') {
        return handleStockCommand(interaction);
      }

      if (cmd === 'rg-member') {
        return handleMemberCommand(interaction);
      }

      if (cmd === 'rg-top-week') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const semana = interaction.options.getString('semana') || 'current';
        const rankings = semana === 'previous' ? await getPreviousWeekRanking(10) : await getCurrentWeekRanking(10);
        const { start, end } = weekBounds(semana === 'previous' ? new Date(Date.now() - 7 * 86400000) : new Date());
        const weekLabel = `${start.toISOString().split('T')[0]} a ${end.toISOString().split('T')[0]}`;
        const embed = rankingEmbed('Top Semanal', rankings, weekLabel);
        return interaction.editReply({ embeds: [embed] });
      }

      if (cmd === 'rg-create-operation') {
        return handleCreateOperationButton(interaction);
      }

      if (cmd === 'rg-close-operation') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('fechar operação'), flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const opId = interaction.options.getInteger('id');
        const { closeOperation } = require('./operations/operationEngine');
        const op = await closeOperation(opId, {}, interaction.user.id);
        if (!op) return interaction.editReply({ content: MESSAGES.OPERATION_NOT_FOUND() });
        return interaction.editReply({ content: `Operação #${opId} concluída.` });
      }

      if (cmd === 'rg-audit') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('ver logs'), flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const limit = interaction.options.getInteger('limite') || 20;
        const logs = await getRecentLogs(limit);
        if (!logs.length) return interaction.editReply({ content: 'Sem logs recentes.' });
        const lines = logs.map(l => `\`${l.created_at?.toISOString?.()?.split('T')[0] || ''}\` **${l.action}** — ${l.entity_type} — por <@${l.actor_id}>`);
        const embed = brandEmbed().setTitle('Logs de Auditoria').setDescription(lines.slice(0, 20).join('\n'));
        return interaction.editReply({ embeds: [embed] });
      }

      if (cmd === 'rg-items') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const items = await inventoryRepo.getItems(true);
        if (!items.length) return interaction.editReply({ content: 'Catálogo vazio.' });
        const grouped = {};
        for (const item of items) {
          if (!grouped[item.category]) grouped[item.category] = [];
          grouped[item.category].push(item);
        }
        const lines = [];
        for (const [cat, catItems] of Object.entries(grouped)) {
          lines.push(`**${cat.toUpperCase()}**`);
          for (const item of catItems) {
            lines.push(`  ${item.name} — ${item.unit}${item.estimated_value ? ` ($${item.estimated_value})` : ''}`);
          }
        }
        const embed = brandEmbed().setTitle('Catálogo de Materiais').setDescription(lines.join('\n'));
        return interaction.editReply({ embeds: [embed] });
      }

      if (cmd === 'rg-add-item') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('adicionar itens'), flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const nome = interaction.options.getString('nome');
        const categoria = interaction.options.getString('categoria');
        const unidade = interaction.options.getString('unidade') || 'unidade';
        const valor = interaction.options.getNumber('valor') || null;
        const existing = await inventoryRepo.getItemByName(nome);
        if (existing) return interaction.editReply({ content: `Item "${nome}" já existe.` });
        await inventoryRepo.createItem({ name: nome, category: categoria, unit: unidade, estimatedValue: valor });
        return interaction.editReply({ content: `Item **${nome}** adicionado ao catálogo.` });
      }

      return;
    }

    // ── Button interactions ─────────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Morador / Oficial — registar material (entrega ou venda)
      if (id === 'morador::registar_material') return handleRegistarMaterialButton(interaction);
      if (id === 'morador::historico') return handleMemberHistoryButton(interaction);
      if (id === 'morador::totais') return handleMemberTotalsButton(interaction);

      // Oficial buttons
      if (id === 'oficial::ver_operacoes') return handleViewOperationsButton(interaction);

      // Chefia buttons
      if (id === 'chefia::criar_operacao') return handleCreateOperationButton(interaction);
      if (id === 'chefia::fechar_operacao') return handleCloseOperationButton(interaction);
      if (id === 'chefia::ver_operacoes') return handleViewOperationsButton(interaction);
      if (id === 'chefia::registar_material_op') return handleRegisterMaterialButton(interaction);
      if (id === 'chefia::ver_stock') return handleStockCommand(interaction);
      if (id === 'chefia::ajustar_stock') return handleAdjustStockButton(interaction);
      if (id === 'chefia::gerir_materiais') return handleGerirMateriaisButton(interaction);

      if (id === 'chefia::ver_tops') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const rankings = await getCurrentWeekRanking(10);
        const { start, end } = weekBounds();
        const weekLabel = `${start.toISOString().split('T')[0]} a ${end.toISOString().split('T')[0]}`;
        const embed = rankingEmbed('Top Semanal', rankings, weekLabel);
        return interaction.editReply({ embeds: [embed] });
      }

      if (id === 'chefia::ver_logs') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('ver logs'), flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const logs = await getRecentLogs(15);
        if (!logs.length) return interaction.editReply({ content: 'Sem logs.' });
        const lines = logs.map(l => `\`${l.created_at?.toISOString?.()?.split('T')[0] || ''}\` **${l.action}** — ${l.entity_type}`);
        const embed = brandEmbed().setTitle('Logs Recentes').setDescription(lines.join('\n'));
        return interaction.editReply({ embeds: [embed] });
      }

      // Chefe de Moradores buttons
      if (id === 'chefe_mor::listar_moradores') {
        if (!isChefeMoradores(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('listar moradores'), flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const moradores = await memberRepo.findByRole('morador');
        if (!moradores.length) return interaction.editReply({ content: 'Sem moradores registados.' });
        const lines = moradores.map(m => `<@${m.discord_id}> — ${m.display_name} (desde ${m.joined_at?.toISOString?.()?.split('T')[0] || '-'})`);
        const embed = brandEmbed().setTitle('Moradores').setDescription(lines.join('\n'));
        return interaction.editReply({ embeds: [embed] });
      }

      if (id === 'chefe_mor::ver_entregas' || id === 'chefe_mor::ver_vendas') {
        if (!isChefeMoradores(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('ver dados'), flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const type = id.includes('entregas') ? 'entrega_morador' : 'venda_morador';
        const label = id.includes('entregas') ? 'Entregas' : 'Vendas';
        const { query } = require('./db');
        const res = await query(`
          SELECT m.display_name, m.discord_id, SUM(im.quantity) as total
          FROM inventory_movements im
          JOIN members m ON m.id = im.member_id
          WHERE im.movement_type = $1
          GROUP BY m.display_name, m.discord_id
          ORDER BY total DESC LIMIT 20
        `, [type]);
        if (!res.rows.length) return interaction.editReply({ content: `Sem ${label.toLowerCase()} registadas.` });
        const lines = res.rows.map((r, i) => `**${i + 1}.** <@${r.discord_id}> — ${r.total} unidades`);
        const embed = brandEmbed().setTitle(`${label} por Morador`).setDescription(lines.join('\n'));
        return interaction.editReply({ embeds: [embed] });
      }

      if (id === 'chefe_mor::ver_tops') {
        if (!isChefeMoradores(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('ver tops'), flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { rankingRepo } = require('./repositories');
        const { start, end } = weekBounds();
        const weekStart = start.toISOString().split('T')[0];
        const rankings = await rankingRepo.getWeekRankingByRole(weekStart, 'morador', 10);
        const weekLabel = `${start.toISOString().split('T')[0]} a ${end.toISOString().split('T')[0]}`;
        const embed = rankingEmbed('Top Moradores', rankings, weekLabel);
        return interaction.editReply({ embeds: [embed] });
      }

      return;
    }

    // ── Select menu interactions ────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      // Inventory — registo de material
      if (id === 'inv::select_tipo_registo') return handleTipoRegistoSelect(interaction);
      if (id === 'inv::select_item_entrega' || id === 'inv::select_item_venda') return handleItemSelect(interaction);
      if (id === 'inv::select_ajuste') return handleAdjustSelect(interaction);

      // Inventory — gestão de materiais (chefia)
      if (id === 'inv::select_gerir_action') return handleGerirActionSelect(interaction);
      if (id === 'inv::select_edit_item') return handleEditItemSelect(interaction);
      if (id === 'inv::select_deactivate_item') return handleDeactivateItemSelect(interaction);
      if (id === 'inv::select_reactivate_item') return handleReactivateItemSelect(interaction);

      // Operations
      if (id === 'op::select_close') return handleCloseOperationSelect(interaction);
      if (id === 'op::select_add_participant') return handleAddParticipantSelect(interaction);
      if (id === 'op::select_material_op') return handleMaterialOpSelect(interaction);
      if (id === 'op::select_material_direction') return handleMaterialDirectionSelect(interaction);
      if (id === 'op::select_material_item') return handleMaterialItemSelect(interaction);

      return;
    }

    // ── Modal submissions ───────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // Inventory modals
      if (id === 'inv::modal_entrega_morador' || id === 'inv::modal_venda_morador') return handleQuantityModal(interaction);
      if (id === 'inv::modal_ajuste_manual') return handleAdjustModal(interaction);
      if (id === 'inv::modal_add_item') return handleAddItemModal(interaction);
      if (id === 'inv::modal_edit_price') return handleEditPriceModal(interaction);

      // Operation modals
      if (id === 'op::modal_create') return handleCreateOperationModal(interaction);
      if (id === 'op::modal_close') return handleCloseOperationModal(interaction);
      if (id === 'op::modal_add_participant') return handleAddParticipantModal(interaction);
      if (id === 'op::modal_material_qty') return handleMaterialQtyModal(interaction);

      return;
    }
  } catch (e) {
    error(`[INTERACTION] Unhandled error: ${e.message}`, e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Ocorreu um erro interno.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

// ── Graceful shutdown ───────────────────────────────────────────────────────
async function shutdown(signal) {
  log(`[SHUTDOWN] ${signal} received. Shutting down...`);
  stopScheduler();
  client.destroy();
  await releaseInstanceLock();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  error('[UNHANDLED REJECTION]', reason);
});

// ── Start ───────────────────────────────────────────────────────────────────
boot().catch((e) => {
  error('[BOOT] Fatal error:', e);
  process.exit(1);
});
