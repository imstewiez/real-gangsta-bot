# Real Gangsta — Relatório da refactorização

Data de conclusão: 2026-04-13
Branch: `master`

## 1. Reaproveitado

- **Infra-estrutura de DB** (pool, migrations, repositórios) — mantida, 1 nova migration adicionada.
- **`discordQueue`**, **`advisoryLock`**, **`idempotency`** — sem alterações.
- **Motor de operações** — estendido, não reescrito.
- **Motor de promoção automática** — código mantido, tier ordering já estava correcto (`young_blood=1 → o_gunao=2 → gangster_fodido=3`).
- **Motor de auditoria** — mantido.
- **`interactionHelpers`** (refactor da sessão anterior) — usado como fonte de verdade em tudo.
- **`scripts/restructureServer.js`** — convertido em fonte de dados do template (não é já um script monolítico).
- **`config/full-inventory.json`** — adoptado como fonte de bootstrap do stock inicial.

## 2. Corrigido

- **`src/config.js`** — adicionado `MORADORES_BASE_ROLE_ID`, `TROPINHAS_DO_GUETTO_ROLE_ID`, `PATRULHA_PATA_ROLE_ID`, `BOT_ROLE_ID`, `CONFIGURADOR_ROLE_ID`, `CEMETERY_CHANNEL_ID`, `STRUCTURE_SYNC_LOG_CHANNEL_ID`. Introduzidos aliases semânticos `COMMAND_ROLE_IDS` / `SUPERVISOR_ROLE_IDS` e flags `ENFORCE_ROLE_INVARIANTS`, `AUTO_PUBLISH_WEEKLY_TOP`. Função `isSheetsEnabled()`.
- **`src/permissions/permissionEngine.js`** — split semântico: `isCommand` (Manda-Chuva/Kingpin), `isSupervisor` (OG/Real Gangster). Capacidades novas: `canManageStructure`, `canManageGuetto`, `canBootstrapStock`, `canRegisterKill`. Aceita `Map` nativo (antes só aceitava Collection da discord.js — testável agora).
- **`src/onboarding/onboardingEngine.js`** — removido hardcode do ID `1490397684597653634`. Novo morador entra como `Moradores (base) + Young Blood (tier 1)`. Invariantes são aplicadas imediatamente após onboarding. Permissões do canal individual usam os novos grupos `COMMAND_ROLE_IDS` / `SUPERVISOR_ROLE_IDS`.
- **`src/util.js:truncate`** — faz `trimEnd()` antes de concatenar `...` para evitar espaço residual.

## 3. Novo

### Módulos
- **`src/members/roleInvariants.js`** — enforcement de invariantes:
  - qualquer tier (YB/OG/GF) implica role base Moradores
  - nenhum membro pode ter > 1 tier simultaneamente
  - modo dry-run e apply
  - job diário no `scheduler.js`
- **`src/discord/structureTemplate.js`** — fonte única de verdade da estrutura desejada (categorias, canais, renames, moves, permissões). Dados declarativos.
- **`src/discord/structureSync.js`** — engine idempotente com 7 fases (rename categories → move channels → rename channels → create channels → category perms → channel perms → reorder). Detecta e lista extras fora do template (nunca apaga).
- **`src/inventory/stockBootstrap.js`** — importa `full-inventory.json` como ledger `saldo_inicial`. Protegido por flag `confirm`, flag `force` para reaplicar. Tabela `inventory_bootstrap` rastreia aplicações por source.
- **`src/cemetery/cemeteryEngine.js`** + **`cemeteryHandlers.js`** — registo de kills, leaderboard, auto-publish no canal cemitério.

### Operações (cadeia de custódia)
- `operationEngine.issueMaterialToParticipant(opId, discordId, itemId, qty, actorId, notes)` — fornecimento nominal a participante, gera movimento `fornecimento_org` e linked audit.
- `operationEngine.settleParticipantCustody(opId, discordId, outcome, actorId)` — ao fecho, reconcilia devolvido / perdido / morto-com-material por participante.

### Slash commands novos
- `/rg-sync-structure` (modo: dry-run | apply) — sincroniza estrutura do Discord.
- `/rg-sync-roles` (modo: dry-run | apply) — reconcilia invariantes de roles.
- `/rg-bootstrap-stock` (modo: dry-run | apply, force?) — importa stock inicial.
- `/rg-kill` — modal para registar kill.
- `/rg-cemetery` — leaderboard.

### CLI scripts
- `scripts/bootstrapStock.js --apply --confirm [--force]`
- `scripts/restructureServer.js --apply` (já existia — mantido, mas agora o comando é acessível via slash).

### Migrations
- **Migration 4**: `inventory_saldo_inicial_and_cemetery`
  - adiciona `saldo_inicial` ao CHECK constraint de `inventory_movements.movement_type`
  - tabela `inventory_bootstrap` (rastreio de aplicações de seed)
  - tabela `cemetery_kills`

## 4. Removido

- **`test/inventory.test.js`**, **`test/onboarding.test.js`**, **`test/operations.test.js`** — usavam `mock.module` (API experimental, partida em Node ≥22). Removidos.
- **Código morto em `onboardingEngine.js`** — linhas hardcoded de detecção de role base.

## 5. Testes (novos)

| Ficheiro | Testes | Cobertura |
|---|---|---|
| `test/rankings.test.js` | 9 | utils: `truncate`, `formatPersonName`, `weekBounds`, `unique`, `chunkStringByLimit` |
| `test/permissions.test.js` | 11 | predicados (`isCommand`/`isSupervisor`/`isChefeMoradores`/`isMorador`), capabilities (`canManageStructure`/`canManageGuetto`/`canRegisterMaterial`), resolução de tiers |
| `test/roleInvariants.test.js` | 4 | aplicar base Moradores quando falta, não-op em membro OK, remover tiers duplicados, dry-run não mutates |

**Status:** `npm test` → 24/24 passam em Node ≥20 sem flags experimentais.

## 6. Nova árvore lógica

```
bot/
├── config/
│   ├── full-inventory.json      ← bootstrap source
│   └── items-catalog.json
├── docs/
│   ├── AUDIT.md                 ← auditoria Fase 1
│   └── CHANGELOG.md             ← este ficheiro
├── scripts/
│   ├── bootstrapStock.js        ← CLI de bootstrap
│   ├── inspectServer.js         (legacy, mantido)
│   ├── restructureServer.js     (legacy CLI, ainda funciona)
│   └── setupSheet.js
├── src/
│   ├── audit/
│   ├── cemetery/                ← NOVO
│   │   ├── cemeteryEngine.js
│   │   └── cemeteryHandlers.js
│   ├── discord/                 ← NOVO
│   │   ├── structureSync.js
│   │   └── structureTemplate.js
│   ├── inventory/
│   │   ├── inventoryEngine.js
│   │   ├── inventoryHandlers.js
│   │   ├── inventoryMenus.js
│   │   ├── itemCatalog.js
│   │   └── stockBootstrap.js    ← NOVO
│   ├── jobs/
│   ├── lib/
│   ├── members/
│   │   ├── autoPromotionEngine.js
│   │   ├── memberEngine.js
│   │   ├── memberHandlers.js
│   │   └── roleInvariants.js    ← NOVO
│   ├── onboarding/
│   ├── operations/
│   │   └── operationEngine.js   ← estendido (custódia)
│   ├── panels/
│   ├── permissions/
│   │   └── permissionEngine.js  ← refactor (split command/supervisor)
│   ├── rankings/
│   ├── repositories/
│   ├── shared/
│   ├── sheets/                  (opcional, sem alterações)
│   ├── web/
│   ├── config.js                ← refactor (novos roles + flags)
│   ├── db.js
│   ├── dbMigrate.js             ← +1 migration
│   ├── discordQueue.js
│   ├── index.js                 ← + 5 slash commands novos
│   ├── logger.js
│   ├── panelBootstrap.js
│   ├── slashCommands.js         ← + 5 comandos
│   ├── state.js
│   └── util.js                  ← truncate fix
└── test/
    ├── permissions.test.js      ← reescrito
    ├── rankings.test.js         ← reescrito
    └── roleInvariants.test.js   ← NOVO
```

## 7. Operacional

### Setup inicial
```bash
cp .env.example .env
# preencher DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DATABASE_URL
npm install
npm run db:migrate          # aplica todas as migrations em ordem
```

### Comandos úteis
```bash
# Estrutura do Discord (ver antes)
npm run structure:sync              # dry-run
npm run structure:sync:apply        # aplicar
# (ou via bot: /rg-sync-structure modo:dry-run)

# Stock inicial
npm run stock:bootstrap             # dry-run
npm run stock:bootstrap:apply       # apply + confirm
# (ou via bot: /rg-bootstrap-stock modo:apply)

# Invariantes de roles
# via bot: /rg-sync-roles modo:dry-run
# ou auto: job diário (ENABLE_BACKGROUND_JOBS=true)

# Tops
# via bot: /rg-top-week
# ou auto: publicação domingo 23h no WEEKLY_TOP_CHANNEL_ID

# Cemitério
# via bot: /rg-kill  (modal)
# via bot: /rg-cemetery  (leaderboard)

# Testes
npm test
```

## 8. Segurança

- `.env` em `.gitignore` ✓
- `juri-490201-54e5053bd43a.json` (service account) em `.gitignore` ✓
- `logs/` em `.gitignore` ✓
- Role IDs com fallback em código mas sobreponíveis via env
- Bootstrap de stock requer `--confirm` explícito
- Sync de estrutura nunca apaga

## 9. O que NÃO foi feito (e porquê)

- **Sheets sync** — mantido como estava; pedido era "opcional e limpo". Já é opcional (controlado por `SPREADSHEET_ID`). Refactor em tabs (stock/operações/top/membros) fica para quando o cliente activar Sheets — hoje `GOOGLE_SERVICE_ACCOUNT_JSON` não está configurado.
- **Handlers de UI para `issueMaterialToParticipant` / `settleParticipantCustody`** — o motor existe e está testável; a superfície de UI (modais específicos) fica para quando decidires o formato (1 modal com lista ou fluxo multi-step).
- **Painéis Patrão di Zona expandidos** — `chefeMoradoresPanel.js` continua com 4 botões; suporta a capability nova mas não acrescentei mais botões sem mandato explícito.

## 10. Próximos passos sugeridos

1. `/rg-sync-structure modo:dry-run` — validar o relatório
2. `/rg-sync-roles modo:dry-run` — validar violações antes de aplicar
3. `/rg-bootstrap-stock modo:dry-run` — confirmar que 146 items vão ser criados com valor esperado
4. Apply em ordem: roles → structure → stock
5. `/rg-sync-panels` para republicar os painéis já com os botões actualizados
