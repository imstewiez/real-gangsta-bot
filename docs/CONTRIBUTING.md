# Contribuir

Como contribuir para o Bot di Zona / Firma RedWood.

---

## Princípios

1. **Simplificar antes de adicionar.** Se o débito técnico (`docs/TECH_DEBT.md`)
   toca no que vais mexer, paga-o primeiro.
2. **DB é fonte de verdade.** Discord e Sheets são projecções. Nunca inverter.
3. **Painéis são a via principal.** Slash commands são atalhos. UI para o user,
   comandos para staff/debug.
4. **Zero IDs hardcoded em código.** Todos vêm de env ou `guild-defaults.json`.
5. **Testes ≠ opcional.** Se mexeste em lógica, tem teste. Se o teste é
   flaky, corrige ou remove — não ignores.

---

## Setup local

```bash
cp .env.example .env          # preenche secrets
npm install
npm run db:migrate            # aplica migrations
npm test                      # 222 tests deve passar
npm run test:coverage         # thresholds em .c8rc.json
```

## Workflow

1. Branch do `main`.
2. Commit atómico: um commit = uma ideia.
3. `npm test` + `npm run lint` + `npm run format:check` verdes antes de PR.
4. Coverage nunca desce (CI bloqueia).
5. Abre PR contra `main`; descreve **porquê**, não **o quê**.

## Critérios de merge

- ✅ CI verde (lint + format + test + coverage thresholds)
- ✅ Teste para cada bug fix / feature nova
- ✅ Zero TODOs em código sem issue associada
- ✅ CHANGELOG actualizado se for breaking / user-visible
- ✅ Migration SQL numerada se tocou schema

## Mudanças de schema

- Migration sempre em ficheiro novo em `migrations/` com id sequencial.
- **Nunca** editar migration já mergeada em `main`.
- Reversível quando possível; se não for, documentar.
- Testes de migration em `test/migrations.test.js`.

## Deprecações

Ver `docs/DEPRECATION.md`. Mínimo 1 release em estado `deprecated` antes
de remover.

## Governance

- Décisões arquiteturais → issue GitHub marked `ADR`.
- Novos jobs no scheduler → documentar em `docs/OPERATIONS.md`.
- Novas env vars → adicionar em `.env.example` + `src/config/` + `src/config/validate.js`.
- Breaking change em CHECK constraint → migration + PR de deprecação primeiro.

## Secrets

- `.env`, credenciais Google, tokens → **nunca** commitar.
- Se descobrires secret exposto: revoga imediatamente + notifica.
- Railway é a única source of truth para secrets de prod.

## Debugging

- Logs estruturados via `src/logger.js`. Nível via `LOG_LEVEL`.
- Healthcheck: `GET /health`. Se down, ver `docs/OPERATIONS.md`.
- DB health: job `data_health_collect` (5m). Métricas Prometheus em `/metrics`.
