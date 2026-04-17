# Reconciliação — Consistência entre DB, Discord e Sheets

Plano formal para garantir que as três projecções do estado do bairro
(DB = fonte de verdade, Discord = UI, Sheets = reporting) se mantêm
alinhadas.

---

## Modelo mental

```
          ┌─────────┐
          │   DB    │ ← fonte de verdade
          └────┬────┘
               │ events
        ┌──────┼──────┐
        ▼      ▼      ▼
   ┌────────┐ ┌─────────┐
   │Discord │ │ Sheets  │
   │ (live) │ │(report) │
   └────────┘ └─────────┘
```

- **DB** (PostgreSQL): única fonte de verdade. Todos os escritos vão
  primeiro à DB.
- **Discord**: projecção live (roles, canais, painéis, mensagens). Alguns
  reads vêm directamente do Discord API (ex: `getMember().roles`).
- **Sheets**: projecção relatorial, event-driven com debounce 5s. Só
  reads via `sheets API`, nunca mutação.

---

## Fontes de drift

1. **Admin manual no Discord**: alguém adiciona/remove role directamente.
   DB desactualiza.
2. **Falha no event bus subscriber**: emit acontece, mas subscriber
   falha silenciosamente. Sheet desactualiza.
3. **Retry/shutdown mid-write**: bot crash durante multi-step update.
4. **Rate limit Discord**: notificação perde-se; core escreveu OK.
5. **Schema mudou** sem reprojetar: migration adiciona campo, Sheet não
   sabe do novo.

---

## Componentes de reconciliação

### 1. `src/reconcile/` — engine dedicado

- `src/reconcile/index.js` — orquestra drivers
- `src/reconcile/drivers/members.js` — DB ↔ Discord roles
- `src/reconcile/drivers/channels.js` — DB `resident_channels` ↔ Discord
- `src/reconcile/drivers/sheet.js` — Sheets estado vs DB

### 2. Job `reconcile_daily` (scheduler)

- Corre 1×/dia em **dry-run**
- Produz Prometheus gauges: `drift_members_total`, `drift_channels_total`,
  `sheet_stale_tabs`
- NÃO aplica correcções automaticamente (por design — intervenção humana)

### 3. Job `role_invariants` (scheduler)

- Corre 1×/dia em **apply mode** (único que mexe sem intervenção)
- Escopo limitado: apenas invariante "se tem tier YB/OG/GF ⇒ deve ter
  BAIRRISTAS_BASE"
- Todas as outras correcções de drift requerem comando manual

### 4. Job `data_health_collect`

- Corre 5/5min
- Actualiza gauges em tempo quase-real
- Permite dashboard "health at-a-glance"

### 5. Event bus + sheet projections (event-driven)

- `src/sheets/projections.js` regista subscribers por tab
- Cada projecção tem debounce 5s (evita sync excessivo)
- Sync inicial no boot (20s delay) traz estado ausente

### 6. Slash commands de reconcile

- `/rg-sync-roles modo:dry-run` — relatório
- `/rg-sync-roles modo:apply` — aplica
- `/rg-sync-structure modo:dry-run` — estrutura de canais/cat
- `/rg-sync-structure modo:apply` — aplica
- `/rg-sync-perms modo:apply` — canais individuais bairrista

---

## Invariantes monitorizados

| Invariante | Como detectar | Fix automático? |
|---|---|---|
| Member tier ⇒ BAIRRISTAS_BASE role | `role_invariants` job | **sim** (único) |
| Member role em DB = role mais alto no Discord | `reconcile_daily` gauge | manual |
| Member com `channel_id` tem canal Discord vivo | `reconcile_daily` gauge | manual |
| `resident_channels.status = 'active'` ⇒ canal existe | `reconcile_daily` | manual |
| Sheet tab `Membros` tem mesmo count que `SELECT COUNT(*) FROM members` | `data_health_collect` gauge | manual (re-sync) |
| Audit log não tem gap > 24h | implícito via retention | — (logs só crescem) |
| `inventory_movements` → balance >= 0 per item | out-of-scope (validação de entrada) | — |

---

## Playbook de resolução

### Drift de role (DB ≠ Discord)

1. `/rg-sync-roles modo:dry-run` → relatório
2. Para cada divergência decidir:
   - **Discord correcto, DB errada** (comum — admin promoveu via Discord):
     corre `/rg-sync-roles modo:apply`
   - **DB correcta, Discord errado** (comum — role removido por engano):
     corre via job `role_invariants` (se é o BAIRRISTAS_BASE) ou adiciona
     manualmente
3. Evento `member.promoted` / `member.demoted` dispara para re-sync Sheet

### Sheet desactualizada

1. Verificar `sheet_sync_state` na DB — qual tab está stale?
2. `/rg-sync-sheet tab:<name>` (ou `/rg-sync-sheet tab:all`) força
   re-projecção
3. Se tab continuar stale após 5 min → rate limit Google ou erro de
   credenciais; ver logs `[SHEETS]`

### Canal individual em falta (DB diz activo, Discord não tem)

1. Caso 1 — canal apagado manualmente: actualizar `resident_channels.status
   = 'deleted'` + limpar `members.channel_id`. Pode ser feito via
   `/rg-repair-channels`.
2. Caso 2 — canal existe mas ID mudou: actualizar `members.channel_id`
   com o novo.

### Audit log gap

1. Improvável — retention só apaga > 365d
2. Se aparecer: verificar se algum handler está a escrever sem
   `logAudit()`
3. Grep: `grep -rn recordMovement src/` vs `grep -rn logAudit src/` por
   dominio — cada fluxo crítico deve ter audit

---

## Backlog

- Real-time drift detection via Discord gateway events (GuildMemberUpdate,
  ChannelDelete) → auto-update DB sem esperar pelo `reconcile_daily`.
  Hoje depende de pooling.
- Dashboard externo (Grafana/similar) com os gauges data_health expostos.
  Hoje métricas Prometheus existem em `/metrics` mas não há visualização
  consumidora.
- Alarmistica: disparar notificação para Chefia se drift > threshold.
  Hoje requer intervenção humana para verificar.
