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

15 tabs canónicas, ordem fixa. Criadas automaticamente na primeira sync.

| # | Tab | Conteúdo premium |
| --- | --- | --- |
| 1 | **Dashboard** | 7 secções: header + 2 KPI strips + destaques + tendência + stock por categoria + alertas + footer |
| 2 | **Resumo Semanal** | KPI strip (win rate, KD, lucro, entregas) + comparativo detalhado com Δ absoluto, Δ % e direcção colorida |
| 3 | **Resumo Diário** | KPI strip 14 dias + breakdown com badges contextuais (BOM DIA, A PERDER, PESOU, DIA CARO) |
| 4 | **Membros** | KPI strip (membros, entregues, kills, lucro) + roster completo com pills role/tier/status e heatmap |
| 5 | **Moradores** | 2 KPI strips (distribuição por tier + métricas agregadas) + roster ordenado por tier rank |
| 6 | **Oficiais** | Performance agregada (win rate colectivo, KD médio, lucro, MVPs) + tabela ordenada por K/D |
| 7 | **Saídas** | Panorama operacional + ledger 24 colunas com badges de status/resultado |
| 8 | **Participantes** | Indicadores agregados (participações, MVPs, survival rate) + ledger com badges e scores |
| 9 | **Kills** | Panorama (total, semana, top killer, top facção) + kill log |
| 10 | **Spots** | Panorama + top 3 rentáveis (gold/silver/bronze) + flop 3 arriscados + tabela completa com tier badges |
| 11 | **Inventário** | Panorama + breakdown por categoria com % + detalhe agrupado por categoria com subtotais |
| 12 | **Movimentos** | Resumo monetário + ledger raw denso (até 2k registos) com 11 tipos pill |
| 13 | **Rankings** | 7 blocos premium (entregas, kills, profit, MVP, survival, discipline, K/D) com top 10 cada |
| 14 | **Auditoria** | Breakdown por top entidades + ledger raw com badges (SAÍDA/STOCK/MEMBRO/...) |
| 15 | **Config** | Legendas premium: tiers, resultados, movimentos, cores, material vs €, scores, sync engine |

### Identidade textual

```
Dashboard · Firma RedWood
Resumo Semanal · Peso da Semana
Resumo Diário · Balanço da Rua
Membros · Ficha da Casa
Moradores · Quem Pesa na Casa
Oficiais · Núcleo da Firma
Saídas · Movimento da Casa
Participantes · Quem Rende na Rua
Kills · Quem Pesou na Rua
Spots · Ponto dos Spots
Inventário · Stock da Casa
Movimentos · Ledger da Rua
Rankings · Topo do Guetto
Auditoria · Registo da Casa
Config · Legendas & Referências
```

Assinatura global: `— Firma RedWood`.

---

## Comandos

| Comando | Efeito |
| --- | --- |
| `/rg-sync-sheets` | Sincroniza todas as 15 tabs |
| `/rg-sync-sheets-tab tab:<key>` | Sincroniza apenas uma tab |
| `/rg-sync-sheets-rebuild` | Apaga e recria as 15 tabs canónicas |
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
- Typical syncAll ≈ 7–8 segundos, 15 tabs × ~30 ops cada.

---

## Debug / manutenção

- Todos os syncs fazem log: `[SHEETS] sync <tab>: N ops em Xms`.
- Erros individuais não matam o batch — continua com as restantes tabs.
- `rebuildWorkbook({ purgeOthers: true })` faz reset total + limpa duplicados.
- Para experimentar uma só tab: `/rg-sync-sheets-tab tab:<key>`.
