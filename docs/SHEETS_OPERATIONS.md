# Google Sheets — Operações e Fiabilidade

Doc operacional do subsistema Sheets: como sincroniza, o que garante, o
que falha, e o que fazer quando falha. Complementa `docs/SHEETS.md`
(design/conteúdo das tabs) com foco em **fiabilidade** e **runbook**.

Última revisão: 2026-04-18.

---

## 1 · Arquitectura de sync

```
┌─────────────┐   domain events   ┌────────────────┐   debounce (5s)   ┌───────────────┐
│   engines   ├──────────────────▶│  projections   ├──────────────────▶│  syncEngine   │
│ (saidas,    │  (25+ eventos)    │ (subscriber)   │   + retry 3×      │   syncOne()   │
│  kills,     │                   │                │   transient-only  │                │
│  inventory) │                   └────────────────┘                   └───────┬───────┘
└─────────────┘                                                                │
                                                                               ▼
                                                                      ┌───────────────┐
                                                                      │ Google Sheets │
                                                                      │   batchUpdate │
                                                                      └───────────────┘
```

**Modelo**: event-driven eventual consistency.

- Não há sync periódico agendado. Nenhum `job` do scheduler toca nas
  tabs directamente.
- Cada mutação relevante emite um evento de domínio (ex: `saida.closed`,
  `material.registered`). O mapa `EVENT_TO_TABS` em `src/sheets/projections.js`
  decide que tabs invalidar.
- Cada tab tem um **debounce timer** de 5s. Uma rajada de eventos num
  domínio coalesce num único sync. Debounce é **por tab** — uma rajada em
  `saidas` não atrasa o flush de `membros`.
- `syncOne(tab)` é sequencial dentro da tab (um batch, um flush) e em
  `syncAll()` é sequencial entre tabs (rate-limit-safe by construction).

---

## 2 · Garantias e limites

### ✅ Garantido

- Qualquer mutação relevante (ver lista de eventos em `projections.js:20-54`)
  dispara sync em **≤ 5s** em steady state.
- Falhas transitórias da API Google (5xx, 429, timeouts, ECONNRESET) são
  recuperadas automaticamente: 3 tentativas, backoff 1s/3s/9s.
- Cada sync é atómico por tab — ou o batch inteiro aplica, ou nada aplica.
- Estado de cada tab (última sync, resultado, erros consecutivos) persiste
  em `sheet_sync_state`.

### ⚠️ Não garantido

- **Tempo real**: Sheets não é fonte da verdade. Latência típica 5-15s
  após a mutação.
- **Idempotência entre tabs**: se 3 tabs são invalidadas pelo mesmo
  evento, cada uma sincroniza isoladamente. Podes ver 2 tabs actualizadas
  e a 3ª ainda não durante a janela de 5s.
- **Recuperação de bugs persistentes**: se um sync falha por bug do bot
  (400 Bad Request, referência a coluna inexistente, etc.), o retry NÃO
  activa — só para erros classificados como transitórios. O erro aparece
  em logs + incrementa `consecutive_errors` na DB.

### ❌ Não suportado

- Edição manual das tabs pelo utilizador. A próxima sync sobrescreve.
  Protecção automática warning-only aplicada após cada sync.
- Reordenação manual das tabs. `ensureTabs` recria mas não corrige ordem.
- Rotação do service account key em tempo real — requer restart do bot.

---

## 3 · Slash command `/sync-sheets`

Chefia-only. 3 acções:

| Acção | Efeito | Quando usar |
|---|---|---|
| `status` (default) | Mostra tabela: last_synced_at, last_result, consecutive_errors por tab | Suspeita de "sheet está stale" — primeiro passo |
| `all` | `syncEngine.syncAll()` — força resync de todas as 6 tabs | Após migration grande, restore de DB, ou quando status mostra várias degradadas |
| `tab` | `syncEngine.syncOne(<tab>)` — resync de uma só tab | Status mostra uma tab específica degradada |

**Importante**: `/sync-sheets` **não aplica retry**. É diagnóstico manual
— se falhar, vê o erro no embed e decide o próximo passo. O retry existe
só no caminho event-driven (projections).

---

## 4 · Observabilidade

### Métricas (Prometheus, via `/rg-metrics`)

- `rg_sheets_sync_total` — contador total de syncs executados
- `rg_sheets_sync_errors_total` — contador de erros finais (após retries)
- `rg_sheets_sync_by_tab{tab,result}` — contador por tab e resultado (`ok`/`error`)
- `rg_sheet_stale_tabs` — gauge: tabs com `last_synced_at > 2× SHEETS_SYNC_INTERVAL_MIN`
- `rg_sheet_error_tabs` — gauge: tabs com `last_result=error`

Gauges são actualizados pelo job `data_health_collect` (a cada 5 min).

### Estado em DB (`sheet_sync_state`)

```sql
SELECT tab_key, last_synced_at, last_result, last_ops, last_ms,
       consecutive_errors, last_error
  FROM sheet_sync_state
  ORDER BY tab_key;
```

Colunas-chave:
- `consecutive_errors` ≥ 3 → bug persistente, não transitório. Investigar.
- `last_result = 'error'` com `last_error` contendo `400` ou `Invalid` → bug do bot; retry não resolve.
- `last_result = 'error'` com `last_error` contendo `429`/`503`/`timeout` → transitório; provavelmente recuperou já.

### Logs (Railway / `logs/realgangsta-debug.log`)

- `[PROJ] evento 'X' → tabs pendentes: ...` — evento recebido, debounce armado.
- `[PROJ] ${tab} sync: ${ops} ops em ${ms}ms` — sync bem-sucedido via projections.
- `[PROJ] ${tab} transitório (tentativa N/3): ...` — backoff em curso.
- `[PROJ] ${tab} falhou (após retries se aplicável): ...` — falha final.
- `[SHEETS] sync ${key}: ${ops} ops em ${ms}ms` — sincronização completa no syncEngine.

---

## 5 · Runbook de troubleshooting

### Sintoma: "a sheet X parece desactualizada"

1. `/sync-sheets acao:status` — vê last_synced_at de cada tab.
2. Se `nunca sincronizada` → provavelmente a tab foi apagada manualmente
   no Google Sheets; `/sync-sheets acao:tab tab:<key>` recria e enche.
3. Se last_synced_at < 1 min → não é stale, é timing normal. Espera mais
   5-10s e recarrega no browser.
4. Se last_synced_at > 15 min E `last_result=error` com `consecutive_errors ≥ 3`
   → bug persistente. Vê `last_error`, corrige, depois `/sync-sheets acao:tab`.
5. Se last_synced_at > 15 min E `last_result=ok` mas a sheet parece stale
   → o evento não foi emitido. Procurar em `src/core/events.js` se o
   evento está mapeado em `EVENT_TO_TABS`.

### Sintoma: "syncs estão todos a falhar"

1. Confirma que `GOOGLE_SERVICE_ACCOUNT_JSON` e `SPREADSHEET_ID` estão
   configurados no Railway.
2. Abre o Sheet em browser — o service account tem permissão `Editor`?
3. Se erro = `401 Unauthorized` → credencial inválida, regenerar key.
4. Se erro = `403 PERMISSION_DENIED` → o Sheet mudou de dono ou o service
   account foi removido dos partilhados.
5. Se erro = `429` contínuo → quota excedida; Google API tem limit 300
   req/min. Reduzir trigger rate ou esperar 1 min.

### Sintoma: "Attempting to write row N, beyond last requested row of M"

Erro estrutural — o syncer subestimou `lastRow` e o trim encolheu demais.
Corrigido por duas defesas complementares:

1. `_maxWrittenCell` em `syncEngine.js` inspecciona **todos** os request
   types no batch (updateCells, updateDimensionProperties de setRowHeight,
   mergeCells, etc.) para nunca cortar abaixo de writes reais.
2. `DEFAULT_PADDING_ROWS = 3` em `cleanup.js` deixa 3 linhas de headroom.

Se voltar a acontecer: logar `batch.requests.length` e inspeccionar o
syncer da tab afectada (provavelmente um novo request type não coberto).

### Sintoma: "spot_cooldowns não existe"

Migration drift. `schema_migrations` pode ter ID marcado como aplicado
mas a tabela foi dropada. As migrations 030 e 031 são idempotentes
(`CREATE TABLE IF NOT EXISTS`). Redeploy aplica-as.

---

## 6 · Limitações conhecidas (não-scope deste hardening pass)

- Não há `last_data_hash` validation — syncs podem escrever dados errados
  com `result=ok`. Validation via hash requer design (excluir formatação,
  só validar valores).
- Sem circuit breaker — retries correm indefinidamente sobre um tab em
  falha persistente (bem, não exactamente: não há retry entre eventos, só
  dentro do mesmo flush). Mitigação: `consecutive_errors` visível no
  `/sync-sheets status`.
- Sem anomaly detection — uma queda 50% em `last_ops` semana-a-semana não
  é alertada.
- Sem preservação de protecções manuais do utilizador — todas as
  protecções são re-criadas a cada sync.

---

## 7 · Invariantes do código (para reviewers)

Ao mexer em `src/sheets/`:

- **Mantém** o debounce de 5s por-tab. Menos → rajadas API; mais → UX stale.
- **Mantém** retry só em erros transitórios. Retry em 400 esconde bugs.
- **Mantém** `syncOne(tab)` idempotente — chamar 2× tem o mesmo efeito.
- **Mantém** `syncAll()` sequencial — parallel viola rate limit e mistura
  logs.
- **Não** adiciones chamadas à API fora de `BatchWriter` — viola
  rate-limit-safe invariant.
- **Não** silencies erros em `syncOne`. Erros devem surfar em métricas
  + `sheet_sync_state`.

Ver também: `docs/SHEETS.md` (design), `docs/JOBS.md` (scheduler),
`src/sheets/projections.js` (event map).
