# Troubleshooting

## Common Issues

### Bot fails to start — "Não foi possível adquirir lock após 90s"

**Cause**: Another instance is holding the PostgreSQL advisory lock. This happens when:
- A previous deployment didn't shut down cleanly
- Two deployments are running simultaneously

**Fix**:
1. Check Railway deployments — ensure only one is active.
2. If stuck, connect to the database and run:
   ```sql
   SELECT pg_advisory_unlock(985432107);
   ```
   (Replace `985432107` with your `INSTANCE_LOCK_ID` if customized.)
3. Redeploy.

---

### Bot starts but doesn't respond to commands

**Check**:
1. `/health` returns `200` — process is alive.
2. `/ready` returns `200` — Discord is connected and DB is responsive.
3. Slash commands are registered — check logs for `[READY] Slash commands registados.`
4. Bot has correct permissions in the Discord server (Send Messages, Use Slash Commands, Manage Roles, Manage Channels).

---

### "Falha interna" error on every interaction

**Cause**: Unhandled exception in a handler. The error boundary catches it and replies with a generic message.

**Debug**:
1. Check logs for `[ERROR_BOUNDARY]` or `[INTERACTION] Unhandled error` entries.
2. The log includes `user=`, `guild=`, and the full stack trace.
3. Enable `LOG_LEVEL=debug` for more verbose output.

---

### Database connection errors

**Symptoms**: `[DB] Erro inesperado no pool de conexões` in logs, or interactions timing out.

**Check**:
1. `DATABASE_URL` is set correctly.
2. Railway PostgreSQL service is running.
3. Pool size: `DB_POOL_MAX` (default 25). If you see "too many clients", reduce it or increase PostgreSQL's `max_connections`.
4. Check `/metrics` for `rg_db_pool_waiting` — if consistently > 0, the pool is saturated.

---

### Slow queries

**Symptoms**: Interactions take >500ms, `[DB:SLOW]` entries in logs.

**Debug**:
1. Check logs for `[DB:SLOW]` — includes the query text and duration.
2. Run `EXPLAIN ANALYZE` on the slow query in psql.
3. Check that migrations have been applied (indexes are created in `dbMigrate.js`).
4. Adjust `DB_SLOW_QUERY_MS` threshold if needed.

---

### Rate limit errors ("⏱️ Calma")

**Cause**: User is sending too many requests. Default: 10 commands per 10 seconds.

**For admins**: Admin users (Discord `Administrator` permission) get a higher limit (30/10s).

**Adjust**: Rate limits are configured in `src/index.js` (`_dispatchInteraction`). The `rateLimiter.allow()` call accepts `{ limit, windowMs }`.

---

### Panels not updating / sticky messages broken

**Check**:
1. Bot has `Manage Messages` permission in the channel.
2. `PANELS_STICKY_MODE` is set correctly (`repost` or `update`).
3. Check logs for `[STICKY]` or `[PANEL]` errors.
4. Run `/rg-sync-panels` to force-refresh all panels.

---

### Rankings not updating

**Check**:
1. `ENABLE_BACKGROUND_JOBS=true` is set.
2. Check logs for `[JOB]` entries — jobs run on a schedule.
3. Run `/rg-rebuild-rankings` to force a recalculation.
4. Check `job_runs` table for failed jobs:
   ```sql
   SELECT * FROM job_runs WHERE status = 'failed' ORDER BY started_at DESC LIMIT 10;
   ```

---

### Google Sheets sync failing

**Check**:
1. `GOOGLE_SERVICE_ACCOUNT_JSON` is set (inline JSON or file path).
2. `SPREADSHEET_ID` is set.
3. Service account has Editor access to the spreadsheet.
4. Check logs for `[SHEETS]` errors.
5. Run `/rg-sync-sheets` manually to see the error.

---

## Performance Tuning

### Memory usage

Normal: 35–50 MB RSS. If growing unboundedly:
1. Check for memory leaks in custom handlers.
2. Reduce `LOG_SESSION_KEEP_DAYS` to clean up log files faster.
3. Check `rg_cache_size` metric — cache should not grow unboundedly (TTL cleanup runs every 5 minutes).

### DB pool tuning

- `DB_POOL_MAX=25` — suitable for most workloads.
- If Railway PostgreSQL plan has `max_connections=25`, set `DB_POOL_MAX=20` to leave headroom.
- Monitor `rg_db_pool_waiting` metric — should be 0 at rest.

### Interaction response time

- Target: <200ms for simple queries, <1000ms for complex operations.
- Check `rg_interaction_response_time_ms_sum / rg_interaction_response_time_ms_count` for average.
- Slow interactions are usually DB queries — check `[DB:SLOW]` logs.

---

## Debug Mode

Enable verbose logging:
```
LOG_LEVEL=debug
```

This logs every interaction start/end with correlation IDs, making it easy to trace a specific user's request through the logs.

Filter logs by correlation ID:
```bash
grep "req_abc123" logs/realgangsta-debug.log
```

---

## Database Troubleshooting

### Check applied migrations
```sql
SELECT id, name, applied_at FROM schema_migrations ORDER BY id;
```

### Check active connections
```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

### Check slow queries (PostgreSQL)
```sql
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Check advisory lock status
```sql
SELECT * FROM pg_locks WHERE locktype = 'advisory';
```
