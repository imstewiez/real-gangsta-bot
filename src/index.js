'use strict';
const { Client, GatewayIntentBits, Events, REST, Routes, MessageFlags } = require('discord.js');
const CONFIG = require('./config');
const { pool, acquireInstanceLockWithRetry, releaseInstanceLock } = require('./db');
const { runMigrations } = require('./dbMigrate');
const {
  ensureInstanceTable, cleanupStaleInstances, registerInstance,
  startHeartbeat, deregisterInstance, getCurrentInstance,
} = require('./instanceCoordinator');
const { log, warn, error, startLogMaintenance, stopLogMaintenance } = require('./logger');
const metrics = require('./lib/metrics');
const { commands } = require('./slashCommands');
const { bootstrapAll } = require('./panelBootstrap');
const { seedFromCatalog } = require('./inventory/itemCatalog');
const { startAll: startScheduler, stopAll: stopScheduler } = require('./jobs/scheduler');
const { createServer, setClient: setWebClient } = require('./web/server');

// ── Domain handlers ─────────────────────────────────────────────────────────
const { handlePromotionToOficial } = require('./onboarding/onboardingEngine');
const {
  handlePedirTagButton, handleTagModal, handleApproveButton, handleDenyButton,
} = require('./onboarding/onboardingHandlers');
const {
  handleMemberCommand, handleMemberHistoryButton, handleMemberTotalsButton,
  handleProgressButton, handleTopSemanalButton,
} = require('./members/memberHandlers');
const {
  handleRegistarMaterialButton, handleTipoRegistoSelect,
  handleItemSelect, handleQuantityModal,
  handleStockCommand, handleAdjustStockButton,
  handleAdjustSelect, handleAdjustModal,
  handleGerirMateriaisButton, handleGerirActionSelect,
  handleAddItemModal, handleEditItemSelect, handleEditPriceModal,
  handleDeactivateItemSelect, handleReactivateItemSelect,
  handleEncomendasButton, handleEncomendaSelect, handleEncomendaModal,
} = require('./inventory/inventoryHandlers');
const {
  handleCreateOperationButton, handleCreateOperationModal,
  handleCloseOperationButton, handleCloseOperationSelect, handleCloseOperationModal,
  handleViewOperationsButton, handleAddParticipantButton,
  handleAddParticipantSelect, handleParticipantUsersSelect,
  handleRegisterMaterialButton,
  handleMaterialOpSelect, handleMaterialDirectionSelect,
  handleMaterialItemSelect, handleMaterialQtyModal,
  handleIssueToParticipantButton, handleIssueOpSelect,
  handleIssueParticipantSelect, handleIssueItemSelect, handleIssueQtyModal,
  handleMarkDeadSelect,
} = require('./operations/operationHandlers');
const { getCurrentWeekRanking, getPreviousWeekRanking } = require('./rankings/rankingEngine');
const { rankingEmbed, brandEmbed, stockEmbed } = require('./shared/embedBuilders');
const { inventoryRepo } = require('./repositories');
const { getRecentLogs, sendAuditToChannel } = require('./audit/auditEngine');
const {
  isChefia, isChefeMoradores,
  canManageStructure, canRegisterKill,
} = require('./permissions/permissionEngine');
const { runPermsOnly } = require('./discord/structureSync');
const { availabilityRepo, radioRepo, stickyRepo } = require('./repositories');
const {
  handleVoteSelect: availHandleVoteSelect,
  handleVoteAll: availHandleVoteAll,
  handleSummary: availHandleSummary,
  handleRefresh: availHandleRefresh,
} = require('./availability/availabilityHandlers');
const {
  setSticky, removeSticky, refresh: stickyRefresh,
  onMessageCreate: stickyOnMessage, listRenderers: stickyListRenderers,
} = require('./sticky/stickyEngine');
const { registerBuiltinRenderers } = require('./sticky/stickyRenderers');
const { setClient: setStockClient } = require('./inventory/stockNotifier');
const {
  handleRandom: radioHandleRandom,
  handleSet: radioHandleSet,
  handleSetModal: radioHandleSetModal,
  handleSwap: radioHandleSwap,
  handleHistory: radioHandleHistory,
  handleRefresh: radioHandleRefresh,
} = require('./radio/radioHandlers');
const {
  handleRegisterKillButton, handleKillModal, handleLeaderboardButton,
} = require('./cemetery/cemeteryHandlers');
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
  log(`[BOOT] ${CONFIG.BOT_INTERNAL_NAME} a iniciar...`);

  // Limpa sessões velhas e inicia rotação periódica do log principal.
  startLogMaintenance();

  // Subir o web server o mais cedo possível — a healthcheck da plataforma
  // precisa de 200 em /health para autorizar o Railway a matar o container
  // anterior; só assim o lock singleton fica livre para esta nova instância.
  createServer(Number(process.env.PORT) || 3000);

  // 1. Garantir tabela de instâncias (idempotente) e limpar linhas stale.
  await ensureInstanceTable();
  await cleanupStaleInstances();

  // 2. Registar esta instância — o started_at serve de sinal de preempção para
  //    qualquer instância mais antiga ainda a correr.
  await registerInstance();

  // 3. Adquirir o lock singleton (retry longo para dar tempo à instância
  //    antiga detectar a preempção e fazer graceful shutdown).
  const locked = await acquireInstanceLockWithRetry(90000);
  if (!locked) {
    error('[BOOT] Não foi possível adquirir lock após 90s. A abortar.');
    await deregisterInstance('lock_timeout').catch(() => {});
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

  // Renderers de sticky têm de estar registados antes de qualquer refresh.
  registerBuiltinRenderers();

  // Stock notifier precisa do client para auto-discover/criar canais.
  setStockClient(client);

  // Bootstrap panels
  if (CONFIG.PANEL_BOOTSTRAP_ON_READY) {
    await bootstrapAll(client);
  }

  // Start background jobs
  startScheduler(client);

  // Web server já arrancou em boot(); ligar a referência ao client para /ready.
  setWebClient(client);

  // Start instance heartbeat + preemption watcher
  startHeartbeat((reason) => {
    log(`[INSTANCE] Detectada instância mais recente — shutdown controlado (${reason}).`);
    shutdown(reason).catch((e) => {
      error('[SHUTDOWN] Erro no shutdown por preempção:', e);
      process.exit(0);
    });
  });

  log(`[READY] ${CONFIG.BOT_INTERNAL_NAME} operacional.`);
});

// ── Sticky messages — listener para modo `repost` ───────────────────────────
client.on(Events.MessageCreate, async (message) => {
  try {
    await stickyOnMessage(client, message);
  } catch (e) {
    error(`[STICKY:listener] ${e.message}`);
  }
});

// ── Newcomer joins — auto-atribuir role Pendente ────────────────────────────
// Pendente é o único role que vê boas-vindas; removido ao aprovar tag.
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    if (!CONFIG.AUTO_ASSIGN_PENDENTE) return;
    if (!CONFIG.PENDENTE_ROLE_ID) {
      warn('[MEMBER_ADD] AUTO_ASSIGN_PENDENTE=true mas PENDENTE_ROLE_ID não configurado.');
      return;
    }
    if (member.user.bot) return;
    await member.roles.add(CONFIG.PENDENTE_ROLE_ID, 'Newcomer — atribuir Pendente').catch(e => {
      warn(`[MEMBER_ADD] Falha ao dar Pendente a ${member.id}: ${e.message}`);
    });
    log(`[MEMBER_ADD] Pendente atribuído a ${member.displayName} (${member.id}).`);
  } catch (e) {
    error(`[MEMBER_ADD] ${e.message}`, e);
  }
});

// ── Member leaves — offboarding (arquivar/apagar canal + marcar inactivo) ───
client.on(Events.GuildMemberRemove, async (member) => {
  try {
    const { handleMemberLeave } = require('./onboarding/offboardingEngine');
    await handleMemberLeave(member, client);
  } catch (e) {
    error(`[MEMBER_REMOVE] ${e.message}`, e);
  }
});

// ── Role change detection (onboarding/promotion) ────────────────────────────
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    // Onboarding is now via modal approval (not role-based trigger)
    // Only detect promotion to oficial (for channel archival)

    // Any oficial role added (OG or Real Gangster) — promotion from morador tier
    for (const oficialId of CONFIG.OFICIAL_ROLE_IDS) {
      if (!oldRoles.has(oficialId) && newRoles.has(oficialId)) {
        const wasMorador = CONFIG.ALL_MORADOR_TIER_IDS.some(id => oldRoles.has(id));
        if (wasMorador) {
          await handlePromotionToOficial(newMember, client);
          break;
        }
      }
    }
  } catch (e) {
    error(`[ROLE_UPDATE] Error processing ${newMember?.id}: ${e.message}`, e);
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

      if (cmd === 'rg-sync-panels') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('sync panels'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const results = await bootstrapAll(client);
        const icon = { created: '✅', edited: '✏️', skipped: '⚪', failed: '❌' };
        const lines = ['**Bootstrap painéis** — relatório:'];
        for (const r of results) {
          const i = icon[r.status] || '❔';
          let line = `${i} \`${r.key}\` — ${r.status}`;
          if (r.channelId) line += ` em <#${r.channelId}>`;
          if (r.source) line += ` _(via ${r.source})_`;
          // Escapa o reason em backticks para evitar que underscores em nomes
          // de env vars (ex: PANEL_X_CHANNEL_ID) sejam interpretados como
          // itálico do Markdown e parta o nome.
          if (r.reason) line += ` — \`${r.reason}\``;
          lines.push(line);
        }
        const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
        lines.push('', `**Resumo:** ${JSON.stringify(counts)}`);
        return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
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
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      if (cmd === 'rg-close-operation') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('fechar operação'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const opId = interaction.options.getInteger('id');
        const { closeOperation } = require('./operations/operationEngine');
        const op = await closeOperation(opId, {}, interaction.user.id);
        if (!op) return safeReply(interaction, { content: MESSAGES.OPERATION_NOT_FOUND() }, { dismissible: true });
        const r = op.reconciliation || {};
        const lines = [`✅ Operação #${opId} concluída.`];
        lines.push(`📦 Material — fornecido: ${r.fornecido || 0}, devolvido: ${r.devolvido || 0}, perdido: ${r.perdido || 0}, consumido: ${r.consumido || 0}.`);
        if (r.unaccounted > 0) {
          lines.push(`⚠️ **${r.unaccounted}** unidades por contabilizar — usa \`/rg-create-operation\` ou os botões de custody para acertar.`);
        }
        return safeReply(interaction, { content: lines.join('\n') }, { dismissible: true });
      }

      if (cmd === 'rg-audit') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('ver logs'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const limit = interaction.options.getInteger('limite') || 20;
        const logs = await getRecentLogs(limit);
        if (!logs.length) return safeReply(interaction, { content: 'Sem logs recentes.' }, { dismissible: true });
        const lines = logs.map(l => `\`${l.created_at?.toISOString?.()?.split('T')[0] || ''}\` **${l.action}** — ${l.entity_type} — por <@${l.actor_id}>`);
        const embed = brandEmbed().setTitle('Logs de Auditoria').setDescription(lines.slice(0, 20).join('\n'));
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      if (cmd === 'rg-items') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const items = await inventoryRepo.getItems(true);
        if (!items.length) return safeReply(interaction, { content: 'Catálogo vazio.' }, { dismissible: true });
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
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      if (cmd === 'rg-add-item') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('adicionar itens'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const nome = interaction.options.getString('nome');
        const categoria = interaction.options.getString('categoria');
        const unidade = interaction.options.getString('unidade') || 'unidade';
        const valor = interaction.options.getNumber('valor') || null;
        const existing = await inventoryRepo.getItemByName(nome);
        if (existing) return safeReply(interaction, { content: `Item "${nome}" já existe.` }, { dismissible: true });
        await inventoryRepo.createItem({ name: nome, category: categoria, unit: unidade, estimatedValue: valor });
        return safeReply(interaction, { content: `Item **${nome}** adicionado ao catálogo.` }, { dismissible: true });
      }

      if (cmd === 'rg-sync-perms') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('sync perms'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const modo = interaction.options.getString('modo') || 'dry-run';
        const apply = modo === 'apply';
        const report = await runPermsOnly(interaction.guild, { apply });

        // Secção especial — nomes históricos recuperados do audit log (dry-run).
        const history = report.actions.filter(a => a.type === 'ROLE_AUDIT_HISTORY');
        const rest = report.actions.filter(a => a.type !== 'ROLE_AUDIT_HISTORY');

        const lines = [
          `**Modo:** \`${report.mode.toUpperCase()}\``,
          `**Acções:** ${JSON.stringify(report.counts)}`,
        ];

        if (history.length) {
          lines.push('', '**🕰️ Nomes históricos recuperados do audit log:**');
          for (const h of history.slice(0, 20)) {
            lines.push(`• <@&${h.detail.roleId}> antes: \`${h.detail.oldName}\``);
          }
          if (history.length > 20) lines.push(`_… e mais ${history.length - 20}._`);
        }

        const samples = rest.slice(0, 20);
        if (samples.length) {
          lines.push('', '**Acções:**');
          for (const a of samples) {
            const detail = a.detail.channel || a.detail.category || a.detail.from || a.detail.name || a.detail.role || '';
            lines.push(`• \`${a.type}\` — ${detail}`);
          }
          if (rest.length > 20) lines.push(`_… e mais ${rest.length - 20}._`);
        }
        if (report.errors.length) {
          lines.push('', `**Erros (${report.errors.length}):**`);
          for (const e of report.errors.slice(0, 5)) lines.push(`❌ ${e.stage}: ${e.message}`);
        }
        if (!apply) lines.push('', '> _Dry-run — usa `modo:apply` para aplicar._');
        return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
      }

      if (cmd === 'rg-sticky-set') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('gerir sticky'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const channel = interaction.options.getChannel('canal');
        const source = interaction.options.getString('source');
        const modo = interaction.options.getString('modo');
        const tMsgs = interaction.options.getInteger('threshold_msgs') || 0;
        const tMin = interaction.options.getInteger('threshold_minutes') || 0;
        try {
          // Source dinâmico (availability:daily) precisa de payload.channelId — guardamos sempre o canal alvo no payload.
          const sticky = await setSticky({
            channelId: channel.id, sourceKey: source, mode: modo,
            payload: { channelId: channel.id }, thresholdMsgs: tMsgs, thresholdMinutes: tMin,
            createdBy: interaction.user.id,
          });
          // Refresh imediato — torna a sticky visível já.
          await stickyRefresh(client, sticky);
          return safeReply(interaction, { content: `📌 Sticky \`${source}\` activa em <#${channel.id}> (modo ${modo}).` }, { dismissible: true });
        } catch (e) {
          return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true });
        }
      }

      if (cmd === 'rg-sticky-remove') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('gerir sticky'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const channel = interaction.options.getChannel('canal');
        const source = interaction.options.getString('source');
        const removed = await removeSticky({ channelId: channel.id, sourceKey: source, actorId: interaction.user.id });
        if (!removed) return safeReply(interaction, { content: 'Não encontrei essa sticky.' }, { dismissible: true });
        return safeReply(interaction, { content: `🗑️ Sticky \`${source}\` removida de <#${channel.id}>.` }, { dismissible: true });
      }

      if (cmd === 'rg-sticky-list') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const all = await stickyRepo.listActive();
        if (!all.length) return safeReply(interaction, { content: 'Sem stickys activas.' }, { dismissible: true });
        const lines = all.map(s => {
          const t = [];
          if (s.threshold_msgs) t.push(`${s.threshold_msgs} msgs`);
          if (s.threshold_minutes) t.push(`${s.threshold_minutes} min`);
          return `• <#${s.channel_id}> — \`${s.source_key}\` (${s.mode}${t.length ? ', ' + t.join('+') : ''})`;
        });
        const renderers = stickyListRenderers();
        const txt = lines.join('\n') + '\n\n_Renderers registados:_ ' + (renderers.map(r => `\`${r}\``).join(', ') || 'nenhum');
        return safeReply(interaction, { content: txt.slice(0, 1900) }, { dismissible: true });
      }

      if (cmd === 'rg-kill') {
        return handleRegisterKillButton(interaction);
      }

      if (cmd === 'rg-cemetery') {
        return handleLeaderboardButton(interaction);
      }

      if (cmd === 'rg-version') {
        const inst = getCurrentInstance();
        if (!inst) {
          return safeReply(interaction, { content: 'Instância ainda não registada.', flags: MessageFlags.Ephemeral }, { dismissible: true });
        }
        const lines = [
          `**Instance ID:** \`${inst.instanceId}\``,
          `**Versão:** \`${inst.version || '?'}\``,
          inst.gitSha ? `**Commit:** \`${inst.gitSha.slice(0, 12)}\`` : null,
          `**Host:** \`${inst.hostname}\` (pid \`${inst.pid}\`)`,
          `**Started:** <t:${Math.floor(new Date(inst.startedAt).getTime() / 1000)}:R>`,
        ].filter(Boolean);
        return safeReply(interaction, { content: lines.join('\n'), flags: MessageFlags.Ephemeral }, { dismissible: true });
      }

      return;
    }

    // ── Button interactions ─────────────────────────────────────────────────
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Availability — botões "para todos os slots" + util
      if (id.startsWith('avail::all::')) return availHandleVoteAll(interaction);
      if (id.startsWith('avail::summary::')) return availHandleSummary(interaction);
      if (id.startsWith('avail::refresh::')) return availHandleRefresh(interaction);

      // Radio — painel
      if (id.startsWith('radio::random::')) return radioHandleRandom(interaction);
      if (id.startsWith('radio::set::')) return radioHandleSet(interaction);
      if (id === 'radio::swap') return radioHandleSwap(interaction);
      if (id === 'radio::history') return radioHandleHistory(interaction);
      if (id === 'radio::refresh') return radioHandleRefresh(interaction);

      // Onboarding — pedir tag
      if (id === 'onboard::pedir_tag') return handlePedirTagButton(interaction);
      // Onboarding — approve/deny (dynamic IDs)
      if (id.startsWith('onboard::approve::')) return handleApproveButton(interaction, parseInt(id.split('::')[2]));
      if (id.startsWith('onboard::deny::')) return handleDenyButton(interaction, parseInt(id.split('::')[2]));

      // Morador / Oficial — registar material (entrega ou venda)
      if (id === 'morador::registar_material') return handleRegistarMaterialButton(interaction);
      if (id === 'morador::encomendar') return handleEncomendasButton(interaction);
      if (id === 'morador::historico') return handleMemberHistoryButton(interaction);
      if (id === 'morador::totais') return handleMemberTotalsButton(interaction);
      if (id === 'morador::progresso') return handleProgressButton(interaction);
      if (id === 'morador::top_semanal') return handleTopSemanalButton(interaction);

      // Oficial buttons
      if (id === 'oficial::ver_operacoes') return handleViewOperationsButton(interaction);

      // Chefia buttons
      if (id === 'chefia::criar_operacao') return handleCreateOperationButton(interaction);
      if (id === 'chefia::fechar_operacao') return handleCloseOperationButton(interaction);
      if (id === 'chefia::ver_operacoes') return handleViewOperationsButton(interaction);
      if (id === 'chefia::registar_material_op') return handleRegisterMaterialButton(interaction);
      if (id === 'chefia::adicionar_participante') return handleAddParticipantButton(interaction);
      if (id === 'chefia::fornecer_participante') return handleIssueToParticipantButton(interaction);
      if (id === 'chefia::ver_stock') return handleStockCommand(interaction);
      if (id === 'chefia::ajustar_stock') return handleAdjustStockButton(interaction);
      if (id === 'chefia::gerir_materiais') return handleGerirMateriaisButton(interaction);

      // Chefia — novos sistemas (disponibilidade / rádio / stickys)
      if (id === 'chefia::abrir_disponibilidade') {
        if (!isChefia(interaction.member) && !isChefeMoradores(interaction.member))
          return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('disponibilidade'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const channelId = CONFIG.AVAILABILITY_CHANNEL_ID;
        if (!channelId) return safeReply(interaction, { content: 'Define `AVAILABILITY_CHANNEL_ID` no .env primeiro.' }, { dismissible: true });
        try {
          const { session, alreadyOpen } = await availCreateSession({
            client, channelId, createdBy: interaction.user.id,
          });
          if (alreadyOpen) return safeReply(interaction, { content: `Já existe sessão #${session.id} aberta hoje.` }, { dismissible: true });
          return safeReply(interaction, { content: `✅ Sessão #${session.id} publicada em <#${channelId}>.` }, { dismissible: true });
        } catch (e) { return safeReply(interaction, { content: `Erro: ${e.message}` }, { dismissible: true }); }
      }

      if (id === 'chefia::publicar_radio') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const states = await radioRepo.getAllStates();
        const targetCh = CONFIG.RADIO_PUBLISH_CHANNEL_ID
          ? await client.channels.fetch(CONFIG.RADIO_PUBLISH_CHANNEL_ID).catch(() => null)
          : interaction.channel;
        if (!targetCh?.isTextBased?.()) return safeReply(interaction, { content: 'Canal de publicação não disponível.' }, { dismissible: true });
        await targetCh.send({ embeds: [radioEmbed(states)], components: radioComponents() });
        return safeReply(interaction, { content: `📻 Painel publicado em <#${targetCh.id}>.` }, { dismissible: true });
      }

      if (id === 'chefia::listar_stickys') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const all = await stickyRepo.listActive();
        if (!all.length) return safeReply(interaction, { content: 'Sem stickys activas.' }, { dismissible: true });
        const lines = all.map(s => `• <#${s.channel_id}> — \`${s.source_key}\` (${s.mode})`);
        return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
      }

      if (id === 'chefia::ver_tops') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const rankings = await getCurrentWeekRanking(10);
        const { start, end } = weekBounds();
        const weekLabel = `${start.toISOString().split('T')[0]} a ${end.toISOString().split('T')[0]}`;
        const embed = rankingEmbed('Top Semanal', rankings, weekLabel);
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      if (id === 'chefia::ver_logs') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('ver logs'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const logs = await getRecentLogs(15);
        if (!logs.length) return safeReply(interaction, { content: 'Sem logs.' }, { dismissible: true });
        const lines = logs.map(l => `\`${l.created_at?.toISOString?.()?.split('T')[0] || ''}\` **${l.action}** — ${l.entity_type}`);
        const embed = brandEmbed().setTitle('Logs Recentes').setDescription(lines.join('\n'));
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      // Chefe de Moradores buttons
      if (id === 'chefe_mor::listar_moradores') {
        if (!isChefeMoradores(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('listar moradores'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const moradores = await memberRepo.findByRole('morador');
        if (!moradores.length) return safeReply(interaction, { content: 'Sem moradores registados.' }, { dismissible: true });
        const lines = moradores.map(m => `<@${m.discord_id}> — ${m.display_name} (desde ${m.joined_at?.toISOString?.()?.split('T')[0] || '-'})`);
        const embed = brandEmbed().setTitle('Moradores').setDescription(lines.join('\n'));
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      if (id === 'chefe_mor::ver_entregas' || id === 'chefe_mor::ver_vendas') {
        if (!isChefeMoradores(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('ver dados'), flags: MessageFlags.Ephemeral }, { dismissible: true });
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
        if (!res.rows.length) return safeReply(interaction, { content: `Sem ${label.toLowerCase()} registadas.` }, { dismissible: true });
        const lines = res.rows.map((r, i) => `**${i + 1}.** <@${r.discord_id}> — ${r.total} unidades`);
        const embed = brandEmbed().setTitle(`${label} por Morador`).setDescription(lines.join('\n'));
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      if (id === 'chefe_mor::ver_tops') {
        if (!isChefeMoradores(interaction.member)) return safeReply(interaction, { content: MESSAGES.NO_PERMISSION('ver tops'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { rankingRepo } = require('./repositories');
        const { start, end } = weekBounds();
        const weekStart = start.toISOString().split('T')[0];
        const rankings = await rankingRepo.getWeekRankingByRole(weekStart, 'morador', 10);
        const weekLabel = `${start.toISOString().split('T')[0]} a ${end.toISOString().split('T')[0]}`;
        const embed = rankingEmbed('Top Moradores', rankings, weekLabel);
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      return;
    }

    // ── Select menu interactions ────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      // Availability — escolha de slot+state via select
      if (id.startsWith('avail::vote_select::')) return availHandleVoteSelect(interaction);

      // Inventory — registo de material
      if (id === 'inv::select_tipo_registo') return handleTipoRegistoSelect(interaction);
      if (id === 'inv::select_item_entrega' || id === 'inv::select_item_venda') return handleItemSelect(interaction);
      if (id === 'inv::select_ajuste') return handleAdjustSelect(interaction);
      if (id === 'inv::select_encomenda') return handleEncomendaSelect(interaction);

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
      // Fase 10 — custódia nominal
      if (id === 'op::issue_select_op') return handleIssueOpSelect(interaction);
      if (id === 'op::issue_select_participant') return handleIssueParticipantSelect(interaction);
      if (id === 'op::issue_select_item') return handleIssueItemSelect(interaction);
      if (id.startsWith('op::mark_dead::')) return handleMarkDeadSelect(interaction);

      return;
    }

    // ── User select menu interactions (member picker, multi-select) ─────────
    if (interaction.isUserSelectMenu()) {
      const id = interaction.customId;
      if (id.startsWith('op::user_select_participants::')) return handleParticipantUsersSelect(interaction);
      return;
    }

    // ── Modal submissions ───────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // Onboarding modal
      if (id === 'onboard::modal_tag') return handleTagModal(interaction);

      // Inventory modals
      if (id === 'inv::modal_entrega_morador' || id === 'inv::modal_venda_morador') return handleQuantityModal(interaction);
      if (id === 'inv::modal_ajuste_manual') return handleAdjustModal(interaction);
      if (id === 'inv::modal_add_item') return handleAddItemModal(interaction);
      if (id === 'inv::modal_edit_price') return handleEditPriceModal(interaction);
      if (id === 'inv::modal_encomenda') return handleEncomendaModal(interaction);

      // Operation modals
      if (id === 'op::modal_create') return handleCreateOperationModal(interaction);
      if (id === 'op::modal_close') return handleCloseOperationModal(interaction);
      if (id === 'op::modal_material_qty') return handleMaterialQtyModal(interaction);
      if (id === 'op::issue_modal_qty') return handleIssueQtyModal(interaction);

      // Cemetery modal
      if (id === 'cemetery::modal_kill') return handleKillModal(interaction);

      // Radio modal
      if (id.startsWith('radio::modal_set::')) return radioHandleSetModal(interaction);

      return;
    }
  } catch (e) {
    metrics.interactionErrorsTotal.inc();
    // Identifica tipo + ID para diagnóstico — tipo da interação determina onde olhar
    const ctx = interaction.isChatInputCommand?.()
      ? `cmd=/${interaction.commandName}`
      : interaction.isButton?.()
        ? `button=${interaction.customId}`
        : interaction.isModalSubmit?.()
          ? `modal=${interaction.customId}`
          : interaction.isAnySelectMenu?.()
            ? `select=${interaction.customId}`
            : `type=${interaction.type}`;
    error(`[INTERACTION] Unhandled error (${ctx}, user=${interaction.user?.id}): ${e.message}`, e);
    await safeReply(interaction, { content: 'Ocorreu um erro interno. A equipa foi notificada.', flags: MessageFlags.Ephemeral }, { dismissible: true }).catch(() => {});
  }
});

// ── Graceful shutdown ───────────────────────────────────────────────────────
let _shuttingDown = false;
async function shutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  log(`[SHUTDOWN] ${signal} received. Shutting down...`);
  try { stopScheduler(); } catch (_) {}
  try { stopLogMaintenance(); } catch (_) {}
  try { client.destroy(); } catch (_) {}
  await deregisterInstance(signal).catch(() => {});
  await releaseInstanceLock().catch(() => {});
  await pool.end().catch(() => {});
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
