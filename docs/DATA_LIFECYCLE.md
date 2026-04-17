# Data Lifecycle · Source of Truth · Retention

Documento normativo para o ciclo de vida dos dados no sistema Firma RedWood.
**Lê antes de alterar qualquer fluxo de persistência ou sync.**

---

## Princípio fundamental

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Discord        │     │  PostgreSQL      │     │  Google Sheets   │
│  Interface      │◄───►│  Source of Truth │────►│  Projecção       │
│  operacional    │     │  (autoridade)    │     │  analítica       │
└─────────────────┘     └──────────────────┘     └──────────────────┘
     input/output             persistência             read-only
```

**Regras invioláveis:**

1. **DB é a única fonte de verdade.** Tudo o resto é projecção.
2. **Discord nunca guarda estado persistente.** Roles, channels, messages são espelho de DB.
3. **Sheet é write-only pelo bot.** Edits manuais em Sheet perdem-se no próximo sync.
4. **Reconstructível**: podemos apagar Discord + Sheet; da DB reconstruímos tudo.
5. **Toda a mutation passa pela DB primeiro**, depois projecta para Discord/Sheet.

---

## Lifecycle por domínio

### 1. Members (`members`)

| Aspecto | Valor |
|---|---|
| **Estados** | `ativo`, `inativo`, `arquivado` (CHECK constraint) |
| **Input** | Onboarding, slash commands, backfill Discord |
| **Projecção** | Discord roles, Sheet "Membros" |
| **Soft-delete** | `deleted_at` + `deleted_by` (added in migration 16) |
| **History** | `member_role_history`, `audit_logs` |
| **Drift tracking** | `last_discord_reconciled_at` |
| **Retention** | Sem purge — role promotion history tem valor permanente |
| **Reconcile** | `/rg-reconcile dominio:members` — compara tier+role vs Discord |

### 2. Resident Channels (`resident_channels`)

| Aspecto | Valor |
|---|---|
| **Estados** | `active`, `archived`, `deleted` |
| **Input** | Onboarding cria; offboarding arquiva/apaga |
| **Projecção** | Discord channel real |
| **Soft-delete** | `deleted_at` nativo + `status='deleted'` |
| **Retention** | Sem purge — referências históricas |
| **Reconcile** | `/rg-reconcile dominio:channels` — detecta Discord channels apagados externamente |

### 3. Operations / Saídas (`operations`, `operation_participants`, `operation_materials`)

| Aspecto | Valor |
|---|---|
| **Estados** | `aberta`→`em_preparacao`→`em_curso`→`concluida` / `cancelada` |
| **Input** | `/saida-criar` + slash commands workflow |
| **Projecção** | Discord embeds, Sheet "Saídas & Combate" |
| **Soft-delete** | `deleted_at` + `deleted_by` (migration 16). `cancelada` é proxy operacional |
| **Retention** | **NUNCA purgado** — valor contabilístico + analytics histórica |
| **Immutabilidade** | Após `concluida`, alterações exigem audit log explícito |

### 4. Kill Logs (`kill_logs`)

| Aspecto | Valor |
|---|---|
| **Estados** | Append-only (sem column status) |
| **Input** | `/kill-log`, saida wizard settlement |
| **Projecção** | Sheet "Saídas & Combate" Kill Log section |
| **Soft-delete** | — (considerar adicionar se necessário no futuro) |
| **Retention** | Sem purge planeado — dados históricos |

### 5. Inventory (`items`, `inventory_movements`)

| Aspecto | Valor |
|---|---|
| **Items** | `active` boolean = soft-delete lógico |
| **Movements** | Append-only, `movement_type` define semântica |
| **Categories** | CHECK constraint em items.category (15 valores válidos, migration 17) |
| **Locations** | `location IN ('armazem', 'grupo', NULL)` — casa 1 vs casa 2 |
| **Input** | `/rg-stock-*` commands, saida consumption, bootstrap script |
| **Projecção** | Sheet "Stock" tab |
| **Retention** | **NUNCA purgado** — ledger contabilístico |

### 6. Rankings (`weekly_rankings`, `monthly_rankings`, `all_time_stats`, `member_saida_stats`, `spot_stats`)

| Aspecto | Valor |
|---|---|
| **Natureza** | Snapshots imutáveis (weekly/monthly) ou agregados recalculáveis (all_time) |
| **Input** | `rankingEngine` + jobs scheduler |
| **Projecção** | Sheet "Resumo & Rankings" |
| **Retention** | Weekly/monthly mantidos para sempre — snapshots históricos |

### 7. Availability (`availability_sessions`, `availability_slots`, `availability_votes`)

| Aspecto | Valor |
|---|---|
| **Estados** | `open`, `closed` (CHECK) |
| **Soft-delete** | `deleted_at` + `archived_at` (migration 16) |
| **Retention** | **Closed > 180 dias → soft_delete** via job `retention` diário |

### 8. Sticky Messages (`sticky_messages`)

| Aspecto | Valor |
|---|---|
| **Estados** | `active=true/false` |
| **Soft-delete** | `active=false` + updated_at tracking |
| **Retention** | **Inactive + updated_at > 30d → hard DELETE** |

### 9. Radio State (`radio_state`, `radio_history`)

| Aspecto | Valor |
|---|---|
| **History** | `radio_history` immutable audit log |
| **Retention** | **History > 365d → hard DELETE** |

### 10. Audit Logs (`audit_logs`)

| Aspecto | Valor |
|---|---|
| **Natureza** | Append-only (before/after state em JSONB) |
| **Retention** | **> 365 dias → hard DELETE** (summary em `archival_log`) |

### 11. Job Runs (`job_runs`)

| Aspecto | Valor |
|---|---|
| **Estados** | `running`, `completed`, `failed` |
| **Stuck detection** | `running` + `started_at < NOW() - 2h` → alerta |
| **Retention** | **finished_at > 90 dias → hard DELETE** |

### 12. Sheet Sync State (`sheet_sync_state`)

| Aspecto | Valor |
|---|---|
| **Natureza** | 1 row per canonical tab (6 rows), UPSERT a cada sync |
| **Campos** | `last_synced_at`, `last_result` (ok/error/skipped), `last_ops`, `last_ms`, `last_error` |
| **Drift trigger** | `last_synced_at > 2× SHEETS_SYNC_INTERVAL_MIN` → stale |
| **Retention** | Sem purge (6 rows sempre) |

---

## Metadata standard

Colunas aplicadas a **tabelas mutáveis** (members, operations, items, resident_channels, availability_sessions, sticky_messages):

| Coluna | Tipo | Semântica |
|---|---|---|
| `deleted_at` | TIMESTAMPTZ NULL | NULL = activo; timestamp = soft-deleted |
| `deleted_by` | TEXT NULL | `discord:<id>` ou `system:<source>` |
| `record_version` | INTEGER DEFAULT 1 | Optimistic locking; bump em cada mutation |

**NÃO aplicado a** logs append-only (audit_logs, job_runs, inventory_movements, radio_history) — imutáveis por design.

---

## Audit trail

### `archival_log` (migration 18)

Registo imutável de acções de retenção/archive/purge. Responde a "quando e porque é que este registo desapareceu?".

| Coluna | Valores |
|---|---|
| `domain` | nome da tabela afectada |
| `action` | `archive`, `soft_delete`, `hard_delete`, `purge` |
| `row_count` | quantas rows afectadas |
| `actor` | `system:retention`, `system:scheduler`, `discord:<id>` |
| `payload` | JSONB com contexto (policy_key, bounds, etc) |

### `audit_logs`

Registo mutations de domínio. Cobertura actual:
- Members (role changes, deactivation)
- Saidas (create/update/close)
- Inventory (movements, adjustments)
- Kills (recordKill)
- Radio (state changes)
- Backfill + reconcile (bulk operations)

**Gaps conhecidos** (aceitáveis):
- Sticky refreshes não logam (volume alto, baixo valor).
- Rankings recompute não loga (determinístico, reproduzível).
- Availability votes não logam individualmente (agregado nos slots).

---

## Retention policy (resumo executivo)

| Domínio | Política | Acção |
|---|---|---|
| audit_logs | > 365 dias | DELETE, summary em archival_log |
| job_runs | > 90 dias | DELETE |
| radio_history | > 365 dias | DELETE |
| availability_sessions | closed > 180 dias | soft_delete |
| sticky_messages | inactive > 30 dias | DELETE |
| **TUDO o resto** | permanente | — |

**Execução**: job `retention` diário + `/rg-retention-run modo:dry-run|apply`.

---

## Reconcile strategy

| Domínio | Quando corre | Mecanismo |
|---|---|---|
| Members | diário (job + manual) | Compara tier/role Discord vs DB; backfill corrige |
| Channels | diário + on-demand | `guild.channels.fetch()` por cada resident_channel |
| Sheet | on-demand (5min collect) | `sheet_sync_state` vs thresholds |
| Roles invariants | diário | YB/OG/GF ⇒ BAIRRISTAS_BASE |

**Fluxo**:
1. `check()` dry-run → drift report (contadores + amostras)
2. `apply(drift)` corrige (optional)
3. Registo em `archival_log` com action='archive' + payload

---

## Observabilidade

### Métricas Prometheus (em `/metrics` endpoint)

```
rg_sheet_stale_tabs         gauge  # tabs com sync > 2× intervalo
rg_sheet_error_tabs         gauge  # tabs com last_result=error
rg_drifted_members          gauge  # members com role/tier divergente
rg_orphan_channels          gauge  # resident_channels sem Discord channel
rg_stale_job_runs           gauge  # jobs em running > 2h
rg_pending_retention_rows   gauge  # rows elegíveis para purge
```

Actualizados a cada 5min pelo job `data_health_collect`.

### Slash commands admin

| Comando | O que faz |
|---|---|
| `/rg-data-health` | Snapshot ephemeral: sheet sync, drift, retention, top tabelas, últimas acções archival |
| `/rg-reconcile dominio:* modo:dry-run\|apply` | Drift detection + correção opcional |
| `/rg-retention-run modo:dry-run\|apply` | Executa políticas de retenção |
| `/rg-sync-sheets` / `/rg-sync-sheets-rebuild` | Re-sync manual |
| `/rg-backfill-members modo:dry-run\|apply` | Import Discord → DB |

---

## Contract: mutation path

Para qualquer nova feature de mutation, seguir este contrato:

```
1. receive command (Discord slash / button / modal)
2. validate input
3. BEGIN TRANSACTION
4.   insert/update DB
5.   bump record_version (se aplicável)
6.   log to audit_logs
7. COMMIT
8. project to Discord (sticky, embed, message)
9. mark dirty → sheet re-sync scheduled (automático via 15min sync)
```

**Invariantes**:
- Se passo 3-7 falha, roll-back. Nada parcial.
- Se passo 8 falha, DB já está consistente; reconcile corrige Discord depois.
- Projecção para Sheet é **best-effort** — DB sempre fica correcto.

---

## Schema migrations

Lista actualizada em `src/dbMigrate.js`. Últimas:

| ID | Nome | Descrição |
|---|---|---|
| 15 | inventory_location_per_house | `location` em inventory_movements |
| 16 | lifecycle_metadata_foundation | deleted_at/deleted_by/record_version + sheet_sync_state |
| 17 | lifecycle_check_constraints | tier + category CHECK constraints |
| 18 | archival_log_and_retention | Tabela archival_log para audit de purges |

---

## Checklist para novas tabelas

Antes de criar tabela nova, verifica:

- [ ] `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` presente?
- [ ] `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (se tabela é mutable)?
- [ ] Se mutable: `deleted_at`, `deleted_by`, `record_version` da foundation?
- [ ] Se append-only: política de retenção definida?
- [ ] Colunas `status`/`state` têm CHECK constraint?
- [ ] Índices em FKs + colunas WHERE comuns?
- [ ] Soft-delete filter (`WHERE deleted_at IS NULL`) nas queries novas?
- [ ] Audit log chamado em mutations relevantes?
- [ ] Retention policy adicionada a `retentionJob.POLICIES`?

---

_Firma RedWood · última actualização: 2026-04-15_
