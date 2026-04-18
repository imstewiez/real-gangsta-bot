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
