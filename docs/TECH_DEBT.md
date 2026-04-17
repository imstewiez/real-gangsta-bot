# Backlog de Dívida Técnica

Lista visível do trabalho estrutural pendente. Não é lista de features —
é lista de coisas que **tornam o sistema difícil de evoluir** e que devem
ser pagas antes de empilhar mais funcionalidades.

Regra de ouro: **simplificar antes de adicionar**. Quando um item aqui
tiver bloqueado uma feature, essa feature espera.

---

## Severidade

- 🔴 **crítico** — bloqueia evolução ou risco de corrupção de dados
- 🟠 **alto** — atrita trabalho diário; acumula custos
- 🟡 **médio** — atrito notável mas contornável
- 🟢 **baixo** — nice-to-have; só se sobrar janela

---

## Backlog

### 🟠 Integration tests reais com postgres no CI
**Owner:** — **Estado:** em progresso (task #8).
Actuais são stub-based. Migrar para serviço postgres no GitHub Actions,
test DB com migrations aplicadas, tests end-to-end dos 4 fluxos core
(onboarding, saída, inventário, promoção).

### 🟡 Audit de idempotência cross-handler
Risco de race condition entre `onboardingEngine` (YB assign) + job
`role_invariants` (reconcile) + `promotionEngine` (tier change) a correr
simultaneamente. Documentação inicial em `docs/IDEMPOTENCY.md`; falta
análise handler-a-handler + testes de stress.

### 🟡 Cobertura de testes
Baseline actual: 66% linhas, 54% funcs. Gaps: `onboardingEngine`,
`memberEngine`, vários handlers, jobs. Task #7 cobre onboarding +
memberEngine; resto incremental.

### 🟡 Bootstrap — isolar mais responsabilidades
`bootstrap.js` agora delega a `readyPhases.js` (9 fases nomeadas). As
secções pre-ready (migrations, event bus subscribers, coordinator) ainda
estão inline. Pode ser extraído para `preReadyPhases.js` se crescer.

### 🟢 Sheets — ficheiros sem testes unitários
`src/sheets/*` (~3k linhas) excluído do coverage porque Sheets é opcional.
Quando estabilizar, escrever testes dos projectors.

### 🟢 Monorepo-vs-flat
`src/content/*` tem ~15 ficheiros só com strings. Pode ficar no seu
próprio package quando houver mais de um bot a usar.

---

## Fechadas (histórico curto, para referência)

| Item | Fechada em | Commit / PR |
|---|---|---|
| Split de `config.js` em domain files + validator | 2026-04-17 | `41021ff` |
| Migração de domínio morador→bairrista | 2026-04-15 | migration 020 |
| Remoção de jobs duplicados (perms_apply) | pré-v2 | — |

---

## Como usar

- **Adicionar item**: PR que edita este ficheiro + secção "Backlog" com
  severidade, breve descrição, owner se houver.
- **Fechar item**: mover para "Fechadas" com data e commit de referência.
- **Ao abrir feature nova**: scan deste backlog. Se toca em código com
  item 🔴 ou 🟠 aberto, endereça o débito primeiro.
