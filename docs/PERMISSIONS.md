# Permissões — matriz de acesso

Canonical em `src/discord/structureTemplate.js` + `src/members/channelInvariants.js`.

**Regra dura:** o bot NUNCA renomeia canais. Nomes reais preservados,
permissões ajustadas por ID/nome.

## Hierarquia de roles

```
 1. Manda-Chuva      ┐ command (topo)
 2. Kingpin          ┘
 3. OG               ┐ supervisor (oficiais)
 4. Real Gangster    ┘
 5. Patrão di Zona   — patrao_di_zona (gestão do bairro)
 6. Gangster Fodido  ┐
 7. O Gunão          ├ bairrista_tiers (tiers)
 8. Young Blood      ┘
 9. Bairristas       — bairristas_base (role obrigatório)
10. Tropinhas        ┐ flavor (sem perms específicas)
11. Patrulha Pata    ┘
12. Pendente         — onboarding transitório
```

## Matriz (alto nível)

| Categoria  | @everyone | Pendente | Bairristas | P.Zona/Sup/Cmd | Bot |
|------------|-----------|----------|------------|----------------|-----|
| ENTRADA    | deny      | view     | deny       | view           | publish |
| COMANDO    | deny      | deny     | deny       | view+send      | publish |
| OFICIAIS   | deny      | deny     | deny       | view+send      | publish |
| GUETTO     | deny      | deny     | view+send  | view+send+mgmt | publish+mgmt |
| INVENTARIO | deny      | deny     | deny       | view+send      | publish |
| ARSENAL    | deny      | deny     | view (RO)  | view+send      | publish |
| OPERACOES  | deny      | deny     | view (RO)* | view+send      | publish |
| ECONOMIA   | deny      | deny     | view (RO)  | view+send      | publish |
| REPUTACAO  | deny      | deny     | view+send  | view+send      | publish |
| CALLS      | deny      | deny     | deny       | connect        | — |
| GERAL      | deny      | deny     | view+send  | view+send      | publish |

\* `spots` e canais operacionais: bairristas consultam, staff+bot publicam.

## Channel overrides (read-only para bairristas)

Aplicado por `CHANNEL_PERM_OVERRIDES_BY_NAME` em `structureTemplate.js`:

- `spots`
- `mapas`
- `precarios` / `precários`
- `ranking`
- `tops-semanais`
- `regras`
- `info-geral`
- `meta-semanal`
- `ofertas-org`
- `premios-semanais` / `prémios-semanais`

Bairristas vêem e lêem; não escrevem. Staff+bot publicam.

## Canais individuais (blindagem)

`reconcileBairristaChannels` em `channelInvariants.js` força:

**Permitir:**
- Owner: view, send, read history
- Bot: view, send, manage
- Command (Manda-Chuva, Kingpin): view, send, read, manage
- Supervisor (OG, Real Gangster): view, send, read
- Patrão di Zona: view, send, read, manage messages

**Bloquear explicitamente (deny ViewChannel + SendMessages):**
- Outros bairristas (tiers + base)
- Tropinhas do Guetto
- Patrulha Pata
- Pendente

Sem o deny, a categoria GUETTO cascateia "bairrista vê" para os canais
individuais — e outros bairristas vêem o canal do colega. Inaceitável.

## Aplicar / reconciliar

- **Diário**: `role_invariants` job corre `reconcileAllMembers` (roles)
  e `reconcileBairristaChannels` (canais privados).
- **Sob demanda**: chamar `reconcileBairristaChannels(guild)` do código;
  o `/perms` slash foi erradicado (agora é job).

---

**Firma RedWood**
