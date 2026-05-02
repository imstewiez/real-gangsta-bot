# Message Lifecycle — Política central

Canonical em `src/shared/messagePolicy.js` + `src/shared/interactionHelpers.js`.

## Taxonomia (7 classes)

| Classe       | TTL    | Auto-delete | Lock on expire | Uso                                                 |
|--------------|--------|-------------|----------------|-----------------------------------------------------|
| `BANAL`      | 20s    | sim         | não            | "guardado", "feito", validação OK                   |
| `WARN`       | 45s    | sim         | não            | input inválido, duplicado, permissão negada         |
| `ERROR`      | 60s    | sim         | não            | falha recuperável, item não encontrado              |
| `RESULT`     | 60s    | sim         | não            | lista, ranking, histórico curto                     |
| `COCKPIT`    | 120s   | sim         | não            | Movimento no Bairro, perfis, drill-downs densos     |
| `FLOW`       | —      | **não**     | **sim**        | wizards multi-step (desactiva componentes ao fim)   |
| `PERSISTENT` | —      | **não**     | não            | painéis fixos, logs em canais                       |

## Hierarquia

1. **Descartável** (BANAL) — feedback rápido, transitório
2. **Leitura curta** (WARN, ERROR) — avisos e erros
3. **Leitura detalhada** (RESULT) — consultas
4. **Cockpit / navegação** (COCKPIT) — dashboards pessoais
5. **Fluxo interactivo** (FLOW) — persiste; desactiva ao expirar
6. **Persistente** (PERSISTENT) — painéis, logs, publicações em canais

## Uso

```js
const { safeReply } = require('../shared/interactionHelpers');

// Cockpit denso — 2 minutos para ler com calma
return safeReply(interaction, { embeds: [embed], components: [navRow] },
  { messageClass: 'COCKPIT' });

// Confirmação banal
return safeReply(interaction, { content: '✅ Guardado.' },
  { messageClass: 'BANAL' });

// Erro de validação
return safeReply(interaction, { content: '⚠️ Quantidade inválida.' },
  { messageClass: 'WARN' });

// Fluxo interactivo (wizard)
return safeReply(interaction, { embeds: [step], components: [select] },
  { messageClass: 'FLOW' });
```

## Retrocompatibilidade

Código antigo que usa `dismissible: true` continua a funcionar (→ BANAL).
`dismissible: false` mapeia para FLOW.

## Datas e timestamps

Formato canónico: `dd/mm/yyyy - hh:mm` (ex: `16/04/2026 - 21:35`).

Helper único em `src/shared/formatPtDate.js`:

```js
const { formatPtDate, formatPtDateOnly, discordRelative } = require('../shared/formatPtDate');

formatPtDate(new Date());         // "16/04/2026 - 21:35"
formatPtDateOnly(new Date());     // "16/04/2026"
discordRelative(new Date());      // "<t:.....:R>"  → "2 hours ago"
```

Nunca usar `.toISOString().split('T')[0]` em conteúdo user-facing.

---

**Firma RedWood**
