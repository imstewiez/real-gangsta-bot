# Arquitectura — Bot di Zona · Firma RedWood

## Filosofia

- **DB = fonte de verdade.** Toda a lógica crítica fecha em PostgreSQL.
- **Discord = interface operacional.** Painéis, modals, selects — o bot
  publica, o utilizador interage. "Meu Ponto" é o **Perfil Operacional**:
  um cockpit com KPIs topo e drill-downs navegáveis.
- **Sheets = projecção event-driven.** Reporting e analytics. Nunca verdade.
  Sem rebuild, sem sync manual — só debounce de eventos → `syncOne(tab)`.
- **Jobs invisíveis.** Manutenção técnica (perms, reconcile, catalog prices)
  corre em scheduler. Utilizador nunca vê `/reconcile` ou `/syncsheet`.

## Árvore do `src/`

```
src/
├── index.js                         # entry point (16 linhas)
├── app/
│   ├── bootstrap.js                 # composition root
│   └── discord/
│       ├── client.js                # factory do Discord client
│       ├── lifecycle.js             # MessageCreate, GuildMember* listeners
│       ├── registerCommands.js      # REST.put de slash commands
│       ├── interactionRouter.js     # ctx.run + rate limit + dispatch
│       └── routers/
│           ├── autocomplete.js
│           ├── slash.js             # commandName → handler (10 cmds)
│           ├── buttons.js           # customId → handler (exact / prefix)
│           ├── selects.js
│           ├── modals.js
│           └── userSelects.js
│
├── core/
│   ├── eventBus.js                  # DomainEventBus (emitAsync)
│   └── errors.js                    # DomainError + subclasses
│
├── shared/
│   ├── sessionStore.js              # estado efémero por user com TTL
│   ├── ui/buttons.js                # buttonFromDef, buttonRow, …
│   ├── embedBuilders.js             # brandEmbed, rankingEmbed, …
│   ├── interactionHelpers.js        # safeReply, isDuplicate, …
│   ├── rateLimiter.js
│   └── requestContext.js            # correlation ID por interacção
│
├── content/                         # copy user-facing (PT-PT)
│   └── emojis.js                    # lexicon semântico fixo
├── panels/                          # painéis + acções colocadas
│   ├── chefiaPanel.js + chefiaActions.js
│   ├── bairristaPanel.js
│   ├── oficialPanel.js
│   └── patraoDiZonaPanel.js + patraoDiZonaActions.js
│
├── perfil/                          # Perfil Operacional (drill-downs)
│   ├── perfilMaterial.js            # material com delta vs período
│   ├── perfilPvp.js                 # K/D, spots, últimas saídas
│   ├── perfilEncomendas.js          # Minhas Encomendas (ciclo de vida)
│   ├── perfilHistorico.js           # movimentos com filtros
│   └── perfilProgressao.js          # barra tier + estimativa
│
├── queries/                         # slash-command handlers user-facing
│
├── saidas/        │ saidaEngine, saidaHandlers, scoring, settlement, session
├── inventory/     │ inventoryEngine, stockManager, handlers, notifier
├── onboarding/    │ onboardingEngine + offboarding + handlers
├── members/       │ memberHandlers, bairristaHandlers, backfill (lib)
├── rankings/      │ rankingEngine, monthly, bairristaSummaryJobs
├── kills/         │ killEngine + handlers
├── audit/         │ auditEngine + repo
├── availability/  │ availabilityEngine + handlers
├── radio/         │ radioEngine + handlers
├── sticky/        │ stickyEngine + renderers
├── reconcile/     │ drift detection (library — usado por jobs)
├── discord/       │ structureSync, channelInvariants, layoutCheck
├── jobs/          │ scheduler + retentionJob + catalogPricesJob
├── permissions/   │ permissionEngine (isChefia, canManage*)
├── repositories/  │ thin data-access (memberRepo, saidaRepo, …)
├── sheets/
│   ├── googleAuth.js  batchWriter.js
│   ├── workbook.js              # ensureTabs apenas (sem rebuild)
│   ├── syncEngine.js            # syncOne apenas
│   ├── projections.js           # event bus → debounce → syncOne
│   ├── queries.js  cleanup.js  theme.js
│   └── tabs/                    # dashboard, resumo, membros, saídas, stock, config
├── lib/           │ metrics, dataHealth
└── web/           │ healthcheck + /ready
```

## Slash commands (10 canónicos)

```
USER-FACING          STAFF OPERACIONAL
/versao              /audit
/stock               /transfer
/catalogo
/ficha
/ponto               ← abre Perfil Operacional
/ranking
/saidas
/kill
```

**Erradicados** (manutenção técnica → jobs automáticos):
`/rebuild`, `/precario`, `/backfill`, `/perms`, `/reconcile`, `/syncsheet`,
`/rebuildsheet`.

## Perfil Operacional

O `/ponto` (ou botão "Meu Ponto" no painel) abre o **cockpit pessoal**:

```
┌─ KPI stripe ─────────────────────────────────────┐
│ 🏆 #3/24 ↑2  · 📦 2.4k  · 🎯 12k · 2.3 K/D · 🔥 4w │
├──────────────────────────────────────────────────┤
│ Material · Ranking · Combate · Streak · Progressão│
└──────────────────────────────────────────────────┘
   📦 Material  ⚔️ PvP  📋 Encomendas  📜 Histórico  📈 Progressão
```

Cada botão abre uma vista ephemeral com detalhe + comparação temporal
(ex: "+320 vs semana anterior") + botão "↩️ Voltar ao Perfil".

## Event bus

Eventos canónicos (`src/core/eventBus.js`):

| Evento                | Emitido em                                  | Subscriber          |
|-----------------------|---------------------------------------------|---------------------|
| `saida.closed`        | `saidaEngine.closeSaida`                    | `sheets/projections` |
| `material.registered` | `inventoryEngine.recordDelivery`            | `sheets/projections` |
| `member.promoted`     | `onboardingEngine.handlePromotionToOficial` | `sheets/projections` |
| `kill.registered`     | `killEngine.recordKill`                     | `sheets/projections` |

Subscribers registam-se em `registerSheetProjections()` (chamado no
bootstrap antes do Discord login). Debounce de 5s agrupa rajadas.

## Jobs automáticos

`src/jobs/scheduler.js` corre em background:

| Job                     | Frequência | Propósito                              |
|-------------------------|------------|----------------------------------------|
| `weekly_rankings`       | 30min      | Publica top semanal no canal           |
| `daily_summary`         | 30min      | Resumo diário                          |
| `role_invariants`       | 24h        | Garante invariantes Discord↔DB (apply) |
| `reconcile_daily`       | 24h        | Dry-run detection drift DB↔Discord↔Sheet |
| `retention`             | 24h        | Retenção audit_logs, job_runs, …       |
| `stock_alerts`          | 1h         | Alerta canal quando stock < threshold  |
| `monthly_rankings`      | 6h         | Recalcula mês + all-time stats         |
| `catalog_prices`        | 7d         | Sincroniza `config/prices-catalog.json` |
| `data_health_collect`   | 5min       | Gauges Prometheus                      |
| `sticky_time_refresh`   | 1min       | Refresh time-based das stickys         |

**Sem `sheets_sync` periódico** — as projections event-driven cobrem.

## Session state

`src/shared/sessionStore.js` cria stores in-memory por domínio com TTL
auto-sweep. Usado hoje por:

- `inventoryHandlers` → `pendingItemSelections` (TTL 15min)
- `saidaHandlers` → `pendingSaidaContext` (TTL 15min)

Por ser singleton (advisory lock + heartbeat), in-memory é suficiente.
Migração futura para tabela `interaction_sessions` = mudar esta factory.

## Princípios

- **Handlers finos.** Parse → permission → engine → render. Sem lógica.
- **Engines grossas.** Toda a invariante de domínio fecha aqui.
- **Repos thin.** SQL puro + mapping. Zero lógica.
- **Audit always.** Toda a mutação relevante → `logAudit(…)`.
- **Content layer.** Strings PT-PT em `src/content/*`. Emojis via `EMOJI.X`.
- **Idempotência.** Syncs e reconciles podem correr 2×.
- **Preempção.** `instanceCoordinator` força shutdown da instância antiga.
- **Zero tooling one-shot.** Se serviu 1× para um incidente, não fica.

## Onde mexer quando…

| Tarefa                                    | Começa em                                 |
|-------------------------------------------|-------------------------------------------|
| Novo slash command                        | `slashCommands.js` + `routers/slash.js`   |
| Novo botão num painel                     | painel + router buttons                   |
| Nova vista drill-down do Perfil           | `src/perfil/*.js` + routers               |
| Novo domínio                              | criar `src/<dominio>/` + repo             |
| Copy user-facing                          | `src/content/*`                           |
| Emoji novo (semântico)                    | `src/content/emojis.js`                   |
| Nova tab Sheets                           | `src/sheets/tabs/` + `syncEngine` + projections |
| Novo evento de domínio                    | emitir na engine + registar em projections |
| Novo job agendado                         | `src/jobs/<job>.js` + registar em scheduler |

---

**Firma RedWood**
