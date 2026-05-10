# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Panel System** — centralized panel rendering (`panelSystem.js`) with consolidated CTE queries (`panelRepo.js`) for chefia/oficial/bairrista/patrao/entrada dashboards.
- **Bairrista Cart** — multi-item cart with line merging, PostgreSQL-backed session store (`cartStore.js`), TTL 15min, and atomic batch delivery (`recordDeliveryBatch`).
- **Delivery Type Column** — `tipo` column on delivery requests (entrega/venda) with migration `069/070`.
- **Structured Error Hierarchy** — `BotError`, `UserError`, `ValidationError`, `PermissionError`, `NotFoundError`, `ConflictError`, `InternalError` with user-facing detection in `interactionRouter.js`.
- **Materialized Inventory Balance** — `inventory_balance` table with caching and automatic recalculation.
- **Inventory Advisory Locks** — per-member `pg_advisory_xact_lock` to prevent stock race conditions.
- **Saida State Machine** — extracted `saidaStateMachine.js` with explicit `ALLOWED_TRANSITIONS`, `canTransition`, and terminal state detection.
- **Kill Validation** — self-kill prevention, active member verification, and daily rate limit (50/day).
- **Ranking Normalization** — percentile-based scoring (0–1000) instead of raw weighted values.
- **Safe Embed Builder** — `SafeEmbedBuilder` enforcing Discord limits (title ≤256, desc ≤4096, total ≤6000 chars).
- **Notification Queue** — `pending_notifications` table with retry, priority, and `notificationJob.js` processing every 30s.
- **Audit Pagination & Indexes** — `idx_audit_logs_actor_created`, `idx_audit_logs_action_created`, `idx_audit_logs_entity`.
- **Google Sheets DLQ** — `sync_retries` table with exponential backoff retry job (`sheetsRetryJob.js`).
- **Google Rate Limiter** — token bucket (90 req/100s) via `googleRateLimiter.js`.
- **Circuit Breaker Persistence** — `circuit_state` table preserving breaker state across restarts.
- **Job Lease & Zombie Recovery** — `job_runs.lease_expires_at` + `instance_id` with heartbeat pattern.
- **Bootstrap State Machine** — 8-phase boot with `/ready` readiness probe (returns 503 until phase 8).
- **Migration Distributed Lock** — `pg_try_advisory_lock(884729105)` prevents parallel migration runs.
- **Drain Mode** — graceful shutdown with `drainActiveJobs(30000)` and interaction rejection during SIGTERM.
- **Discord Mocks** — `test/helpers/discordMocks.js` for unit testing without `DISCORD_BOT_TOKEN`.
- **Constants Module** — `src/shared/constants.js` centralizing Time, Limits, and Sheets magic numbers.

### Changed
- **Node.js 18 → 22** — upgraded Dockerfile and `package.json` engines.
- **Metrics Auth** — `/metrics` returns 503 if `METRICS_TOKEN` absent; otherwise requires Bearer token.
- **Slash Command Permissions** — changed from `Administrator` to `ManageGuild` for 13 commands.
- **Panel Repo JOINs** — fixed `CROSS JOIN` patterns to `LEFT JOIN` with anchor table for null safety.
- **Date Trunc Queries** — replaced non-sargable `date_trunc` filters with range queries + partial index.
- **Coverage Thresholds** — realistic thresholds (lines 26%, branches 60%) with reduced excludes.

### Fixed
- **SQL Injection** — dynamic column updates now validated via `sqlColumnGuard.js` whitelist.
- **Stock Race Conditions** — `removeStock`/`transferStock`/`adjustStock` wrapped in transactions.
- **Schema Drift** — migrations `071–076` fixing role CHECK constraint, missing FKs, ON DELETE cascades, JSONB conversion, GIN indexes.
- **Sheets Batch Explosion** — `BatchWriter.flush()` auto-splits into chunks of 900 requests.
- **Zombie Jobs** — `Promise.race` with 60s timeout in `scheduler.js`.
- **Event Bus** — `Promise.allSettled` + critical subscriber flag prevents silent swallowing of projection failures.
- **Self-Kill Prevention** — `killerDiscordId === victimDiscordId` rejected with `ConflictError`.
- **Notes Truncation** — `setNotes` now throws `ValidationError` instead of silently slicing.
- **Format Metric** — `0` no longer coerced to `'—'`.

### Security
- Secrets removed from repository (`railway-vars.txt`, login files).
- `.gitignore` and `.dockerignore` hardened.
- CI/CD pipeline with separate migrate → deploy → smoke test jobs.

## [2.0.0] - 2024-XX-XX

### Added
- Initial panel system with per-role dashboards.
- Multi-item bairrista cart.
- Delivery type differentiation (entrega/venda).
