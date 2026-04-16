# Arquitectura — Bot di Zona · Firma RedWood

## Filosofia

- **DB = fonte de verdade.** Toda a lógica crítica fecha em PostgreSQL.
- **Discord = interface operacional.** Painéis, modals, selects — o bot
  publica, o utilizador interage.
- **Sheets = projecção.** Reporting e analytics. Nunca verdade.
- **Domínios > helpers.** Cada pasta modela um domínio (saídas, inventário,
  kills, onboarding…) e expõe engine + repositório + handlers finos.

## Árvore do `src/`

```
src/
├── index.js                         # entry point (≤ 20 linhas)
├── app/
│   ├── bootstrap.js                 # composition root
│   └── discord/
│       ├── client.js                # factory do Discord client
│       ├── lifecycle.js             # MessageCreate, GuildMember* listeners
│       ├── registerCommands.js      # REST.put de slash commands
│       ├── interactionRouter.js     # ctx.run + rate limit + dispatch
│       └── routers/
│           ├── autocomplete.js
│           ├── slash.js             # commandName → handler
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
│   ├── ui/
│   │   └── buttons.js               # buttonFromDef, buttonRow, …
│   ├── embedBuilders.js             # brandEmbed, rankingEmbed, …
│   ├── interactionHelpers.js        # safeReply, isDuplicate, …
│   ├── rateLimiter.js
│   └── requestContext.js            # correlation ID por interacção
│
├── content/                         # copy user-facing (PT-PT)
├── panels/                          # painéis + acções colocadas
│   ├── chefiaPanel.js               # UI
│   ├── chefiaActions.js             # handlers dos botões do painel
│   ├── bairristaPanel.js
│   ├── oficialPanel.js
│   ├── patraoDiZonaPanel.js
│   └── patraoDiZonaActions.js
│
├── queries/                         # slash-command handlers user-facing
├── admin/                           # slash-command handlers de chefia
├── maintenance/                     # slash-command handlers operacionais
│
├── saidas/        │ saidaEngine, saidaHandlers, scoring, settlement, …
├── inventory/     │ inventoryEngine, stockManager, handlers, notifier, …
├── onboarding/    │ onboardingEngine + offboarding + handlers
├── members/       │ memberHandlers, bairristaHandlers, stats, backfill
├── rankings/      │ rankingEngine, monthly, bairristaSummaryJobs
├── kills/         │ killEngine + handlers
├── audit/         │ auditEngine + repo
├── availability/  │ availabilityEngine + handlers
├── radio/         │ radioEngine + handlers
├── sticky/        │ stickyEngine + renderers
├── reconcile/     │ drift detection + fixes por domínio
├── discord/       │ structureSync, channelInvariants, layoutCheck
├── jobs/          │ scheduler + retentionJob + promotionJob
├── permissions/   │ permissionEngine (isChefia, canManage*)
├── repositories/  │ thin data-access (memberRepo, saidaRepo, …)
├── sheets/        │ syncEngine, batchWriter, tabs/, projections.js
├── panels/panelBootstrap.js  # publica painéis ao arranque
├── lib/           │ metrics, dataHealth
└── web/           │ healthcheck + /ready
```

## Fluxo de uma interacção

```
Discord → client.on(InteractionCreate) → onInteraction
    └── ctx.run({ actorId, action, correlationId }, …)
        ├── isAutocomplete?    → handleAutocomplete
        ├── rate-limit check   → allow / deny
        └── dispatch           → handleSlash / handleButton / handleSelect / …
                                    └── route.handler(interaction)
                                            └── engine call (DB + audit)
                                                    └── eventBus.emitAsync('saida.closed', …)
                                                            └── subscriber → sheets/projections → syncOne(tab)
```

## Event bus

Eventos canónicos (em `src/core/eventBus.js`):

| Evento                | Emitido em                              | Subscritores actuais              |
|-----------------------|-----------------------------------------|-----------------------------------|
| `saida.closed`        | `saidaEngine.closeSaida`                | `sheets/projections`              |
| `material.registered` | `inventoryEngine.recordDelivery`        | `sheets/projections`              |
| `member.promoted`     | `onboardingEngine.handlePromotionToOficial` | `sheets/projections`          |
| `kill.registered`     | `killEngine.recordKill`                 | `sheets/projections`              |

Subscribers registam-se em `registerSheetProjections()` (chamado no
`bootstrap` antes do Discord login). Debounce de 5s agrupa rajadas.

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
- **Content layer.** Strings PT-PT em `src/content/*`. Nunca espalhadas.
- **Idempotência.** Syncs, rebuilds e reconciles podem correr 2×.
- **Preempção.** `instanceCoordinator` força shutdown da instância antiga.

## Onde mexer quando…

| Tarefa                                          | Começa em                          |
|-------------------------------------------------|------------------------------------|
| Novo slash command                              | `slashCommands.js` + router slash  |
| Novo botão num painel                           | painel + `panels/*Actions.js` + router buttons |
| Novo domínio                                    | criar `src/<dominio>/` + repo      |
| Corrigir cópia user-facing                      | `src/content/*`                    |
| Nova tab no Sheets                              | `src/sheets/tabs/` + registar em `syncEngine` |
| Novo evento de domínio                          | emitir na engine + registar em `projections` |
| Reconcile drift entre DB / Discord / Sheets     | `src/reconcile/`                   |

---

**Firma RedWood**
