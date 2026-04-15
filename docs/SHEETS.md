# Google Sheets · Firma RedWood

Dashboard premium da organização. A DB continua a ser a fonte da verdade;
o Sheets é a camada de **visualização, analytics e reporting**.
O bot escreve — humanos lêem.

---

## Configuração

```env
GOOGLE_SERVICE_ACCOUNT_JSON=<json inline | base64 | caminho>
SPREADSHEET_ID=<id do spreadsheet>
SHEETS_SYNC_INTERVAL_MIN=15           # default 15 min
```

O service account precisa de acesso **Editor** no spreadsheet.

---

## Design System

Todas as tabs partilham o **design system RedWood** definido em:

- `src/sheets/theme.js` — tokens (cores, tipografia, spacing, widths,
  borders, number formats) + células semânticas.
- `src/sheets/tabs/_common.js` — biblioteca de componentes:

| Componente | Efeito |
| --- | --- |
| `headerBlock` | Título + subtítulo + timestamp no topo da tab |
| `sectionHeader` | Subcabeçalho de bloco com accent bar e hint opcional |
| `spacer` | Row vazia respirável (XS/SM/MD) entre blocos |
| `divider` | Barra fina accent (RED_DEEP) ou hair (cinzento) |
| `kpiStrip` | Strip horizontal de KPI cards (label · valor · delta) |
| `tableHeader` | Cabeçalho de tabela + freeze das rows acima |
| `tableBody` | Escreve rows com banding alternado e filtro opcional |
| `rankingBlock` | Top-N com 1º/2º/3º em gold/silver/bronze |
| `alertBox` | Banner (info / warn / danger / success) |
| `footerBlock` | Assinatura Firma RedWood + timestamp |

### Paleta (theme.js)

- **Superfícies**: `VOID` · `BLACK` · `CHARCOAL` · `GRAPHITE` · `IRON` · `GRAY_DARK`
- **Texto**: `OFF_WHITE` (principal, tom marfim) · `GRAY` (muted)
- **Marca**: `RED_DEEP` · `RED_BLOOD` · `RED_SIGNAL` · `RED_SOFT`
- **Semantic**: `GREEN_DEEP` (positivo) · `YELLOW_DEEP` (atenção) · `BLUE_DEEP` (info)
- **Destaques**: `GOLD` (1º/MVP) · `SILVER` (2º) · `BRONZE` (3º)

### Tipografia

Fonte única: **Inter** (Google Fonts). Escala completa: TITLE (18) ·
SECTION (12) · HEADER (10) · BODY (10) · MUTED (9) · CAPTION (8) ·
KPI_VALUE (22) · KPI_LABEL (8) · RANK_1/2/3 (10 bold).

### Number formats

`INT` · `INT_DELTA` · `DEC` · `EURO` · `EURO_DEC` · `EURO_DELTA` ·
`PCT` · `PCT_DELTA` · `KD` · `DATE` · `DATETIME`.

### Cleanup engine

`src/sheets/cleanup.js` — `growSheet()` e `trimSheet()` ajustam
`gridProperties.rowCount/columnCount` automaticamente. Cada syncer
devolve `{ lastRow, lastCol }` e o `syncEngine` aplica o trim no mesmo
batch — **fim das folhas com 200 linhas inúteis**.

---

## Tabs

9 tabs canónicas, ordem fixa. Criadas automaticamente na primeira sync.

| # | Tab | Conteúdo premium |
| --- | --- | --- |
| 1 | **Dashboard** | Central de comando: header + 2 KPI strips + destaques + tendência + stock por categoria + alertas |
| 2 | **Resumo** | Temporal: pilares da semana + comparativo vs anterior + KPI strip 14 dias + breakdown diário (consolida weekly + daily) |
| 3 | **Membros** | Roster: panorama casa + distribuição por tier + núcleo oficiais + tabela completa filtrável (consolida members + moradores + oficiais) |
| 4 | **Saídas** | Histórico macro: panorama operacional + ledger 24 colunas com badges de status/resultado |
| 5 | **Participantes** | Vista micro: indicadores agregados + ledger detalhado por participação com scores + MVP |
| 6 | **Combate** | Kills + spots: panorama + top 3 / flop 3 spots + tabela completa spots + kill log (consolida kills + spots) |
| 7 | **Stock** | Material: panorama + breakdown categoria + inventário detalhado agrupado + ledger de movimentos (consolida inventory + movements) |
| 8 | **Rankings** | 7 blocos (entregas, kills, profit, MVP, survival, discipline, K/D) com top 10 cada, 1º/2º/3º em gold/silver/bronze |
| 9 | **Config** | Legendas: tiers, resultados, movimentos, cores, material vs €, scores, sync engine |

### Identidade textual

```
Dashboard · Firma RedWood
Resumo · Peso da Semana & Balanço da Rua
Membros · Ficha da Casa
Saídas · Movimento da Casa
Participantes · Quem Rende na Rua
Combate · Quem Pesou na Rua
Stock · Inventário & Movimentos
Rankings · Topo do Guetto
Config · Legendas & Referências
```

Assinatura global: `— Firma RedWood`.

---

## Comandos

| Comando | Efeito |
| --- | --- |
| `/rg-sync-sheets` | Sincroniza todas as 15 tabs |
| `/rg-sync-sheets-tab tab:<key>` | Sincroniza apenas uma tab |
| `/rg-sync-sheets-rebuild` | Apaga e recria as 9 tabs canónicas |
| `/rg-sync-sheets-rebuild purge:True` | O mesmo + apaga tabs não-canónicas (lixo antigo, duplicados) |

Automático: scheduler corre `syncAll` a cada `SHEETS_SYNC_INTERVAL_MIN`
(default 15min).

---

## Arquitectura

```
src/sheets/
  googleAuth.js       — auth + cliente cached
  theme.js            — design system (tokens + células)
  workbook.js         — gestão de tabs (ensure/rebuild com anchor)
  batchWriter.js      — acumula requests, 1 API call em vez de N
  queries.js          — queries analíticas (JOIN + CTE, zero N+1)
  cleanup.js          — grow/trim automático das dimensões da tab
  syncEngine.js       — orquestrador (syncAll/syncOne/rebuildWorkbook)
  tabs/
    _common.js        — biblioteca de componentes visuais
    dashboard.js
    resumo.js         — consolida weekly + daily
    membros.js        — consolida members + moradores + oficiais
    saidas.js
    participantes.js
    combate.js        — consolida kills + spots
    stock.js          — consolida inventory + movements
    rankings.js
    config.js
```

---

## Conditional formatting

Todas as tabs analíticas usam gradients e thresholds automáticos:

- **Gradients** (heatmap min→max): Win Rate, K/D, Survival, Return Rate,
  Perf Score, Disc Score.
- **Thresholds**:
  - Kills (linha) > 3 → verde
  - Mortes (linha) > 2 → vermelho soft
  - Net < 0 → vermelho soft · > 500€ → verde
  - Lucro (membro) > 1000€ → verde · < -500€ → vermelho
  - Stock < 4 → vermelho · > 50 → verde

---

## Performance

- **1 batchUpdate por tab** — não N chamadas.
- **Queries com JOIN + CTE** em vez de loops N+1.
- **Sequential** entre tabs — evita rate limit Sheets API.
- **Parallel queries** dentro de cada tab (Promise.all).
- Typical syncAll ≈ 15–20 segundos, 9 tabs com conteúdo denso (até 175 ops/tab).

---

## Debug / manutenção

- Todos os syncs fazem log: `[SHEETS] sync <tab>: N ops em Xms`.
- Erros individuais não matam o batch — continua com as restantes tabs.
- `rebuildWorkbook({ purgeOthers: true })` faz reset total + limpa duplicados.
- Para experimentar uma só tab: `/rg-sync-sheets-tab tab:<key>`.
