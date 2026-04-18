# Operações — Guia de Manutenção

## Severidade por Componente

| Componente | Nível | Acção se falhar |
|-----------|-------|-----------------|
| DATABASE_URL | fatal | Bot não arranca |
| DISCORD_BOT_TOKEN | fatal | Bot não arranca |
| Discord login | fatal | Bot não arranca |
| Advisory lock | fatal | Bot aborta após 90s |
| Slash commands | degraded | Bot arranca, comandos podem estar desatualizados |
| Panel bootstrap | degraded | Bot funciona, painéis podem estar stale |
| Google Sheets | recoverable | Tabs não sincronizam até credenciais serem configuradas |
| Stock notifier | recoverable | Entregas registam-se, notificação é no-op |
| Background jobs | recoverable | Stats e rankings atrasam até próximo ciclo |

## Jobs e Intervalos

| Job | Intervalo | runOnStart | Descrição |
|-----|-----------|-----------|-----------|
| data_health_collect | 5 min | sim | Métricas Prometheus (stale tabs, drift, stuck jobs) |
| stock_alerts | 1h | sim | Alertas de stock abaixo do threshold |
| monthly_rankings | 6h | sim | Rankings mensais + all-time |
| weekly_rankings | 30 min | não | Publica top semanal (verifica dia/hora) |
| daily_summary | 30 min | não | Resumo diário (verifica hora) |
| role_invariants | 24h | não | Reconcilia tiers + role base |
| reconcile_daily | 24h | não | Detecta drift Discord↔DB (dry-run) |
| retention | 24h | não | Limpa audit_logs > 365d, job_runs > 90d |
| catalog_prices | 7 dias | não | Sync preços do catálogo |
| sticky_time_refresh | 1 min | não | Refresh painéis sticky |
| stock_summary | 4h | não | Snapshot periódico no canal resumo-stock |
| availability_auto_publish | 5 min | não | Chamada diária (verifica hora) |
| bairrista_daily_summary | 30 min | não | Resumo diário bairristas |
| bairrista_weekly_summary | 6h | não | Resumo semanal bairristas |
| bairrista_monthly_summary | 12h | não | Resumo mensal bairristas |
| spot_cooldown_expirer | 1 min | sim | Apaga cooldowns de spot expirados + edita notificação para "livre" |

## Endpoints HTTP

| Path | Tipo | Descrição |
|------|------|-----------|
| /health | readiness | 200 quando bot está pronto (Discord + DB + panels) |
| /ready | readiness | 200 com latência DB e ping Discord |
| /health/full | deep health | Status detalhado (guild, RAM, uptime) |
| /metrics | Prometheus | Counters + gauges (protegido por METRICS_TOKEN se definido) |
| /version | info | Versão, node, nomes do bot |

## Deploy e Rollback

### Deploy normal
1. Push para `main` → Railway redeploy automático
2. Bot arranca: migrations → catalog → Discord → panels → scheduler
3. /health retorna 503 durante boot, 200 quando pronto

### Rollback
1. `git revert HEAD` + push (rollback de código)
2. Migrations NÃO fazem rollback automático — são forward-only
3. Se uma migration nova partir algo, corrigir com nova migration (nunca editar a antiga)

### Staging
- Actualmente não há ambiente staging separado
- Para testar: usar guild de teste + DB separada via env vars
- Recomendado: criar projecto Railway staging com DB própria

## Disaster Recovery

### Backup da DB

**Railway** oferece backups automáticos diários do Postgres plugin (confirmar
na UI do projecto Railway → Data → Backups). Retention standard: 7 dias.
Backups são restauráveis via Railway UI.

**Backup manual** para segurança adicional ou antes de migração tocante:
```bash
# Local (assumindo DATABASE_URL exportado)
./scripts/manual/backupDb.sh
# Output: ./snapshots/bot-di-zona-YYYY-MM-DD-HHMM.dump

# Com retention de 14 dias em pasta específica
DATABASE_URL="..." BACKUP_DIR=/tmp/bot-backups RETAIN_DAYS=14 \
  ./scripts/manual/backupDb.sh
```

Formato: pg_dump custom (`-Fc`). Compressed, permite restore selectivo e
paralelismo com `pg_restore --jobs N`.

### Restore

**Fluxo seguro:**

1. **Pára o bot** antes de restaurar:
   ```bash
   # No Railway: Deploy menu → "Pause Service"
   # (não basta fazer revert de código — connections activas podem corromper restore)
   ```
2. **Verifica o backup** antes de usar:
   ```bash
   pg_restore --list bot-di-zona-YYYY-MM-DD-HHMM.dump | head -20
   ```
3. **Restore** para DB limpa (preferível) ou com `--clean`:
   ```bash
   # Target DB vazia:
   pg_restore --no-owner --no-privileges --jobs=4 \
     -d "$TARGET_DATABASE_URL" bot-di-zona-YYYY-MM-DD-HHMM.dump

   # Target DB com dados (overwrite):
   pg_restore --clean --if-exists --no-owner --no-privileges --jobs=4 \
     -d "$TARGET_DATABASE_URL" bot-di-zona-YYYY-MM-DD-HHMM.dump
   ```
4. **Sanity check** pós-restore:
   ```sql
   SELECT COUNT(*) FROM schema_migrations;        -- esperar 29+
   SELECT COUNT(*) FROM members WHERE status='ativo'; -- esperar número razoável
   SELECT MAX(id) FROM operations;                -- maior id esperado
   ```
5. **Re-arranca o bot** (unpause Railway) e monitoriza `/health` durante 5 min.
6. Se OK, documenta o incidente em `docs/CHANGELOG.md` secção "Incidentes".

### Runbook — Cenários

#### Cenário 1 — Migration partiu schema em prod

**Sintomas:** bot em crash loop após deploy, logs mostram erro de schema,
`/health` 503 permanente.

1. Abrir Railway logs → identificar qual migration falhou
2. Fazer `git revert` do commit que adicionou a migration + push
3. **Importante:** revert de código NÃO reverte a migration já aplicada. Se
   a migration tocou tabelas existentes de forma quebrada, criar nova
   migration N+1 que corrige forward (ex: re-recria constraint correcta)
4. Só em último caso: restore de snapshot (perde dados recentes)

#### Cenário 2 — DB corrompida

**Sintomas:** queries erram com "invalid page", "xid wrap", ou rows faltam
sem explicação.

1. Pausar o bot imediatamente
2. `pg_dump` do estado actual (mesmo corrompido — referência para pós-mortem)
3. Restore do último snapshot limpo (Railway UI ou backup manual)
4. Validar sanity checks (contagens acima)
5. Unpause + monitoriza `/health`
6. Pós-mortem: analisar dump corrompido + logs Railway para causa raiz

#### Cenário 3 — Bot em crash loop

**Sintomas:** `/health` 503, Railway mostra restarts consecutivos.

1. Consultar `/health/full` (se acessível) → identifica componente que falha
2. Railway logs → stack trace + `correlationId`
3. Erros comuns:
   - `acquireInstanceLockWithRetry` timeout → instância antiga não saiu; esperar 90s ou forçar delete de `bot_instances` antiga na DB
   - `validateOrExit` error → env var em falta / inválida (ver relatório que imprime no boot)
   - Migration error → ver Cenário 1
4. Se `correlationId` não aparece nos logs (crash pre-bootstrap), verificar
   DATABASE_URL + DISCORD_BOT_TOKEN

#### Cenário 4 — Discord bot token comprometido

**Sintomas:** bot faz coisas estranhas, logs mostram chamadas API não
originadas pelo código, ou recebeste notificação do Discord.

1. **Imediato:** ir ao [Discord Developer Portal](https://discord.com/developers/applications)
   → Bot → "Reset Token"
2. Pausar o serviço Railway (o token antigo fica morto, novo ainda não
   está no env)
3. Actualizar `DISCORD_BOT_TOKEN` no Railway
4. Unpause → bot re-arranca com token novo
5. Auditar `audit_logs` nas últimas 24h antes do reset — procurar acções
   fora do padrão (role changes sem actor conhecido, etc.)
6. Pós-incidente: revisar como o token leak aconteceu (repo leak? dev
   máquina? screenshot?) e fechar o vector

### Backups em Intervalo Regular (automação recomendada)

Opção A — Railway built-in (confirmar tier):
- Dashboard → Postgres plugin → "Backups" tab
- Se disponível, configurar retention para 14 dias mínimo

Opção B — cron externo (mais controlo):
```bash
# Em qualquer máquina com acesso ao DATABASE_URL + pg_dump
# crontab -e:
0 4 * * * cd /path/to/repo && DATABASE_URL="..." BACKUP_DIR=/backups RETAIN_DAYS=30 ./scripts/manual/backupDb.sh
```

Opção C — GitHub Action (se budget permitir):
```yaml
# .github/workflows/backup.yml — diário 04:00 UTC
# Usa secret DATABASE_URL_READONLY + storage bucket para upload.
```
Não implementado actualmente. Avaliar quando a operação crescer.

## Variáveis de Ambiente Obrigatórias

| Var | Descrição |
|-----|-----------|
| DATABASE_URL | Connection string PostgreSQL |
| DISCORD_BOT_TOKEN | Token do bot Discord |
| DISCORD_GUILD_ID | ID do servidor Discord |

## Variáveis Opcionais Importantes

| Var | Default | Descrição |
|-----|---------|-----------|
| ENABLE_BACKGROUND_JOBS | false | Activar scheduler de jobs |
| DB_SSL_MODE | auto | off / require / verify |
| METRICS_TOKEN | (vazio) | Bearer token para /metrics |
| GOOGLE_SERVICE_ACCOUNT_JSON | (vazio) | Credenciais Google Sheets |
| SPREADSHEET_ID | (vazio) | ID do Google Sheet |
| SPOT_COOLDOWN_MINUTES | 30 | Minutos que um spot fica "queimado" após saída |
| SPOT_COOLDOWN_CHANNEL_ID | (default p/ canal RP fornecido) | Canal público das notificações de cooldown |
| PROMO_YOUNG_BLOOD_TO_GUNAO | 25000 | Threshold em unidades para promoção YB → O Gunão |
| PROMO_GUNAO_TO_GANGSTER_FODIDO | 50000 | Threshold unidades O Gunão → Gangster Fodido |
| AUTO_PUBLISH_WEEKLY_TOP | true | Publica top semanal no canal configurado |
| WEEKLY_TOP_DAY | 0 | Dia da semana do top (0=Dom..6=Sáb) |
| WEEKLY_TOP_HOUR | 23 | Hora local Lisbon do top semanal |
