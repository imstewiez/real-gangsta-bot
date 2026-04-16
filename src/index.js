'use strict';
/**
 * ═════════════════════════════════════════════════════════════════════════
 *  Bot di Zona · Firma RedWood — Entry point + interaction dispatcher
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Layout deste ficheiro:
 *   1. Imports (Discord.js, repositories, handlers) — até linha ~220
 *   2. Boot sequence (DB migration + advisory lock + Discord login)
 *   3. client.on(Events.ClientReady) — panel bootstrap, metrics, schedulers
 *   4. client.on(Events.InteractionCreate) — envolve em requestContext + rate limit
 *   5. _dispatchInteraction() — switch gigante com handlers por customId/command
 *   6. Helpers (getCurrentWeekRanking, etc.) e process signals
 *
 * Convenção para adicionar novo comando:
 *   a) Declara em src/slashCommands.js (SlashCommandBuilder)
 *   b) Adiciona bloco `if (cmd === 'rg-foo')` em _dispatchInteraction
 *   c) Se for botão/modal, adiciona no respectivo bloco (customId)
 *
 * Request context:
 *   Toda a interação corre dentro de ctx.run({ actorId, action }).
 *   Usa ctx.correlationId() / ctx.tag() nos logs para rastreabilidade.
 *
 * Rate limiting: middleware global em _dispatchInteraction. Admin 30/10s,
 * outros 10/10s. Configurável em src/shared/rateLimiter.js.
 *
 * Nota: este ficheiro é grande (routing central) mas estável. Se crescer
 * acima de 1500 linhas, considerar split em src/routers/*.
 */
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
  handleMyPerformance, handleMyMaterial, handleMyProfit,
} = require('./members/memberStatsHandlers');
const {
  handleMeuPonto, handleRanking, handleRankingSelect, handleProgressoTier,
} = require('./members/bairristaHandlers');
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
  handleCreateSaidaButton, handleCreateTypeSelect, handleCreateSaidaModal,
  handleCloseSaidaButton, handleCloseSaidaSelect, handleCloseResultSelect, handleCloseSaidaModal,
  handleViewSaidasButton, handleAddParticipantButton,
  handleAddParticipantSelect, handleParticipantUsersSelect,
  handleRegisterMaterialButton,
  handleMaterialOpSelect, handleMaterialDirectionSelect,
  handleMaterialItemSelect, handleMaterialQtyModal,
  handleIssueToParticipantButton, handleIssueSaidaSelect,
  handleIssueParticipantSelect, handleIssueItemSelect, handleIssueQtyModal,
  handleMarkDeadSelect,
} = require('./saidas/saidaHandlers');
const saidaWizard = require('./saidas/saidaSettlementWizard');
const saidaStats = require('./saidas/saidaStatsHandlers');
const saidaSession = require('./saidas/saidaSession');
const { getCurrentWeekRanking } = require('./rankings/rankingEngine');
const { rankingEmbed, brandEmbed } = require('./shared/embedBuilders');
const { ERRORS, EMOJI } = require('./content');
const { inventoryRepo } = require('./repositories');
const { getRecentLogs, sendAuditToChannel } = require('./audit/auditEngine');
const {
  isChefia, isPatraoDiZona,
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
const { createSession: availCreateSession } = require('./availability/availabilityEngine');
const {
  setSticky, removeSticky, refresh: stickyRefresh,
  onMessageCreate: stickyOnMessage, listRenderers: stickyListRenderers,
} = require('./sticky/stickyEngine');
const { registerBuiltinRenderers } = require('./sticky/stickyRenderers');
const { setClient: setStockClient } = require('./inventory/stockNotifier');
const { setClient: setBairristaLogClient } = require('./inventory/bairristaNotifier');
const { setClient: setSaidaClient } = require('./saidas/saidaEngine');
const {
  handleRandom: radioHandleRandom,
  handleSet: radioHandleSet,
  handleSetModal: radioHandleSetModal,
  handleSwap: radioHandleSwap,
  handleHistory: radioHandleHistory,
  handleRefresh: radioHandleRefresh,
} = require('./radio/radioHandlers');
const { buildEmbed: radioEmbed, buildComponents: radioComponents } = require('./radio/radioEngine');
const {
  handleRegisterKillButton, handleKillModal, handleLeaderboardButton,
} = require('./kills/killHandlers');
const { isDuplicate } = require('./shared/interactionHelpers');
const { safeReply } = require('./shared/interactionHelpers');
// ERRORS importado do content layer (canonical — sem shim legacy).
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
  // Log dedicado de entregas/vendas dos Bairristas.
  setBairristaLogClient(client);
  // Saída engine usa client para publicar resultados ricos no fecho.
  setSaidaClient(client);

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
        const wasMorador = CONFIG.BAIRRISTA_TIER_ROLE_IDS.some(id => oldRoles.has(id));
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

  const ctx = require('./shared/requestContext');
  const actionKey = interaction.isChatInputCommand() ? `cmd:${interaction.commandName}`
    : interaction.isButton()        ? `btn:${interaction.customId}`
    : interaction.isModalSubmit()   ? `mod:${interaction.customId}`
    : interaction.isAnySelectMenu() ? `sel:${interaction.customId}`
    : 'misc';

  // Cada interação ganha correlation ID e scope — logs ficam rastreáveis
  // via filtro pelo [req_xxx] no texto/jsonl.
  return ctx.run({
    actorId: interaction.user.id,
    actorName: interaction.user.username,
    action: actionKey,
    guildId: interaction.guildId,
  }, async () => {
    const cid = ctx.correlationId();
    try {
      log(`${ctx.tag()} start ${actionKey} · actor=${interaction.user.id}`);
      await _dispatchInteraction(interaction);
      log(`${ctx.tag()} done ${actionKey} · ${ctx.elapsed()}ms`);
    } catch (e) {
      warn(`${ctx.tag()} failed ${actionKey} · ${e.message} · ${ctx.elapsed()}ms`);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: `⛔ Falha interna. Ref: \`${cid}\``, flags: MessageFlags.Ephemeral }).catch(() => {});
        } else {
          await interaction.reply({ content: `⛔ Falha interna. Ref: \`${cid}\``, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      } catch (_) {}
    }
  });
});

async function _dispatchInteraction(interaction) {
  try {
    // ── Autocomplete handler (sem rate limit, sem deferReply) ────────────────
    if (interaction.isAutocomplete?.()) {
      const focused = interaction.options.getFocused(true);
      const cmd = interaction.commandName;
      if (focused.name === 'item' && cmd?.startsWith('rg-stock-')) {
        const { getActiveItemsList } = require('./sheets/queries');
        const all = await getActiveItemsList().catch(() => []);
        const q = String(focused.value || '').toLowerCase();
        const filtered = (q ? all.filter(i => i.name.toLowerCase().includes(q)) : all).slice(0, 25);
        return interaction.respond(filtered.map(i => ({ name: i.name, value: i.name }))).catch(() => {});
      }
      return interaction.respond([]).catch(() => {});
    }

    // ── Rate limiting global por user (janela deslizante) ────────────────────
    // Admin commands têm limite mais folgado; consultas básicas são mais restritas.
    const rl = require('./shared/rateLimiter');
    const ctx = require('./shared/requestContext');
    const actionKey = ctx.current()?.action || 'misc';
    const isAdmin = interaction.memberPermissions?.has?.('Administrator');
    const rlLimit = isAdmin ? 30 : 10;
    if (!rl.allow(interaction.user.id, actionKey, { limit: rlLimit, windowMs: 10_000 })) {
      const wait = rl.retryAfter(interaction.user.id, actionKey);
      return safeReply(interaction, { content: rl.denyMessage(wait), flags: MessageFlags.Ephemeral }, { dismissible: true });
    }

    // ── Slash commands ──────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      metrics.commandInvocationsTotal.inc();
      const cmd = interaction.commandName;

      if (cmd === 'rg-sync-panels') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('sync panels'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const results = await bootstrapAll(client);
        const icon = { created: EMOJI.OK, edited: EMOJI.EDITAR, skipped: '⚪', failed: EMOJI.ERRO };
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

      // rg-top-week/month/alltime removidos — /rg-ranking cobre tudo

      if (cmd === 'rg-rebuild-rankings') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('rebuild rankings'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { computeMonthlyRankings, recomputeAllTimeStats } = require('./rankings/monthlyRankingEngine');
        const t0 = Date.now();
        const m = await computeMonthlyRankings();
        const a = await recomputeAllTimeStats();
        return safeReply(interaction, {
          content: `${EMOJI.REFRESH} Rankings recalculados em ${Date.now() - t0}ms — ${m.count} membros no mês ${m.monthStart}, ${a.count} all-time.`,
        }, { dismissible: true });
      }

      // rg-close-saida removido — painel chefia fechar_saida

      if (cmd === 'rg-audit') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('ver logs'), flags: MessageFlags.Ephemeral }, { dismissible: true });
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

      // rg-add-item e rg-item-set-price removidos — painel gerir_materiais cobre

      if (cmd === 'rg-catalog-sync-prices') {
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('sync catálogo'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const modo = interaction.options.getString('modo') || 'prices';
        const { syncPrices } = require('./inventory/catalogPricesSync');
        try {
          const r = await syncPrices({ full: modo === 'full' });
          const lines = [
            `📋 **Precário sincronizado** (modo \`${modo}\`)`,
            `${EMOJI.OK} ${r.created.length} criados · ${EMOJI.REFRESH} ${r.updated.length} actualizados · ⚪ ${r.unchanged.length} iguais · ${EMOJI.WARN} ${r.errors.length} erros`,
          ];
          if (r.updated.length) {
            lines.push('', '**Preços alterados:**');
            for (const u of r.updated.slice(0, 15)) lines.push(`• ${u.name}: ${u.oldPrice}€ → **${u.newPrice}€**`);
            if (r.updated.length > 15) lines.push(`_… e mais ${r.updated.length - 15}._`);
          }
          if (r.created.length) {
            lines.push('', '**Itens novos:**');
            for (const c of r.created.slice(0, 15)) lines.push(`• ${c.name} (${c.price}€)`);
            if (r.created.length > 15) lines.push(`_… e mais ${r.created.length - 15}._`);
          }
          if (r.errors.length) {
            lines.push('', '**Erros:**');
            for (const e of r.errors.slice(0, 5)) lines.push(`${EMOJI.WARN} ${e.name}: ${e.message}`);
          }
          return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
        } catch (e) {
          return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
        }
      }

      // rg-items-sem-preco removido — usa gerir_materiais no painel

      if (cmd === 'rg-sync-perms') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('sync perms'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const modo = interaction.options.getString('modo') || 'dry-run';
        const apply = modo === 'apply';
        const report = await runPermsOnly(interaction.guild, { apply });
        const { summarize: summarizePerms } = require('./discord/structureSync');

        // Reconcile canais individuais de bairristas — garante que só o dono
        // + PDZ + oficiais + chefia vêem cada canal (não outros bairristas).
        const { reconcileBairristaChannels } = require('./members/channelInvariants');
        const chReport = await reconcileBairristaChannels(interaction.guild, { dryRun: !apply });

        const summary = summarizePerms(report);
        const chSummary = `\n\n**Canais individuais de bairristas:** scanned=${chReport.scanned} · fixed=${chReport.fixed} · missing=${chReport.missing} · errors=${chReport.errors.length}`;
        return safeReply(interaction, { content: (summary + chSummary).slice(0, 1900) }, { dismissible: true });
      }

      if (cmd === 'rg-layout-check') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('verificar layout'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { checkLayout, summarize: summarizeLayout } = require('./discord/layoutCheck');
        const result = await checkLayout(interaction.guild);
        return safeReply(interaction, { content: summarizeLayout(result).slice(0, 1900) }, { dismissible: true });
      }

      if (cmd === 'rg-backfill-members') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('backfill membros'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const modo = interaction.options.getString('modo') || 'dry-run';
        const dryRun = modo === 'dry-run';
        const { backfillMembers } = require('./members/backfill');
        const r = await backfillMembers(interaction.guild, { dryRun, actor: `discord:${interaction.user.id}` });
        const tag = dryRun ? '**DRY-RUN**' : '**APLICADO**';
        const lines = [
          `${tag} · Backfill de membros concluído`,
          `• Scanned: ${r.scanned}  ·  Bots: ${r.skippedBot}  ·  Sem role RP: ${r.skippedNoRole}`,
          `• Criados: ${r.created}  ·  Actualizados: ${r.updated}  ·  Sem mudança: ${r.unchanged}`,
          r.errors.length ? `${EMOJI.WARN} Erros: ${r.errors.length} (ver logs)` : '',
        ].filter(Boolean);
        return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
      }

      if (cmd === 'rg-data-health') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('data health'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { collect, formatDiscord } = require('./lib/dataHealth');
        const report = await collect({ guild: interaction.guild });
        return safeReply(interaction, { content: formatDiscord(report) }, { dismissible: true });
      }

      if (cmd === 'rg-reconcile') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('reconcile'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const dominio = interaction.options.getString('dominio');
        const modo    = interaction.options.getString('modo');
        const dryRun  = modo === 'dry-run';
        const { runReconcile } = require('./reconcile');
        const r = await runReconcile({ domain: dominio, guild: interaction.guild, dryRun, actor: `discord:${interaction.user.id}` });
        const tag = dryRun ? '**DRY-RUN**' : '**APLICADO**';
        const lines = [`${tag} · Reconcile \`${dominio}\` em ${r.ms}ms`, ''];
        for (const [d, entry] of Object.entries(r.per_domain)) {
          if (entry.error) { lines.push(`${EMOJI.ERRO} **${d}**: ${entry.error}`); continue; }
          const c = entry.check;
          const driftBits = [];
          if (c.role_mismatch?.length) driftBits.push(`${c.role_mismatch.length} role mismatch`);
          if (c.tier_mismatch?.length) driftBits.push(`${c.tier_mismatch.length} tier mismatch`);
          if (c.missing_in_db?.length) driftBits.push(`${c.missing_in_db.length} missing`);
          if (c.orphan_in_db?.length) driftBits.push(`${c.orphan_in_db.length} orphan`);
          if (c.stale?.length) driftBits.push(`${c.stale.length} stale tabs`);
          if (c.errors?.length) driftBits.push(`${c.errors.length} error tabs`);
          if (c.never_synced?.length) driftBits.push(`${c.never_synced.length} never synced`);
          if (c.channels_missing?.length) driftBits.push(`${c.channels_missing.length} missing channels`);
          const summary = c.has_drift ? driftBits.join(' · ') : `${c.ok} ok, sem drift`;
          const apply = entry.apply ? ` → ${EMOJI.OK} ${entry.apply.corrected} corrigidos` : '';
          lines.push(`🔍 **${d}**: ${c.total_checked} verificados · ${summary}${apply}`);
        }
        return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
      }

      if (cmd === 'rg-retention-run') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('retention'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const modo = interaction.options.getString('modo');
        const dryRun = modo === 'dry-run';
        const { runRetention } = require('./jobs/retentionJob');
        const r = await runRetention({ dryRun, actor: `discord:${interaction.user.id}` });
        const tag = dryRun ? '**DRY-RUN**' : '**APLICADO**';
        const lines = [
          `${tag} · Retenção concluída em ${r.ms}ms`,
          `• Políticas avaliadas: ${r.actions.length}`,
          `• Rows afectados: ${r.summary.totalRows}`,
          `• Erros: ${r.summary.errors}`,
          '',
          '**Detalhe:**',
          ...r.actions.map(a => {
            const status = a.error ? `${EMOJI.ERRO} ${a.error.slice(0, 60)}`
                         : a.applied ? `${EMOJI.OK} ${a.count} rows`
                         : a.count === 0 ? `⚪ nada a fazer`
                         : `🔸 ${a.count} rows (não aplicado)`;
            return `  • \`${a.key}\` → ${status}`;
          }),
        ];
        return safeReply(interaction, { content: lines.join('\n').slice(0, 1900) }, { dismissible: true });
      }

      // ── Stock manual ──────────────────────────────────────────────────────
      // stock-add/remove/adjust removidos — painéis cobrem (Registar Material + Ajustar Stock)
      if (cmd === 'rg-stock-check' || cmd === 'rg-stock-transfer') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const sm = require('./inventory/stockManager');
        const itemName = interaction.options.getString('item');
        const item = await sm.findItemByName(itemName);
        if (!item) return safeReply(interaction, { content: `${EMOJI.ERRO} Item não encontrado: \`${itemName}\``}, { dismissible: true });
        const actor = `discord:${interaction.user.id}`;
        try {
          if (cmd === 'rg-stock-check') {
            const ar = await sm.getCurrentStock(item.id, 'armazem');
            const gr = await sm.getCurrentStock(item.id, 'grupo');
            const total = ar + gr;
            const value = (Number(item.estimated_value) || 0) * total;
            return safeReply(interaction, { content:
              `${EMOJI.MATERIAL} **${item.name}**  _${item.category}_\n` +
              `${EMOJI.CASA} Armazém: \`${ar}\` un.\n` +
              `${EMOJI.CASA} Grupo: \`${gr}\` un.\n` +
              `▸ Total: **${total}** un.  (≈ ${value.toLocaleString('pt-PT')} €)`
            }, { dismissible: true });
          }
          if (cmd === 'rg-stock-transfer') {
            const qty = interaction.options.getInteger('quantidade');
            const de   = interaction.options.getString('de');
            const para = interaction.options.getString('para');
            const nota = interaction.options.getString('nota') || '';
            await sm.transferStock({ itemId: item.id, quantity: qty, fromLocation: de, toLocation: para, actor, notes: nota });
            const ar = await sm.getCurrentStock(item.id, 'armazem');
            const gr = await sm.getCurrentStock(item.id, 'grupo');
            return safeReply(interaction, { content: `${EMOJI.REFRESH} Transferido **${qty}× ${item.name}**: ${de} → ${para}\nArmazém: \`${ar}\` · Grupo: \`${gr}\`` }, { dismissible: true });
          }
        } catch (e) {
          return safeReply(interaction, { content: `${EMOJI.ERRO} ${e.message}` }, { dismissible: true });
        }
      }

      if (cmd === 'rg-sync-sheets') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('sync sheets'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { syncAll } = require('./sheets/syncEngine');
        const r = await syncAll();
        if (r.skipped) return safeReply(interaction, { content: `${EMOJI.WARN} Skipped: ${r.skipped}` }, { dismissible: true });
        const okTabs = r.results.map(x => x.tab);
        const errTabs = r.errors.map(e => e.tab);
        const summary = `**Sync completo** em ${r.ms}ms — ${r.results.length} tabs OK, ${r.errors.length} erros`;
        const okLine = okTabs.length ? `${EMOJI.OK} OK (${okTabs.length}): ${okTabs.join(', ')}` : '';
        const errLines = r.errors.length
          ? ['', `${EMOJI.ERRO} Erros (${r.errors.length}):`, ...r.errors.map(e => `• **${e.tab}**: ${e.message}`)]
          : [];
        const msg = [summary, okLine, ...errLines].filter(Boolean).join('\n');
        // Se exceder 1900 chars, anexa como ficheiro para ver tudo.
        if (msg.length > 1900 && r.errors.length) {
          const { AttachmentBuilder } = require('discord.js');
          const detail = errLines.join('\n');
          const file = new AttachmentBuilder(Buffer.from(detail, 'utf8'), { name: 'sync-errors.txt' });
          return interaction.editReply({ content: summary + '\n' + okLine, files: [file] });
        }
        return safeReply(interaction, { content: msg.slice(0, 1990) }, { dismissible: true });
      }

      if (cmd === 'rg-sync-sheets-tab') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('sync sheets'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const tab = interaction.options.getString('tab');
        const { syncOne } = require('./sheets/syncEngine');
        try {
          const r = await syncOne(tab);
          if (r.skipped) return safeReply(interaction, { content: `${EMOJI.WARN} Skipped: ${r.skipped}` }, { dismissible: true });
          return safeReply(interaction, { content: `${EMOJI.OK} Tab **${tab}**: ${r.ops} ops em ${r.ms}ms.` }, { dismissible: true });
        } catch (e) {
          return safeReply(interaction, { content: `${EMOJI.ERRO} ${tab}: ${e.message}` }, { dismissible: true });
        }
      }

      if (cmd === 'rg-sync-sheets-rebuild') {
        if (!canManageStructure(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('rebuild sheets'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const purge = interaction.options.getBoolean('purge') || false;
        const { rebuildWorkbook } = require('./sheets/syncEngine');
        const r = await rebuildWorkbook(null, { purgeOthers: purge });
        if (r.skipped) return safeReply(interaction, { content: `${EMOJI.WARN} Skipped: ${r.skipped}` }, { dismissible: true });
        const purgedTag = r.purged ? ' (lixo apagado)' : '';
        return safeReply(interaction, { content: `${EMOJI.REFRESH} Rebuild${purgedTag} em ${r.ms}ms — ${r.results.length} tabs OK, ${r.errors.length} erros.` }, { dismissible: true });
      }

      // rg-sticky-set/remove/list removidos — painel chefia stickys

      if (cmd === 'rg-kill') {
        return handleRegisterKillButton(interaction);
      }

      // rg-cemetery removido — kills visíveis via rankings e minha-saida

      // ── Bairrista commands ──────────────────────────────────────────────
      if (cmd === 'rg-meu-ponto') return handleMeuPonto(interaction);

      if (cmd === 'rg-minha-saida') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { query: dbQuery } = require('./db');
        const specificId = interaction.options.getInteger('id');
        const member = await require('./repositories').memberRepo.findByDiscordId(interaction.user.id);
        if (!member) return safeReply(interaction, { content: 'Não estás registado.' }, { dismissible: true });

        if (specificId) {
          // Mostra resultado de uma saída específica
          const part = await dbQuery(
            `SELECT op.*, o.spot, o.date, o.result, o.operation_type
             FROM operation_participants op
             JOIN operations o ON o.id = op.operation_id
             WHERE op.operation_id = $1 AND op.member_id = $2`,
            [specificId, member.id]
          );
          if (!part.rows[0]) return safeReply(interaction, { content: `Não participaste na saída #${specificId}.` }, { dismissible: true });
          const p = part.rows[0];
          const typeTag = p.participant_type === 'trabalhador' ? '🛠️ Trabalhador' : '🏴 Caracterizado';
          const embed = brandEmbed('MOVEMENT')
            .setTitle(`${EMOJI.SAIDA} Saída #${specificId} — O teu resultado`)
            .addFields(
              { name: 'Spot', value: p.spot || '—', inline: true },
              { name: 'Data', value: String(p.date).split('T')[0], inline: true },
              { name: 'Tipo', value: typeTag, inline: true },
              { name: `${EMOJI.KILL} Kills`, value: String(p.kills || 0), inline: true },
              { name: p.died ? `${EMOJI.MORTE} Morto` : `${EMOJI.OK} Vivo`, value: '\u200b', inline: true },
              { name: 'Performance', value: `**${Math.round(p.performance_score || 0)}**`, inline: true },
              { name: 'Disciplina', value: `**${Math.round(p.discipline_score || 0)}%**`, inline: true },
              { name: p.mvp_flag ? `${EMOJI.MVP} MVP` : 'MVP', value: p.mvp_flag ? '**Sim**' : 'Não', inline: true },
            );
          return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
        }

        // Últimas 10 saídas
        const recent = await dbQuery(
          `SELECT op.kills, op.died, op.performance_score, op.discipline_score, op.mvp_flag,
                  op.participant_type, op.own_weapon,
                  o.id, o.spot, o.date, o.result, o.operation_type
           FROM operation_participants op
           JOIN operations o ON o.id = op.operation_id
           WHERE op.member_id = $1 AND o.status = 'concluida'
           ORDER BY o.date DESC, o.id DESC LIMIT 10`,
          [member.id]
        );
        if (!recent.rows.length) return safeReply(interaction, { content: 'Ainda não tens saídas fechadas.' }, { dismissible: true });

        const lines = recent.rows.map(r => {
          const result = r.result === 'vitoria' ? `${EMOJI.VITORIA}` : r.result === 'derrota' ? `${EMOJI.DERROTA}` : `${EMOJI.INFO}`;
          const mvp = r.mvp_flag ? ` ${EMOJI.MVP}` : '';
          const death = r.died ? ` ${EMOJI.MORTE}` : '';
          const typeTag = r.participant_type === 'trabalhador' ? ' 🛠️' : '';
          return `\`${String(r.date).split('T')[0]}\` **#${r.id}** ${r.spot || '—'} · ${result} · ${r.kills || 0}k · perf **${Math.round(r.performance_score || 0)}**${death}${mvp}${typeTag}`;
        });

        const embed = brandEmbed('MOVEMENT')
          .setTitle(`${EMOJI.SAIDA} As tuas últimas saídas`)
          .setDescription(lines.join('\n'));
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }
      // rg-progresso e rg-top-bairristas removidos (painéis cobrem)
      if (cmd === 'rg-ranking') {
        // Override period from slash command option
        const periodo = interaction.options.getString('periodo') || 'week';
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { bairristaStatsRepo } = require('./repositories');
        const { start, end } = weekBounds();
        const weekStartStr = start.toISOString().split('T')[0];
        const now = new Date();
        const monthStartStr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split('T')[0];
        let rankings, title;
        if (periodo === 'month') {
          rankings = await bairristaStatsRepo.getTopBairristasMonthly(monthStartStr, 15);
          title = `🏆 Ranking Mensal — ${now.toLocaleString('pt-PT', { month: 'long', year: 'numeric' })}`;
        } else if (periodo === 'alltime') {
          rankings = await bairristaStatsRepo.getTopBairristasAllTime(15);
          title = '🏆 Ranking Histórico — Bairristas';
        } else {
          rankings = await bairristaStatsRepo.getTopBairristas(weekStartStr, 15);
          title = `🏆 Ranking Semanal — ${weekStartStr} → ${end.toISOString().split('T')[0]}`;
        }
        if (!rankings.length) return safeReply(interaction, { content: 'Sem dados para este período.' }, { dismissible: true });
        const lines = rankings.map((r, i) => {
          const pos = Number(r.pos || i + 1);
          const prefix = pos <= 3 ? ['🥇', '🥈', '🥉'][pos - 1] : `**${pos}.**`;
          const score = Math.round(Number(r.hybrid_score || r.weighted_value || 0));
          const isMe = r.discord_id === interaction.user.id ? ' ← **tu**' : '';
          return `${prefix} <@${r.discord_id}> — **${score.toLocaleString('pt-PT')}** · ${r.deliveries || 0}e · ${r.sales || 0}v${isMe}`;
        });
        const embed = brandEmbed('TOP').setTitle(title).setDescription(lines.join('\n'));
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
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

      // Saída session — auto-registo interactivo
      if (id.startsWith('saida::session_caracterizado::')) return saidaSession.handleSessionCaracterizado(interaction);
      if (id.startsWith('saida::session_trabalhador::')) return saidaSession.handleSessionTrabalhador(interaction);
      if (id.startsWith('saida::session_cancel::')) return saidaSession.handleSessionCancel(interaction);

      // Saída wizard — botão Concluir
      if (id.startsWith('saida::wz_finish::')) return saidaWizard.handleFinish(interaction);
      // Saída stats — botão Estatísticas do painel Chefia
      if (id === 'chefia::stats_open') return saidaStats.handleStatsOpen(interaction);

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

      // Bairrista / Oficial — registar material (entrega ou venda)
      if (id === 'morador::registar_material') return handleRegistarMaterialButton(interaction);
      if (id === 'morador::encomendar') return handleEncomendasButton(interaction);
      if (id === 'morador::historico') return handleMemberHistoryButton(interaction);
      if (id === 'morador::totais') return handleMemberTotalsButton(interaction);
      if (id === 'morador::progresso') return handleProgressButton(interaction);
      if (id === 'morador::top_semanal') return handleTopSemanalButton(interaction);
      if (id === 'morador::my_performance') return handleMyPerformance(interaction);
      if (id === 'morador::my_material') return handleMyMaterial(interaction);
      if (id === 'morador::my_profit') return handleMyProfit(interaction);
      // Novos handlers Bairrista
      if (id === 'morador::meu_ponto') return handleMeuPonto(interaction);
      if (id === 'morador::ranking') return handleRanking(interaction);
      if (id === 'morador::progresso_tier') return handleProgressoTier(interaction);

      // Oficial buttons
      if (id === 'oficial::ver_saidas' || id === 'oficial::ver_operacoes') return handleViewSaidasButton(interaction);

      // Chefia buttons
      if (id === 'chefia::criar_saida' || id === 'chefia::criar_operacao') return handleCreateSaidaButton(interaction);
      if (id === 'chefia::fechar_saida' || id === 'chefia::fechar_operacao') return handleCloseSaidaButton(interaction);
      if (id === 'chefia::ver_saidas' || id === 'chefia::ver_operacoes') return handleViewSaidasButton(interaction);
      if (id === 'chefia::registar_material_saida' || id === 'chefia::registar_material_op') return handleRegisterMaterialButton(interaction);
      if (id === 'chefia::adicionar_participante') return handleAddParticipantButton(interaction);
      if (id === 'chefia::fornecer_participante') return handleIssueToParticipantButton(interaction);
      if (id === 'chefia::ver_stock') return handleStockCommand(interaction);
      if (id === 'chefia::ajustar_stock') return handleAdjustStockButton(interaction);
      if (id === 'chefia::gerir_materiais') return handleGerirMateriaisButton(interaction);

      // Chefia — novos sistemas (disponibilidade / rádio / stickys)
      if (id === 'chefia::abrir_disponibilidade') {
        if (!isChefia(interaction.member) && !isPatraoDiZona(interaction.member))
          return safeReply(interaction, { content: ERRORS.NO_PERMISSION('disponibilidade'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const channelId = CONFIG.AVAILABILITY_CHANNEL_ID;
        if (!channelId) return safeReply(interaction, { content: 'Define `AVAILABILITY_CHANNEL_ID` no .env primeiro.' }, { dismissible: true });
        try {
          const { session, alreadyOpen } = await availCreateSession({
            client, channelId, createdBy: interaction.user.id,
          });
          if (alreadyOpen) return safeReply(interaction, { content: `Já existe sessão #${session.id} aberta hoje.` }, { dismissible: true });
          return safeReply(interaction, { content: `${EMOJI.OK} Sessão #${session.id} publicada em <#${channelId}>.` }, { dismissible: true });
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
        if (!isChefia(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('ver logs'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const logs = await getRecentLogs(15);
        if (!logs.length) return safeReply(interaction, { content: 'Sem logs.' }, { dismissible: true });
        const lines = logs.map(l => `\`${l.created_at?.toISOString?.()?.split('T')[0] || ''}\` **${l.action}** — ${l.entity_type}`);
        const embed = brandEmbed().setTitle('Logs Recentes').setDescription(lines.join('\n'));
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      // Patrão di Zona buttons
      if (id === 'chefe_mor::listar_moradores') {
        if (!isPatraoDiZona(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('listar bairristas'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { query } = require('./db');
        const resBair = await query(
          `SELECT * FROM members WHERE role IN ('bairrista', 'morador') AND status = 'ativo' ORDER BY display_name`
        );
        const bairristas = resBair.rows;
        if (!bairristas.length) return safeReply(interaction, { content: 'Sem bairristas registados.' }, { dismissible: true });
        const lines = bairristas.map(m => `<@${m.discord_id}> — ${m.display_name} (desde ${m.joined_at?.toISOString?.()?.split('T')[0] || '-'})`);
        const embed = brandEmbed().setTitle('Bairristas').setDescription(lines.join('\n'));
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      if (id === 'chefe_mor::ver_entregas' || id === 'chefe_mor::ver_vendas') {
        if (!isPatraoDiZona(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('ver dados'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const types = id.includes('entregas')
          ? ['entrega_bairrista', 'entrega_morador']
          : ['venda_bairrista', 'venda_morador'];
        const label = id.includes('entregas') ? 'Entregas' : 'Vendas';
        const { query } = require('./db');
        const res = await query(`
          SELECT m.display_name, m.discord_id, SUM(im.quantity) as total
          FROM inventory_movements im
          JOIN members m ON m.id = im.member_id
          WHERE im.movement_type = ANY($1)
          GROUP BY m.display_name, m.discord_id
          ORDER BY total DESC LIMIT 20
        `, [types]);
        if (!res.rows.length) return safeReply(interaction, { content: `Sem ${label.toLowerCase()} registadas.` }, { dismissible: true });
        const lines = res.rows.map((r, i) => `**${i + 1}.** <@${r.discord_id}> — ${r.total} unidades`);
        const embed = brandEmbed().setTitle(`${label} por Bairrista`).setDescription(lines.join('\n'));
        return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
      }

      if (id === 'chefe_mor::ver_tops') {
        if (!isPatraoDiZona(interaction.member)) return safeReply(interaction, { content: ERRORS.NO_PERMISSION('ver tops'), flags: MessageFlags.Ephemeral }, { dismissible: true });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { rankingRepo } = require('./repositories');
        const { start, end } = weekBounds();
        const weekStart = start.toISOString().split('T')[0];
        // Primeiro tenta role novo; fallback para legacy.
        let rankings = await rankingRepo.getWeekRankingByRole(weekStart, 'bairrista', 10);
        if (!rankings.length) rankings = await rankingRepo.getWeekRankingByRole(weekStart, 'morador', 10);
        const weekLabel = `${start.toISOString().split('T')[0]} a ${end.toISOString().split('T')[0]}`;
        const embed = rankingEmbed('Top Bairristas', rankings, weekLabel);
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

      // Bairrista — ranking por período
      if (id === 'bairrista::ranking_period') return handleRankingSelect(interaction);

      // Saída — selects predefinidos (tipo e resultado)
      if (id === 'saida::select_create_type') return handleCreateTypeSelect(interaction);
      if (id === 'saida::select_close_result') return handleCloseResultSelect(interaction);

      // Inventory — gestão de materiais (chefia)
      if (id === 'inv::select_gerir_action') return handleGerirActionSelect(interaction);
      if (id === 'inv::select_edit_item') return handleEditItemSelect(interaction);
      if (id === 'inv::select_deactivate_item') return handleDeactivateItemSelect(interaction);
      if (id === 'inv::select_reactivate_item') return handleReactivateItemSelect(interaction);

      // Operations
      if (id === 'saida::select_close' || id === 'op::select_close') return handleCloseSaidaSelect(interaction);
      if (id === 'saida::select_add_participant' || id === 'op::select_add_participant') return handleAddParticipantSelect(interaction);
      if (id === 'saida::select_material_op' || id === 'op::select_material_op') return handleMaterialOpSelect(interaction);
      if (id === 'saida::select_material_direction' || id === 'op::select_material_direction') return handleMaterialDirectionSelect(interaction);
      if (id === 'saida::select_material_item' || id === 'op::select_material_item') return handleMaterialItemSelect(interaction);
      // Custódia nominal
      if (id === 'saida::issue_select_saida' || id === 'op::issue_select_op') return handleIssueSaidaSelect(interaction);
      if (id === 'saida::issue_select_participant' || id === 'op::issue_select_participant') return handleIssueParticipantSelect(interaction);
      if (id === 'saida::issue_select_item' || id === 'op::issue_select_item') return handleIssueItemSelect(interaction);
      if (id.startsWith('saida::mark_dead::') || id.startsWith('op::mark_dead::')) return handleMarkDeadSelect(interaction);
      if (id.startsWith('saida::wz_select::')) return saidaWizard.handleSelectParticipant(interaction);
      if (id === 'saida::stats_pick') return saidaStats.handleStatsPick(interaction);

      return;
    }

    // ── User select menu interactions (member picker, multi-select) ─────────
    if (interaction.isUserSelectMenu()) {
      const id = interaction.customId;
      if (id.startsWith('saida::user_select_participants::') || id.startsWith('op::user_select_participants::')) return handleParticipantUsersSelect(interaction);
      return;
    }

    // ── Modal submissions ───────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      // Onboarding modal
      if (id === 'onboard::modal_tag') return handleTagModal(interaction);

      // Inventory modals
      if (id === 'inv::modal_entrega_bairrista' || id === 'inv::modal_venda_bairrista'
        || id === 'inv::modal_entrega_morador' || id === 'inv::modal_venda_morador') return handleQuantityModal(interaction);
      if (id === 'inv::modal_ajuste_manual') return handleAdjustModal(interaction);
      if (id === 'inv::modal_add_item') return handleAddItemModal(interaction);
      if (id === 'inv::modal_edit_price') return handleEditPriceModal(interaction);
      if (id === 'inv::modal_encomenda') return handleEncomendaModal(interaction);

      // Operation modals
      if (id === 'saida::modal_create' || id === 'op::modal_create') return handleCreateSaidaModal(interaction);
      if (id === 'saida::modal_close' || id === 'op::modal_close') return handleCloseSaidaModal(interaction);
      if (id === 'saida::modal_material_qty' || id === 'op::modal_material_qty') return handleMaterialQtyModal(interaction);
      if (id === 'saida::issue_modal_qty' || id === 'op::issue_modal_qty') return handleIssueQtyModal(interaction);
      if (id.startsWith('saida::wz_modal::')) return saidaWizard.handleSettleModal(interaction);
      if (id.startsWith('saida::session_weapon_modal::')) return saidaSession.handleRegistrationModal(interaction);

      // Cemetery modal
      if (id === 'kill::modal' || id === 'cemetery::modal_kill') return handleKillModal(interaction);

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
}

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
