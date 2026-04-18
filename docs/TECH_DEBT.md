# Backlog de Dívida Técnica

Lista visível do trabalho estrutural pendente. Não é lista de features —
é lista de coisas que **tornam o sistema difícil de evoluir** e que devem
ser pagas antes de empilhar mais funcionalidades.

Regra de ouro: **simplificar antes de adicionar**. Quando um item aqui
tiver bloqueado uma feature, essa feature espera.

Última revisão: **2026-04-18** (baseline coverage 68.94% linhas / 56.52%
funcs; 287 testes unit + integration tests com postgres real na CI).

---

## Severidade

- 🔴 **crítico** — bloqueia evolução ou risco de corrupção de dados
- 🟠 **alto** — atrita trabalho diário; acumula custos
- 🟡 **médio** — atrito notável mas contornável
- 🟢 **baixo** — nice-to-have; só se sobrar janela

---

## Backlog (aberto)

### 🟡 Audit de idempotência cross-handler (I-1 fechado; restantes abertos)
Risco de race condition entre `onboardingEngine` (YB assign) + job
`role_invariants` (reconcile) + `promotionEngine` (tier change).
**Promoção já protegida** por advisory lock (issue #2, commit `419a075`).
Falta review similar em: onboarding↔invariants simultaneous, settlement
wizard concorrente.

### 🟡 Cobertura incremental nas zonas menos testadas
Baseline actual: **68.94% lines / 80.23% branches / 56.52% funcs / 68.94%
statements**. Zonas com gap conhecido:
- `src/sheets/*` — excluído do coverage (opcional). Quando estabilizar:
  escrever testes dos projectors.
- `src/notifications/*`, `src/reconcile/*` — excluídos porque dependem
  fortemente de Discord/DB reais; mover para integration tests.
- `src/content/*` — excluído porque é só strings; zero lógica a testar.
- Handlers de saída (`saidaHandlers.js`, `saidaWizard`) — parcialmente
  testados via `test/saidaEndToEnd.test.js` (stub-based). Expandir para
  integration tests com postgres.

### 🟡 UX/copy — balança tom RP vs clareza operacional
`src/content/panels.js` usa tom aforístico/RP muito forte (intencional,
alinha com identidade da Firma). Observação externa: pode cansar staff
em uso diário. Decisão actual: **manter tom RP** — é parte do produto.
Se futura review indicar atrito real, considerar versões curtas para
staff panels (chefia, patrão di zona) mantendo tom cheio para user-facing
(entrada, bairrista).

### 🟡 Bootstrap — isolar mais responsabilidades
`bootstrap.js` agora delega a `readyPhases.js` (9 fases nomeadas). As
secções pre-ready (migrations, event bus subscribers, coordinator) ainda
estão inline (~60 linhas). Pode ser extraído para `preReadyPhases.js` se
crescer acima de ~100 linhas.

### 🟡 Sheets — falta comando manual de force-resync
Quando utilizador reporta "info desapareceu na sheet", só é possível
forçar resync via evento de domínio (ex: fazer uma entrega fictícia).
Devia existir `/rg-sync-sheets` staff-only que chame `syncEngine.syncAll()`
— desbloqueia diagnóstico quando há suspeita de stale. Observado em
2026-04-18 durante investigação de embed de saída.

### 🟢 Sheets — ficheiros sem testes unitários
`src/sheets/*` (~3k linhas) excluído do coverage porque Sheets é
controlado por flag (opcional). Quando passar a ser obrigatório para
operação normal, escrever testes dos projectors (dashboard, membros,
saidas, stock, resumo).

### 🟢 Monorepo-vs-flat
`src/content/*` tem ~15 ficheiros só com strings. Pode ficar no seu
próprio package quando houver mais de um bot a usar.

### 🟢 Carga cognitiva do domínio
12 módulos top-level (onboarding, inventory, rankings, saídas, kills,
sticky, rádio, availability, sheets, notifications, reconcile,
scheduler). Não é um problema técnico mas é um risco de manutenção
futura — novos colaboradores precisam de tempo para ramp-up. Mitigação
actual: `docs/ARCHITECTURE.md` + `docs/JOBS.md` + `docs/CONTRIBUTING.md`.

---

## Fechadas (histórico curto, para referência)

| Item | Fechada em | Commit / PR |
|---|---|---|
| I-4: DR runbook + backup script + 4 cenários incident | 2026-04-18 | `27b4edb` (#4) |
| I-3: Integration test saída end-to-end com DB real | 2026-04-18 | `ac3d706` (#3) |
| I-1: Advisory lock em `checkAndPromote` (race de promoção) | 2026-04-18 | `419a075` (#2) |
| Release-lead alignment pass: config validator + integration tests 028/029 + OPERATIONS/ARCHITECTURE sync | 2026-04-18 | `856ca4d` |
| Whitelist de armas no dropdown de saída (10 armas ordenadas, sem brancas) | 2026-04-18 | `a467072` |
| Spot cooldown 30min + notificação pública | 2026-04-18 | `378f43b` |
| Fix "multiple assignments to same column updated_at" + 3 bugs de CI | 2026-04-18 | `8639948`, `3f8a9da` |
| Full update onboarding (DM, denial modal, retry, /meu-pedido, +17 tests) | 2026-04-17 | `bef88c1`..`fb269a3` |
| Tests para memberEngine + onboarding engine | 2026-04-17 | `c66bd26` |
| Integration tests reais com postgres no CI (3 files × 16 casos) | 2026-04-17 | `c66bd26` |
| Eliminar legacy morador ponta a ponta (código + migration 027) | 2026-04-17 | `803b3f9` |
| CI coverage obrigatório (thresholds via .c8rc.json) | 2026-04-17 | `044174b` |
| Split readyHook em 9 fases nomeadas | 2026-04-17 | `044174b` |
| Docs governance (DEPRECATION, TECH_DEBT, CONTRIBUTING) | 2026-04-17 | `044174b` |
| Split de `config.js` em 13 domain files + validator | 2026-04-17 | `41021ff` |
| Migração de domínio morador→bairrista | 2026-04-15 | migration 020 |
| Remoção de jobs duplicados (perms_apply) | pré-v2 | — |

---

## Como usar

- **Adicionar item**: PR que edita este ficheiro + secção "Backlog" com
  severidade, breve descrição, owner se houver.
- **Fechar item**: mover para "Fechadas" com data e commit de referência.
- **Ao abrir feature nova**: scan deste backlog. Se toca em código com
  item 🔴 ou 🟠 aberto, endereça o débito primeiro.
- **Revisão periódica**: fazer pass por este ficheiro a cada major release
  (ver CHANGELOG). Actualizar baseline de coverage, fechar itens
  entregues, adicionar novos descobertos.
