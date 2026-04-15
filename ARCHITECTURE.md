# Architecture

## System Overview

Real Gangsta Bot is a Discord.js v14 bot that manages a roleplay community server. It uses PostgreSQL as the source of truth and exposes a web server for health checks and Prometheus metrics.

```
Discord API
    │
    ▼
discord.js Client
    │
    ├── InteractionCreate ──► requestContext.run() ──► _dispatchInteraction()
    │                                                        │
    │                                                        ├── Slash commands
    │                                                        ├── Button handlers
    │                                                        ├── Select menus
    │                                                        └── Modal submissions
    │
    ├── GuildMemberAdd ──► auto-assign Pendente role
    ├── GuildMemberRemove ──► offboardingEngine
    ├── GuildMemberUpdate ──► promotionEngine (role change detection)
    └── MessageCreate ──► stickyEngine (repost mode)

HTTP Server (port 3000)
    ├── GET /health       → liveness probe
    ├── GET /ready        → readiness probe (Discord + DB)
    ├── GET /health/full  → deep health check
    ├── GET /metrics      → Prometheus metrics
    └── GET /version      → build info
```

## Module Responsibilities

### Core Infrastructure
| Module | Responsibility |
|---|---|
| `src/index.js` | Entry point, Discord client, interaction dispatcher |
| `src/config.js` | Environment variable loading, role/channel ID constants |
| `src/db.js` | PostgreSQL pool, advisory lock, slow query logging |
| `src/dbMigrate.js` | Schema migrations (ordered by ID, idempotent) |
| `src/logger.js` | Structured logging, log rotation, correlation IDs |
| `src/cache.js` | In-memory TTL cache with invalidation helpers |
| `src/lib/metrics.js` | Prometheus counters, gauges, histograms |
| `src/web/server.js` | HTTP health/metrics server |

### Domain Engines
| Module | Responsibility |
|---|---|
| `src/onboarding/` | Tag requests, member approval, offboarding |
| `src/inventory/` | Material ledger, stock calculation, notifications |
| `src/saidas/` | Operations (saídas), participants, settlement wizard |
| `src/members/` | Member profiles, auto-promotion, role invariants |
| `src/rankings/` | Weekly/monthly/all-time ranking computation |
| `src/availability/` | Daily availability sessions and voting |
| `src/radio/` | Radio frequency management |
| `src/kills/` | Kill registration and leaderboard |
| `src/sticky/` | Sticky message management |
| `src/audit/` | Audit log recording and retrieval |

### Shared Utilities
| Module | Responsibility |
|---|---|
| `src/shared/rateLimiter.js` | Per-user/guild sliding window rate limiting |
| `src/shared/requestContext.js` | AsyncLocalStorage correlation ID propagation |
| `src/shared/interactionHelpers.js` | safeReply, safeUpdate, safeShowModal |
| `src/shared/inputValidators.js` | Modal input validation and sanitization |
| `src/middleware/errorBoundary.js` | Interaction error boundary with user-friendly replies |
| `src/middleware/withRetry.js` | Exponential backoff retry for transient failures |
| `src/middleware/withCache.js` | Cache-aside wrapper for async functions |
| `src/permissions/permissionEngine.js` | Role-based permission checks |
| `src/repositories/` | Data access layer (one file per domain entity) |

## Data Flow

### Interaction Flow
```
User clicks button/command
    │
    ▼
client.on(InteractionCreate)
    │
    ├── metrics.discordEventsTotal.inc()
    ├── requestContext.run({ actorId, action, correlationId })
    │
    ▼
_dispatchInteraction(interaction)
    │
    ├── Rate limit check (per-user, per-action)
    ├── Permission check (role-based)
    │
    ▼
Domain handler (e.g. handleRegistarMaterialButton)
    │
    ├── Input validation (inputValidators.js)
    ├── Business logic (engine)
    ├── DB write (repository)
    ├── Audit log (auditEngine)
    ├── Cache invalidation (cache.js)
    └── Discord reply (safeReply/safeUpdate)
```

### Inventory Movement Flow
```
User submits quantity modal
    │
    ▼
handleQuantityModal (inventoryHandlers.js)
    │
    ▼
recordDelivery (inventoryEngine.js)
    │
    ├── memberRepo.findByDiscordId()
    ├── inventoryRepo.recordMovement()
    ├── metrics.inventoryMovements.inc()
    ├── logAudit()
    ├── cache.invalidateStock(itemId)
    └── notifyMovement() → stock channels
```

## Single-Instance Coordination

The bot uses PostgreSQL advisory locks to ensure only one instance runs at a time:

1. New instance starts → registers in `bot_instances` table
2. Acquires `pg_advisory_lock(INSTANCE_LOCK_ID)` with 90s retry
3. Old instance detects newer `started_at` in `bot_instances` → graceful shutdown
4. Old instance releases lock → new instance acquires it
5. New instance proceeds with migrations and Discord login

This prevents split-brain scenarios where two instances process the same interaction.

## Caching Strategy

The in-memory cache (`src/cache.js`) uses a TTL-based Map with automatic expiry:

| Data | TTL | Invalidated by |
|---|---|---|
| Weekly rankings | 1 hour | Any inventory movement |
| Monthly rankings | 24 hours | Monthly recalculation job |
| All-time stats | 7 days | Monthly recalculation job |
| Stock per item | 5 minutes | Inventory movement for that item |
| Member profile | 30 minutes | Role change, promotion |

Cache is process-local — a restart clears it. This is acceptable for single-instance deployments.

## Database Schema

Key tables (see `src/dbMigrate.js` for full schema):

- `members` — member registry with role, tier, status
- `inventory_movements` — immutable ledger (stock = SUM of movements)
- `operations` — saídas with participants and materials
- `audit_logs` — all significant actions with before/after state
- `weekly_rankings` / `monthly_rankings` / `all_time_stats` — pre-computed rankings
- `bot_instances` — instance registry for preemption detection
- `schema_migrations` — applied migration tracking

## Dependency Graph

```
index.js
  ├── config.js
  ├── db.js ──────────────────── pg
  ├── dbMigrate.js ──────────── db.js
  ├── logger.js ──────────────── fs, crypto
  ├── lib/metrics.js
  ├── cache.js ──────────────── logger.js
  ├── web/server.js ─────────── lib/metrics.js, db.js
  ├── shared/rateLimiter.js ─── lib/metrics.js
  ├── shared/requestContext.js ─ logger.js
  ├── repositories/ ─────────── db.js
  ├── permissions/ ──────────── config.js
  ├── [domain engines] ──────── repositories/, logger.js, lib/metrics.js
  └── discord.js ─────────────── (external)
```
