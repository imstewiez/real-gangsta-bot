# Google Sheets — Firma RedWood

Dashboard premium da organização, espelha a DB (que continua a ser a fonte
da verdade). O bot escreve; humanos lêem.

---

## Configuração

Variáveis de ambiente:

```env
GOOGLE_SERVICE_ACCOUNT_JSON=<json inline | caminho do ficheiro>
SPREADSHEET_ID=<id do spreadsheet>     # legado (aceite)
GOOGLE_SHEET_ID=<id do spreadsheet>    # alternativo
SHEETS_SYNC_INTERVAL_MIN=15            # default 15 min
```

O service account precisa de ter permissão de editor no spreadsheet.

---

## Tabs

15 tabs, ordem fixa. O bot cria as que faltam na primeira sincronização.

| # | Tab | Conteúdo |
| --- | --- | --- |
| 1 | **Dashboard** | KPI cards, destaques, período |
| 2 | **Resumo Semanal** | Métricas semana actual vs anterior |
| 3 | **Resumo Diário** | Últimos 14 dias |
| 4 | **Membros** | Ficha mestra com todos os agregados |
| 5 | **Moradores** | Vista filtrada (tiers morador) |
| 6 | **Oficiais** | Vista filtrada (oficiais + chefia) |
| 7 | **Saídas** | Histórico completo de saídas |
| 8 | **Participantes** | Detalhe por participante por saída |
| 9 | **Kills** | Log detalhado + KPI bar |
| 10 | **Spots** | Análise agregada por spot |
| 11 | **Inventário** | Stock actual + estado |
| 12 | **Movimentos** | Ledger completo (últimos 2000) |
| 13 | **Rankings** | 7 blocos de tops |
| 14 | **Auditoria** | Últimas 1000 acções |
| 15 | **Config** | Legendas, referências, scores |

---

## Comandos

- `/rg-sync-sheets` — sincroniza todas as tabs
- `/rg-sync-sheets-tab tab:<key>` — sincroniza apenas uma
- `/rg-sync-sheets-rebuild` — apaga e recria tabs (reset total)

Automático: scheduler corre `syncAll` a cada `SHEETS_SYNC_INTERVAL_MIN`
minutos (default 15).

---

## Arquitectura

```
src/sheets/
  googleAuth.js       — auth + cliente cached
  theme.js            — paleta RedWood + helpers de formatação
  workbook.js         — gestão de tabs (ensure, rebuild, tabColor)
  batchWriter.js      — acumula requests, 1 call em vez de N
  queries.js          — queries analíticas (sem loops N+1)
  syncEngine.js       — orquestrador (syncAll, syncOne, rebuildWorkbook)
  tabs/
    _common.js        — helpers partilhados (header, table header, widths)
    dashboard.js
    weekly.js
    daily.js
    members.js
    moradores.js
    oficiais.js
    saidas.js
    participantes.js
    kills.js
    spots.js
    inventory.js
    movements.js
    rankings.js
    audit.js
    config.js
  inventorySync.js    — [DEPRECATED] shim para syncEngine
```

---

## Tema RedWood

Paleta em `src/sheets/theme.js`:

- `RED_DEEP #8B0000` — accent forte
- `RED_BLOOD #B22222` — header
- `BLACK #0F0F0F` — fundo escuro
- `CHARCOAL #1C1C1C` — secções, cards
- `GRAPHITE #3A3A3A` — linhas pares
- `OFF_WHITE #F5F5F5` — texto body
- `GRAY_LIGHT #DCDCDC` — labels KPI
- `GREEN_SOFT` / `RED_SIGNAL_SOFT` / `YELLOW_SOFT` — conditional formatting
- `GOLD #B8860B` — destaque elegante (topos)

---

## Conditional formatting

- K/D, Win Rate, Survival, Return Rate — gradient vermelho → amarelo → verde
- Kills (linha) > 3 → verde
- Mortes (linha) > 2 → vermelho soft
- Net negativo → vermelho soft; > 500€ → verde
- Stock < 4 → vermelho; > 50 → verde

---

## Identidade textual

- `Dashboard · Firma RedWood`
- `Resumo Semanal · Peso da Semana`
- `Resumo Diário · Balanço da Rua`
- `Saídas · Movimento da Casa`
- `Spots · Ponto dos Spots`
- `Kills · Quem Pesou na Rua`
- `Rankings · Topo do Guetto`
- `Inventário · Stock da Casa`
- `Movimentos · Ledger da Rua`
- `Membros · Ficha da Casa`
- `Oficiais · Núcleo da Firma`
- `Moradores · Quem Pesa na Casa`
- `Participantes · Quem Rende na Rua`
- `Auditoria · Registo da Casa`
- `Config · Legendas & Referências`

Footer padrão em todas: `— Firma RedWood`.

---

## Performance

- **1 batchUpdate por tab** (não N). Typical sync ≈ 15 API calls (1 per tab).
- **Queries com JOIN** em vez de loops N+1.
- **Sequential** a nível de tabs — evita rate limit Sheets API.

---

## Debug / manutenção

- Todos os syncs fazem log de `[SHEETS] sync <tab>: N ops em Xms`.
- Erros individuais não matam o batch — continua com as restantes tabs.
- `rebuildWorkbook()` recria o schema completo quando mudas o código.
