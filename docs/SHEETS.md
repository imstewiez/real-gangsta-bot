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

6 tabs canónicas, ordem fixa. Criadas automaticamente na primeira sync.

| # | Tab | Conteúdo |
| --- | --- | --- |
| 1 | **📊 Dashboard** | Central de comando: 2 KPI strips + destaques + tendência vs anterior + stock por categoria + alertas |
| 2 | **📈 Resumo & Rankings** | Pilares da semana + comparativo + breakdown 14 dias + top/flop spots + 7 rankings competitivos + rankings Bairristas (semanal/mensal/all-time/streaks) |
| 3 | **👥 Membros** | Panorama casa + distribuição por tier + núcleo oficiais + roster completo com stats, K/D, kills, lucro |
| 4 | **🎯 Saídas & Combate** | Panorama operacional + ledger de saídas (25 colunas) + ledger de participações (com tipo caract./trab. e arma) + spots + kill log |
| 5 | **📦 Stock** | Panorama + stock por casa + breakdown categoria + inventário detalhado agrupado + ledger de movimentos |
| 6 | **⚙️ Config** | Legendas: tiers, resultados, movimentos, cores, material vs €, scores compostos, sync engine |

### Identidade textual

```
Dashboard · Firma RedWood
Resumo & Rankings · Firma RedWood
Membros · Ficha da Casa
Saídas & Combate · Firma RedWood
Stock · Inventário & Movimentos
Config · Legendas & Referências
```

Assinatura global: `— Firma RedWood`.

---

## Comandos

| Comando | Efeito |
| --- | --- |
| `/rg-sync-sheets` | Sincroniza todas as 6 tabs |
| `/rg-sync-sheets-tab tab:<key>` | Sincroniza apenas uma tab (dashboard, resumo, membros, saidas, stock, config) |
| `/rg-sync-sheets-rebuild` | Apaga e recria as 6 tabs canónicas |
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
    dashboard.js      — central de comando + KPIs + alertas
    resumo.js         — semanal + 14 dias + rankings competitivos + Bairristas
    membros.js        — roster completo + stats por membro
    saidas.js         — ledger saídas + participações + spots + kill log
    stock.js          — inventário + movimentos por categoria
    config.js         — legendas e referências
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
- Typical syncAll ≈ 10–15 segundos, 6 tabs com conteúdo denso (até 175 ops/tab).

---

## Debug / manutenção

- Todos os syncs fazem log: `[SHEETS] sync <tab>: N ops em Xms`.
- Erros individuais não matam o batch — continua com as restantes tabs.
- `rebuildWorkbook({ purgeOthers: true })` faz reset total + limpa duplicados.
- Para experimentar uma só tab: `/rg-sync-sheets-tab tab:<key>`.
