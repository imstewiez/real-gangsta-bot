# Scheduler — Jobs e Dependências

Inventário completo dos jobs agendados, intervalos, garantias de idempotência
e dependências entre eles. Fonte: `src/jobs/scheduler.js`.

---

## Lista completa (13 jobs)

| Nome | Intervalo | runOnStart | Depende de | O que faz |
|---|---|---|---|---|
| `weekly_rankings` | 30 min | não | `AUTO_PUBLISH_WEEKLY_TOP=true` | Publica top semanal no canal WEEKLY_TOP no dia/hora configurados |
| `daily_summary` | 30 min | não | — | Publica resumo diário no canal DAILY_SUMMARY à hora configurada |
| `role_invariants` | 24h | não | DB + Discord guild | Reconcilia YB/OG/GF ⇒ BAIRRISTAS_BASE (corrige drift) |
| `retention` | 24h | não | DB | Remove audit_logs > 365d, job_runs > 90d, radio_history > 365d |
| `reconcile_daily` | 24h | não | DB + Discord guild | Dry-run de drift detection → Prometheus gauges |
| `data_health_collect` | 5 min | **sim** | DB + Discord guild | Actualiza gauges (stale tabs, drift, retention, stuck jobs) |
| `stock_alerts` | 1h | **sim** | DB + STOCK canal | Posta alerta se item.balance < alert_threshold (throttle 24h) |
| `monthly_rankings` | 6h | **sim** | DB | Calcula rankings do mês + all_time_stats |
| `catalog_prices` | 7d | não | DB + config/prices-catalog.json | Aplica preços do JSON à tabela items |
| `sticky_time_refresh` | 1 min | não | Discord guild | Refaz posts sticky `mode=repost` que ultrapassaram threshold_minutes |
| `stock_summary` | N h (config) | não | `STOCK_NOTIFY_ENABLED=true` | Snapshot periódico no canal resumo-stock |
| `availability_auto_publish` | 5 min | não | `AVAILABILITY_AUTO_PUBLISH_ENABLED=true` + AVAILABILITY_CHANNEL_ID | Abre sessão diária de disponibilidade à hora configurada |
| `bairrista_daily_summary` | 30 min | não | — | Publica resumo diário dos bairristas (log-bairristas) |
| `bairrista_weekly_summary` | 6h | não | — | Publica resumo semanal dos bairristas à sexta |
| `bairrista_monthly_summary` | 12h | não | — | Publica resumo mensal dos bairristas no dia 1 |
| `spot_cooldown_expirer` | 1 min | **sim** | DB + Discord client | Apaga cooldowns expirados (`expires_at <= NOW()`) e edita a mensagem pública para "Spot livre" |

---

## Garantias de idempotência

### Ao nível do scheduler
Cada job tem flag `_running` que previne overlap no mesmo processo. Se uma
execução demora mais do que o intervalo, a segunda é saltada com log
informativo (`Job '${name}' still running — skipped overlap`).

### Ao nível do handler
Cada job que escreve em algum sítio partilhado tem a sua própria salvaguarda:

- **rankings** (`weekly_rankings`, `monthly_rankings`): usam UPSERT contra
  `weekly_rankings` / `monthly_rankings` (uq index em `member_id + start_date`).
  Recomputar duas vezes é safe.
- **availability_auto_publish**: guard-rail `getOpenSession(channel, date)` +
  unique index em `(channel_id, date)` na tabela. Já aberta → skip.
- **retention**: DELETE com WHERE por timestamp — idempotente por design,
  correr 2× no mesmo minuto faz 0 delete no segundo.
- **data_health_collect**: overwrite puro dos Prometheus gauges; 2× = idem.
- **stock_alerts**: tabela `stock_alert_history` com throttle 24h via
  `last_sent_at`. Segundo disparo no mesmo dia é skip.
- **bairrista_*_summary**: guard-rail interno (`hour !== HOUR → skip`,
  `date !== 1 → skip`); idempotência em cima.
- **reconcile_daily**: sempre `dryRun: true` — só escreve gauges, não muda
  state.
- **role_invariants**: apply é idempotente por natureza — se roles já estão
  correctos é no-op.

**Conclusão**: todos os jobs sobrevivem a re-execução. Nenhum depende de
"primeira vez" com side-effects cumulativos.

---

## Dependências implícitas entre jobs

Nenhuma dependência **hard** (nenhum job espera que outro termine para
arrancar). Mas existem dependências **soft** — jobs que partilham estado e
cuja ordem pode afectar semântica:

| Antes → Depois | Acoplamento | Comentário |
|---|---|---|
| `role_invariants` → `monthly_rankings` | frouxo | Se invariants corrigirem o role dum membro, o próximo `monthly_rankings` vê-o certo. Não é crítico porque rankings agrupam por member_id, não por role. |
| `availability_auto_publish` → `bairrista_daily_summary` | nenhum | Operam em tabelas diferentes. |
| `retention` → `monthly_rankings` | frouxo | `retention` apaga audit_logs > 365d. Rankings calculam desde o início; se corresse antes na mesma janela podia afectar all_time_stats se houvesse dependência em audit_logs (não há). |
| `data_health_collect` → (todos) | nenhum | Só regista observação. |
| `stock_alerts` ← ordem `role_invariants` | nenhum | Stock não depende de roles. |

**Regra de segurança**: quando for adicionar um job novo que dependa de
estado escrito por outro, **documentar aqui explicitamente** e considerar
se precisa de dependency graph / topological execution. Até lá, ordem é
arbitrária (intervalos são co-primos na prática).

---

## Como adicionar um job

1. `registerJob('name', intervalMs, fn, { runOnStart? })` em `src/jobs/scheduler.js`
2. Handler em `src/jobs/*.js` ou no domínio apropriado
3. Idempotência: usar UPSERT, unique indexes, ou guard-rails de "já feito hoje"
4. Métricas: `metrics.jobRunsTotal.inc()` + `metrics.jobsByName.inc({ job })`
   são automáticas via wrapper
5. Adicionar linha à tabela acima + qualquer dependência em "Dependências
   implícitas"
6. Teste: adicionar a `test/` (em `test/jobs/` se passar a haver muitos)

---

## Troubleshooting

### Job parece não estar a correr
1. `CONFIG.ENABLE_BACKGROUND_JOBS` está true?
2. Verificar logs: `[SCHEDULER] Job 'X' registered` apareceu no boot?
3. Tabela `job_runs` tem entries recentes? (`jobRepo.startJob` regista)
4. Prometheus: `job_errors_total` está a subir?

### Job corre mas não faz nada
1. Guard-rails ("wrong_hour", "wrong_day", "skipped: already_open") são
   comportamento normal — não são bugs.
2. Verificar que o env (canal, role IDs) está populado (validator no boot
   já reporta em falta).

### Job em concorrência
- `_running` flag previne overlap intra-processo.
- Inter-processos: protegido por `acquireInstanceLockWithRetry` no
  bootstrap — só uma instância corre jobs.
