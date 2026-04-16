# Notifications — routing + templates

Canonical em `src/notifications/`:
- `channels.js` — resolve canal por família
- `routing.js` — subscriber do event bus → publica
- `templates.js` — embed builders ricos

## 3 famílias consolidadas

| Família            | Canal (reutilizado)             | ENV opcional              | Eventos |
|--------------------|---------------------------------|---------------------------|---------|
| `ORG_LIFECYCLE`    | `📋-logs` (ENTRADA)             | `ORG_LIFECYCLE_CHANNEL_ID` | member.joined / left / promoted / tier_changed / nickname_changed |
| `INVENTORY_EVENTS` | `📦-stock-log` (COMANDO)        | `INVENTORY_EVENTS_CHANNEL_ID` / `STOCK_LOG_CHANNEL_ID` | material.registered / adjusted / transferred · order.* |
| `SAIDAS_EVENTS`    | `🎯-resultados` (OFICIAIS)      | `SAIDAS_EVENTS_CHANNEL_ID` / `SAIDA_RESULTS_CHANNEL_ID` | saida.opened / started / closed / material_issued / participant_added |

Individuais preservados:
- `CEMETERY` → `💀-cemitério` → `kill.registered`
- `RANKINGS` → `🏆-tops-semanais` → weekly rankings job

## Resolução de canal

Ordem:
1. ENV var (ex: `INVENTORY_EVENTS_CHANNEL_ID` no `.env`)
2. ENV fallback (ex: `STOCK_LOG_CHANNEL_ID` legacy)
3. Slug match nos nomes de canais actuais da guild
4. Null → bot ignora silenciosamente

Cache em memória — invalidação via `invalidateCache(family)` se um canal
for (re)criado em runtime.

## Templates

Todos os embeds:
- Usam `formatPtDate` (`dd/mm/yyyy - hh:mm`)
- Têm título forte + descrição objectiva
- Campos bem ordenados (mais importantes primeiro)
- Emoji lexicon semântico (`src/content/emojis.js`)
- Footer Firma RedWood via `brandEmbed(variant)`

### Inventário

`inventoryMovementEmbed({ movementType, itemName, quantity, memberDiscordId,
actorId, value, operationId, balanceAfter, notes, at })` — cobre 11 tipos
de movimento com cor+emoji próprios (entrega/venda/fornecimento/perda/etc.)

### Encomendas

`orderLifecycleEmbed({ event, itemName, quantity, memberDiscordId, actorId,
status, notes, createdAt, resolvedAt, at })` — 5 eventos (created, approved,
fulfilled, denied, cancelled).

### Vida da Org

`orgLifecycleEmbed({ event, displayName, discordId, beforeState, afterState,
actorId, context, at })` — 7 eventos (joined, left, promoted, tier_changed,
nickname_changed, tag_approved, tag_denied).

### Saídas

`saidaLifecycleEmbed({ event, saidaId, spot, saidaType, leaderId, result,
participantsCount, characterized_count, workers_count, gross, net, lost,
consumed, unaccounted, actorId, notes, at })` — 5 eventos.

## Wiring

```
domain engine → eventBus.emitAsync('saida.opened', payload)
                                    ↓
                     notifications/routing.js subscriber
                                    ↓
                     resolve channel (INVENTORY_EVENTS)
                                    ↓
                     templates.saidaLifecycleEmbed(payload)
                                    ↓
                     channel.send({ embeds: [embed] })
```

Zero ligação directa engine → channel. Engines apenas emitem eventos; o
routing resolve e publica.

---

**Firma RedWood**
