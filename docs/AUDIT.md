# Bot di Zona — Auditoria do projecto (Fase 1)

Data: 2026-04-13
Branch base: `master`

## 1. Reaproveitável (ficar)

- **Migrations** (`src/dbMigrate.js`) — 3 migrations, transacionais, idempotentes. Schema está 90% coerente com o domínio pretendido. Mantém-se.
- **Repositórios** (`src/repositories/*`) — camada limpa. Reutilizável.
- **`permissionEngine`** — estrutura por grupos (`isChefia`, `isOficial`, etc). Reaproveitar, mas refactorizar (ver §3).
- **`interactionHelpers`** (já refactorizado na sessão anterior) — fonte única de verdade para replies/updates/modals/locks.
- **Motor de operações** (`operations/operationEngine.js`) — cobre criar, fechar, participantes, material. Falta cadeia de custódia por participante (Fase 6).
- **Motor de promoção** (`members/autoPromotionEngine.js`) — lógica correcta; apenas precisa do mapeamento de tier reafirmado.
- **Auditoria** (`audit/auditEngine.js`) — simples mas funcional.
- **Discord queue** (`discordQueue.js`) — já respeita rate limit.
- **`scripts/restructureServer.js`** — tem o mapeamento completo de IDs reais do servidor e o template de categorias/canais. **Não mantido como script solto** — vou promovê-lo a módulo `src/discord/structureSync.js` (Fase 3).
- **`config/full-inventory.json`** — stock inicial real do grupo. Usar como bootstrap (Fase 5).
- **`config/items-catalog.json`** — catálogo seed. Mantém-se.

## 2. Incoerências encontradas

### 2.1 Roles / tiers

- **Role base "Moradores" (ID `1490397684597653634`) não está em `CONFIG`** — `onboardingEngine.js:60` tem o ID **hardcoded** via `process.env.MORADORES_BASE_ROLE_ID || '1490397684597653634'`. Em `src/config.js` a chave não existe. **Correcção obrigatória**.
- **`CONFIG.MORADOR_ROLE_IDS` agrupa só os 3 tiers** (YB, OG, GF) — não inclui a role base. Pode causar falso-positivo em `isMorador()` se alguém tiver só a role base sem tier (edge case, mas existe).
- **Tiers confirmados**: `young_blood=1 → o_gunao=2 → gangster_fodido=3`. Já está certo no código (`autoPromotionEngine.js`, `PROMOTIONS[]`).
- **Onboarding entra como "Young Blood"** — correcto. O pedido inicial dizia "O Gunão" mas foi corrigido para coerência com tier 1.
- **Roles ignoradas do ecossistema**: `TROPINHAS_DO_GUETTO_ROLE_ID` (`1490397688800477215`), `PATRULHA_PATA_ROLE_ID` (`1490795383448928276`) — pedido marca-as como flavor, aceitar e não usar como core.
- **`PATRAO_DI_ZONA`** é o chefe-dos-moradores (controla GUETTO). `permissionEngine.isChefeMoradores()` já o separa, mas falta método específico `canManageGuetto()`.
- **Separar "Comando total" (Manda-Chuva/Kingpin) de "Supervisão" (OG/Real Gangster)** — hoje ambos estão em `isChefia()` ou `isOficial()`. Precisa de split semântico.

### 2.2 Invariante não aplicada

- Hoje nada impede alguém ter `Young Blood` sem `Moradores` base. A invariante (qualquer um de YB/OG/GF implica Moradores) não está em lado nenhum do código.
- Vai para novo módulo `members/roleInvariants.js` (Fase 2) com hooks em:
  - `onboardingEngine.processApproval`
  - `autoPromotionEngine.checkAndPromote`
  - novo job de reconciliação em `jobs/scheduler.js`

### 2.3 Permissões dos canais

- Actualmente geridas em `onboardingEngine.js:102-128` com literal `PermissionFlagsBits` embutidos. Funciona, mas duplica a lógica que também existe em `restructureServer.js`. **Unificar** via `discord/channelPermissions.js` (Fase 3).

### 2.4 `saldo_inicial` ausente

- `inventory_movements.movement_type` NÃO inclui `saldo_inicial` (ver `dbMigrate.js:81-85`). Tipos actuais: `entrega_morador`, `venda_morador`, `entrega_oficial`, `fornecimento_org`, `consumo_operacao`, `devolucao_operacao`, `ajuste_manual`, `perda_operacao`, `apreendido`, `craftado`.
- **Migration 4** adiciona `saldo_inicial`. (Fase 5).

### 2.5 Cemitério sem suporte

- Canal `☠️│cemitério` existe, mas o bot não escreve nada nem há schema. Módulo novo (Fase 7).

### 2.6 Tops semanais não publicados automaticamente

- `rankings/rankingJobs.js` existe mas só **calcula** e grava em `weekly_rankings`. Falta publisher para o canal `🏆│tops-semanais`. (Fase 7).

### 2.7 Testes partidos

- `test/*.test.js` usam `mock.module` — API experimental não carregada por omissão em Node ≥22. `test/rankings.test.js` tem assert wrong em truncate (`'a very...'` vs `'a very ...'`).
- Reescrever todos sem `mock.module`, usando dependency injection nos módulos testados. (Fase 8).

## 3. Gaps funcionais

Áreas sem cobertura que vou adicionar nas fases seguintes:

- [Fase 2] `roleInvariants.js` — enforcement da invariante
- [Fase 2] `permissionEngine` split: `isCommand`, `isSupervisor`, `canManageGuetto`
- [Fase 3] `discord/structureSync.js` — template completo + dry-run/apply
- [Fase 3] `discord/channelPermissions.js` — permissões reusáveis
- [Fase 3] slash `/rg-sync-structure`
- [Fase 4] onboarding refactorado sem hardcode
- [Fase 4] arquivamento de canais individuais na promoção a oficial
- [Fase 5] migration `saldo_inicial`
- [Fase 5] `scripts/bootstrapStock.js`
- [Fase 5] slash `/rg-bootstrap-stock --confirm`
- [Fase 6] `operationEngine` cadeia de custódia por participante
- [Fase 7] `cemetery/cemeteryEngine.js` + modal + leaderboard
- [Fase 7] `rankings/rankingPublisher.js` — auto-publish semanal
- [Fase 8] testes novos sem `mock.module`
- [Fase 8] README operacional

## 4. Riscos / cuidados

- **Sync de estrutura**: nunca apaga, apenas cria/renomeia/move. Dry-run publica relatório no canal `🤖│logs-bot`.
- **Bootstrap de stock**: bloqueado por `--confirm`. Regista cada entrada como `saldo_inicial` em ledger — sem overwrite.
- **Invariante de roles**: correr em **warn mode** primeiro (listar incoerências), promover para **enforce** após verificação humana.
- **Arquivamento de canais**: faz parte do fluxo já — só limpa a detecção.

## 5. Secrets

- `.env` existe no workspace (tamanho 3346 bytes) — confirmado NÃO versionado (está em `.gitignore` do projecto pai, ver git status).
- `juri-490201-54e5053bd43a.json` (Google service account) presente na raiz do `bot/`. **Risco**: versionado se não estiver em `.gitignore`. Fase 8 valida.

## 6. Próxima acção

Fase 2 arranca imediatamente: `config.js` + `permissionEngine.js` + `roleInvariants.js`.
