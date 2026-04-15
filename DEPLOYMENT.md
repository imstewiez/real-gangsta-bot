# Deployment Guide

## Railway Setup

### Prerequisites
- Railway account with a project
- PostgreSQL service added to the project
- Discord bot application created at [discord.com/developers](https://discord.com/developers)

### Initial Deploy

1. **Connect repository** to Railway via GitHub integration.

2. **Add PostgreSQL** service in Railway dashboard — the `DATABASE_URL` variable is injected automatically.

3. **Set environment variables** (Settings → Variables):

   ```
   DISCORD_BOT_TOKEN=<your bot token>
   DISCORD_GUILD_ID=<your server ID>
   NODE_ENV=production
   ```

   See `.env.example` for the full list of optional variables.

4. **Deploy** — Railway will detect `railway.toml` and use Railpack builder automatically.

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISCORD_BOT_TOKEN` | ✅ | — | Bot token from Discord Developer Portal |
| `DISCORD_GUILD_ID` | ✅ | — | Target server (guild) ID |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string (auto-set by Railway) |
| `NODE_ENV` | — | `development` | Set to `production` on Railway |
| `PORT` | — | `3000` | HTTP server port (auto-set by Railway) |
| `DB_POOL_MAX` | — | `25` | Maximum DB connection pool size |
| `DB_POOL_MIN` | — | `5` | Minimum warm connections in pool |
| `DB_SLOW_QUERY_MS` | — | `500` | Log queries slower than this threshold |
| `LOG_LEVEL` | — | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `ENABLE_BACKGROUND_JOBS` | — | `false` | Enable scheduled jobs (rankings, availability) |

See `.env.example` for the complete list including role IDs, channel IDs, and feature flags.

### Healthcheck Configuration

The bot exposes three health endpoints:

| Endpoint | Purpose | Returns |
|---|---|---|
| `/health` | Liveness probe — process is alive | `200 {"status":"ok"}` |
| `/ready` | Readiness probe — Discord + DB connected | `200/503` |
| `/health/full` | Deep health — all subsystems | `200/503` with details |
| `/metrics` | Prometheus metrics | `200 text/plain` |

Railway's healthcheck is configured in `railway.toml`:
```toml
healthcheckPath = "/health"
healthcheckTimeout = 30
```

The `/health` endpoint responds immediately (no DB/Discord check) so the platform can route traffic while the bot acquires its singleton lock and connects to Discord.

### Scaling Considerations

This bot is designed for **single-instance** operation. It uses a PostgreSQL advisory lock (`pg_advisory_lock`) to prevent two instances from running simultaneously. If Railway starts a new deployment, the new instance waits up to 90 seconds for the old one to release the lock.

**Do not** scale to multiple replicas — the advisory lock will cause one instance to wait indefinitely.

### Build Cache Optimization

Railpack caches `node_modules` between builds. The `package-lock.json` is committed to ensure reproducible installs. If you add new dependencies, the cache is automatically invalidated.

### Rollback Procedures

1. In Railway dashboard, go to **Deployments**.
2. Find the last successful deployment.
3. Click **Redeploy** on that deployment.

The bot will restart with the old code. Database migrations are forward-only — if a migration was applied in the failed deployment, it will not be rolled back. Design migrations to be backward-compatible.

### Monitoring Setup

1. **Prometheus**: Scrape `/metrics` endpoint (port 3000 by default).
2. **Alerting**: Alert on `rg_interaction_errors_total` rate > 0.1/min.
3. **Logs**: Railway streams stdout/stderr. Use `LOG_LEVEL=debug` for verbose output.

### Common Issues

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed debug steps.
