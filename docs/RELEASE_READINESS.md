# Release Readiness — Bot di Zona / Firma RedWood

> Fonte única para a release lead. Actualizar a cada milestone — não a cada
> commit. A actualidade deste documento é uma **responsabilidade**, não uma
> sugestão. Se estás a trabalhar num item listado, abre issue antes.
>
> Última revisão: **2026-04-18** · Commit de referência: **`e0b820a` → após alignment pass**
>
> Documentos vivos complementares:
> - `docs/TECH_DEBT.md` — backlog técnico (severidade + estado)
> - `docs/OPERATIONS.md` — ops, jobs, env, rollback
> - `docs/ARCHITECTURE.md` — composição do sistema
> - `docs/JOBS.md` — detalhes de cada job (idempotência, dependências)
> - `docs/IDEMPOTENCY.md` — race conditions conhecidas
> - `docs/DEPRECATION.md` — política formal + histórico

---

## 1. State of play

| Dimensão | Nota | Observação |
|---|---|---|
| Arquitectura | 9/10 | Composição clara, bootstrap em fases nomeadas, engines vs handlers separados |
| Operação / produção | 9/10 | Healthcheck, Prometheus, graceful shutdown, instance coordinator, retention jobs |
| CI / testes | 8.5/10 | 293 unit + integration com postgres real; coverage 68.94% com thresholds enforced |
| Manutenibilidade | 8/10 | Governance docs em vigor; 12 módulos de domínio = carga cognitiva não-trivial |
| UX / copy | 7.5/10 | Tom RP forte é decisão de produto; clareza operacional para staff tem margem |
| **Global** | **8.8/10** | Sistema governado, com riscos identificados e controlados |

## 2. Strengths — o que está genuinamente excelente

1. **Config como código tratada com rigor** — `src/config/` partido em 13 domain files + validator forte no boot. Um bot que não arranca com config inválida poupa horas de debug.
2. **CI enforça qualidade** — lint, format, coverage com thresholds, integration tests com postgres real em job dedicado. Não é encenação — falha bloqueia merge.
3. **Schema evolution disciplinado** — 29 migrations, imutáveis, `DEPRECATION.md` formal, legacy removido em migration dedicada (027) com safety-net UPDATE antes do DROP.
4. **Observabilidade operacional** — `/health`, `/ready`, `/metrics`, `/version`. `data_health_collect` job actualiza gauges de 5 em 5 min. Drift detection em job separado.
5. **Single-instance enforced** — `instanceCoordinator` com advisory lock + heartbeat elimina classe inteira de bugs distribuídos. Decisão documentada em `RATE_LIMITING.md`.
6. **Audit trail ubíquo** — todas as mutações relevantes passam por `logAudit`. Retenção de 365d, políticas documentadas.

## 3. Weaknesses — onde ainda há margem

1. **Coverage selectiva** — 68.94% é honesto mas `src/sheets/**`, `src/content/**`, `src/reconcile/**`, `src/notifications/**` estão excluídos. Thresholds (65/75/50) são moderados.
2. **Integration tests são finos** — 16 casos em 3 ficheiros. Validam smoke + ledger + member lifecycle, mas não cobrem fluxos compostos (ex: saída end-to-end com DB real, onboarding com retry).
3. **Observabilidade sem alerta** — gauges Prometheus existem, nenhum sistema externo a fazer scrape + alarmistica. "Healthcheck verde" ≠ "sistema OK" quando drift silencioso cresce.
4. **Copy RP vs clareza operacional** — decisão consciente; torna-se risco se equipa cresce além de quem co-desenhou o tom.
5. **Dependências no Railway** — single deploy target, sem ambiente staging, sem plano de disaster recovery documentado além de `git revert`.

## 4. Real risks — o que pode partir em produção

Ordenados por probabilidade × impacto. **Estilo/preferência não é risco** — só listo aqui o que tem modo de falha concreto.

| # | Risco | Probabilidade | Impacto | Mitigação actual | Gap |
|---|---|---|---|---|---|
| R1 | Schema novo (migration 028, 029) falha silenciosamente em produção | Média | Alto | Integration test pós-alignment valida colunas + índices | ✅ Coberto em `dbSmoke.test.js` |
| R2 | Race entre `role_invariants` (job) e `promotionEngine` pode duplicar eventos `member.promoted` | Baixa | Médio | `docs/IDEMPOTENCY.md` documenta; UPSERT protege persistência | Advisory lock por user em `checkAndPromote` (backlog) |
| R3 | `spot_cooldown_expirer` falha ao editar mensagem — cooldown expira na DB mas embed fica vermelho | Média | Baixo | `.catch(() => {})` + próximo run repete | ✅ Aceitável — próxima run corrige visualmente |
| R4 | Notificação de spot cooldown spamma canal se muitas saídas seguidas | Baixa | Baixo | UPSERT reusa row; edita mesma mensagem em vez de postar nova | Só falha se 2 saídas em spots **diferentes** em rápida sucessão; aceitável |
| R5 | Google Sheets rate limit com rajada de eventos | Média | Baixo | Debounce 5s + retries internos | Sem backoff exponencial; sem circuit-breaker |
| R6 | Admin muda role Discord manualmente — DB desactualiza | Alta (by design) | Baixo | `role_invariants` job corrige diariamente; `/rg-sync-roles` on-demand | Delay até 24h para auto-correcção |

**Decisão:** R1 está fechado pelo alignment pass. R2 fica no backlog (médio, não crítico). R3–R6 são aceitáveis ao nível actual de operação.

## 5. Issue-ready backlog

Converter directamente em issues GitHub. Cada item tem acceptance criteria
testável. Os handle `tech-debt`, `ux`, `observability` são recomendados.

### 🟠 I-1 · Advisory lock em `checkAndPromote` para prevenir race
- **Severity:** high
- **Why:** Dois movimentos de material em rápida sucessão podem ambos passar o check e duplicar o evento `member.promoted` (audit spam, dupla notificação).
- **Files:** `src/members/autoPromotionEngine.js`
- **Acceptance:** (a) `checkAndPromote` usa `pg_advisory_xact_lock` per-discord_id; (b) teste com 2 invocações concorrentes simuladas só resulta em 1 evento `member.promoted`.
- **Type:** code + tests

### 🟡 I-2 · Alerting/observability layer em cima das métricas Prometheus existentes
- **Severity:** medium
- **Why:** Scrape existe mas nada consome. Drift de membros pode crescer dias sem ninguém notar.
- **Files:** externo (Grafana Cloud, UptimeRobot, etc.). Criar `docs/ALERTING.md` com setup.
- **Acceptance:** (a) documento a dizer como ligar; (b) pelo menos 1 alarme activo (ex: `drift_members_total > 5`) com destino configurado.
- **Type:** docs + infra externa

### 🟡 I-3 · Integration tests para fluxo de saída end-to-end
- **Severity:** medium
- **Why:** `test/saidaEndToEnd.test.js` é stub-based. Fluxos de saída são dos mais críticos (cadeia de custódia + scoring); um regression partia dados.
- **Files:** novo `test/integration/saidaFlow.test.js`.
- **Acceptance:** (a) cria saída com DB real + migrations 1–29; (b) adiciona 2 participantes; (c) fecha + finaliza; (d) valida `inventory_movements` + `saida_stats` + `spot_cooldowns` resultantes.
- **Type:** tests

### 🟡 I-4 · Staging environment + disaster recovery runbook
- **Severity:** medium
- **Why:** Hoje rollback = `git revert + push`. Sem backup de DB documentado nem procedimento de restore. Railway não é suficiente.
- **Files:** `docs/OPERATIONS.md` (nova secção), script de backup manual.
- **Acceptance:** (a) DB snapshot semanal automático (Railway built-in ou cron externo); (b) procedimento de restore testado uma vez; (c) documentado no OPERATIONS.
- **Type:** docs + infra

### 🟢 I-5 · Subir coverage em zonas excluídas conforme estabilizam
- **Severity:** low
- **Why:** `src/sheets/**` é 3k linhas sem testes. Se Sheets passar a obrigatório (hoje é opt-in), falta de tests torna-se risco.
- **Files:** `test/sheets/*` novos; actualizar `.c8rc.json` para incluir `src/sheets/queries.js` (puro) após cobrir.
- **Acceptance:** (a) `queries.js` com coverage ≥ 70%; (b) remove de `exclude` no .c8rc.json.
- **Type:** tests

### 🟢 I-6 · Extrair `preReadyPhases.js` se `bootstrap.js` crescer >120 linhas
- **Severity:** low
- **Why:** Documentado em TECH_DEBT. Trigger-based: não fazer agora se não disparou.
- **Files:** `src/app/bootstrap.js`, novo `src/app/preReadyPhases.js`.
- **Acceptance:** Se/quando bootstrap.js > 120 linhas, refactor com mesma forma de `readyPhases.js`.
- **Type:** code (condicional)

### 🟢 I-7 · UX — versões curtas das copy RP para staff panels (opt-in)
- **Severity:** low
- **Why:** Feedback de audit externa. Staff em uso diário pode cansar do tom aforístico. **Não fazer** sem trigger: medir primeiro (user feedback, survey a 2–3 staff).
- **Files:** `src/content/panels.js` variante `short`.
- **Acceptance:** Só avançar após feedback qualitativo documentado; caso contrário, fechar este item como "wontfix-by-design".
- **Type:** code (condicional ao sinal)

## 6. Two-week plan

Assumindo equipa pequena focada (1–2 devs), ~20h úteis de engenharia.

### Must-do (~8h)
1. **R2 mitigation (I-1)** — advisory lock em `checkAndPromote` + teste. ~4h. **Release gate:** sim.
2. **I-3 — Integration test saida end-to-end.** ~4h. **Release gate:** sim (confiança para próxima release).

### Should-do (~8h)
3. **I-2 — Alerting setup.** ~3h (setup Grafana Cloud + 2 alarmes básicos). **Release gate:** não, mas queimas tempo real em incidentes sem isto.
4. **I-4 — Backup + DR runbook.** ~4h (configurar Railway snapshot + `docs/OPERATIONS.md` secção Restore). **Release gate:** não, mas é negligência operacional sem.
5. **Manutenção docs** — verificar que TECH_DEBT, DEPRECATION e ARCHITECTURE continuam alinhados após cada merge. 1h distribuída.

### Optional (~4h)
6. **I-7 — UX feedback cycle.** Mandar mensagem a 2–3 staff, ouvir 48h, decidir. Sem feedback → fechar como "wontfix-by-design".
7. **Spike curto em I-5** — só para estimar esforço futuro; 1h para avaliar se 1 ficheiro de sheets é testável isoladamente.

### Explicitamente NÃO fazer estas 2 semanas
- Reescrever copy RP — decisão consciente, zero evidência de atrito real.
- Refactor do `bootstrap.js` — 100 linhas, não está a doer.
- Migrar para rate-limiter distribuído — `instanceCoordinator` elimina o caso de uso.
- Adicionar features novas (novos slashes, novos painéis) até I-1 + I-3 fecharem.

## 7. Go / no-go para próxima release

**GO** nas condições actuais:
- 293/293 testes verdes
- CI job integration passa migrations 1–29 em postgres real
- Config validator cobre as env vars relevantes (incluindo `SPOT_COOLDOWN_*` após alignment pass)
- `/health` verde em produção
- Railway deploy automático confirmado no último commit

**NO-GO triggers** (abortar release):
- Qualquer teste falha em CI
- Coverage desce abaixo dos thresholds em `.c8rc.json`
- Migration falha a correr em postgres (detectado pelo job `integration` do CI)
- `/health` devolve 503 por mais de 5 min após deploy

**Rollback** (ver `docs/OPERATIONS.md`):
1. `git revert HEAD && git push`
2. Monitorizar `/health` 5 min
3. Se migration nova partiu schema: **não reverter migration** — escrever migration N+1 que corrige forward.

---

## 8. Revisão periódica

Este documento tem que ser actualizado:

- Depois de cada entrada no `CHANGELOG.md` a `v2.X+1`
- Quando qualquer item do "Backlog" em cima for fechado (mover para TECH_DEBT "Fechadas")
- Quando um novo R? aparece em produção (adicionar à tabela de risks)

Se a data da última revisão tiver mais de 4 semanas e o repo não está em pausa
deliberada, este documento está **stale** — corrigir isso antes de usar como
referência.
