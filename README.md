# Real Gangsta

Bot de gestão do bairro/grupo RP **Real Gangsta**. Gere onboarding, hierarquia, inventário (ledger), operações/saídas, tops semanais, cemitério e auditoria — tudo com o Discord como interface e PostgreSQL como fonte de verdade.

## Stack

- Node.js ≥ 18 · discord.js v14 · PostgreSQL
- Deploy: Railway (`railway.toml`)

## Arranque

```bash
cp .env.example .env          # preenche secrets
npm install
npm run db:migrate            # aplica migrations em ordem por id
npm start
```

Testes:

```bash
npm test
```

## Hierarquia

```
 1. Manda-Chuva      │ Comando Total       (isCommand, isChefia)
 2. Kingpin          │
 3. OG               │ Supervisão          (isSupervisor, isOficial)
 4. Real Gangster    │
 5. Patrão di Zona   │ Chefe do Guetto     (isChefeMoradores)
 6. Gangster Fodido  │ tier 3 (topo)       ┐
 7. O Gunão          │ tier 2              ├─ Moradores
 8. Young Blood      │ tier 1 (entrada)    ┘
```

**Invariante core**: qualquer tier (YB/OG/GF) ⇒ role base **Moradores**. Aplicada em onboarding, promoções e via job diário.

## Fluxos

### Onboarding
1. Pessoa clica "Pedir Tag" no painel de entrada → modal (nome + alcunha).
2. Pedido fica pendente em `tag_requests`. Chefia aprova no canal `🏷️│tags`.
3. Aprovação:
   - adiciona `Moradores` (base) + `Young Blood` (tier 1)
   - cria registo em `members` (tier=young_blood)
   - cria canal individual no GUETTO com overwrites para o próprio + Comando + Supervisão + Patrão di Zona
   - envia embed de boas-vindas com painel pessoal
   - reforça invariantes

### Promoção automática
- `25.000€` de material acumulado (entregas + vendas) → promove YB → O Gunão
- `50.000€` → O Gunão → Gangster Fodido
- Acima disso é manual.

### Promoção a Oficial
- Detectada via `GuildMemberUpdate` (adição de role OG / Real Gangster).
- Canal individual é arquivado (`ARCHIVE_ON_PROMOTION=true`) — não apagado.

### Inventário (ledger)
Tipos de movimento: `saldo_inicial`, `entrega_morador`, `venda_morador`, `entrega_oficial`, `fornecimento_org`, `consumo_operacao`, `devolucao_operacao`, `ajuste_manual`, `perda_operacao`, `apreendido`, `craftado`.

Stock é sempre calculado a partir do ledger — nunca sobreposto.

### Operações
- Cria, adiciona participantes (via `UserSelectMenu` multi-select com pesquisa), regista material fornecido/devolvido/perdido/consumido, fecha com resultado (fight, mortes, sobreviventes).
- **Cadeia de custódia por participante** via `operationEngine.issueMaterialToParticipant` / `settleParticipantCustody`.

### Cemitério
- `/rg-kill` → modal de kill.
- `/rg-cemetery` → leaderboard.
- Auto-publica no canal `☠️│cemitério` (se `CEMETERY_CHANNEL_ID` configurado).

### Tops semanais
- Publicação automática domingo 23h no `WEEKLY_TOP_CHANNEL_ID` (controlada por `AUTO_PUBLISH_WEEKLY_TOP`).

## Slash commands

| Comando | Destinatário | Descrição |
|---|---|---|
| `/rg-setup` | Comando | Configura painéis iniciais |
| `/rg-sync-panels` | Comando | Republica painéis |
| `/rg-sync-structure modo:[dry-run|apply]` | Comando | Sincroniza estrutura do Discord |
| `/rg-sync-roles modo:[dry-run|apply]` | Comando | Reconcilia invariantes de roles |
| `/rg-bootstrap-stock modo:[dry-run|apply] force:[bool]` | Comando | Importa stock inicial |
| `/rg-stock` | Todos | Ver stock |
| `/rg-member` | Todos | Ficha de membro |
| `/rg-top-week` | Todos | Top semanal |
| `/rg-create-operation` | Comando | Criar saída |
| `/rg-close-operation` | Comando | Fechar saída |
| `/rg-audit` | Comando | Logs de auditoria |
| `/rg-items` | Todos | Catálogo |
| `/rg-add-item` | Comando | Adicionar item |
| `/rg-sync-sheets` | Comando | Export para Sheets (opcional) |
| `/rg-kill` | Todos | Registar kill |
| `/rg-cemetery` | Todos | Leaderboard cemitério |

## CLI scripts

```bash
# Bootstrap de stock inicial (ledger saldo_inicial)
npm run stock:bootstrap              # dry-run (default)
npm run stock:bootstrap:apply        # aplica (inclui --confirm)

# Sync de estrutura Discord
npm run structure:sync               # dry-run
npm run structure:sync:apply         # aplica
```

## Painéis

| Painel | Canal | Funcionalidades |
|---|---|---|
| Entrada | ENTRADA | Pedir Tag |
| Morador | GUETTO | Registar material, histórico, totais, progresso, top semanal |
| Oficial | OFICIAIS | Registar material, operações, histórico |
| Chefia | COMANDO | Criar/fechar operações, adicionar participantes, material, stock, gerir materiais, tops, logs |
| Chefe de Moradores | GUETTO | Listar moradores, entregas/vendas, tops moradores |

## Estrutura do Discord (template)

11 categorias bem identificadas, geridas declarativamente em `src/discord/structureTemplate.js`:

```
╭・𝗘𝗡𝗧𝗥𝗔𝗗𝗔          divulgação · entradas · tags · regras · info
╭・𝗖𝗢𝗠𝗔𝗡𝗗𝗢          comunicados · chefia · preços · logs · logs-bot
╭・𝗢𝗙𝗜𝗖𝗜𝗔𝗜𝗦          chat · disponibilidade · ausências · rádio · baú
╭・𝗚𝗨𝗘𝗧𝗧𝗢            chefia-moradores · baú-casa · encomendas · material · canais individuais
╭・𝗜𝗡𝗩𝗘𝗡𝗧Á𝗥𝗜𝗢       resumo-stock · entradas/saídas/ajustes
╭・𝗔𝗥𝗦𝗘𝗡𝗔𝗟          armas · munições · carregadores · droga
╭・𝗢𝗣𝗘𝗥𝗔𝗖̧𝗢̃𝗘𝗦         mapas · spots · planeamento · resultados
╭・𝗘𝗖𝗢𝗡𝗢𝗠𝗜𝗔 & 𝗧𝗢𝗣𝗦  meta · ofertas · prémios · tops-semanais
╭・𝗥𝗘𝗣𝗨𝗧𝗔𝗖̧𝗔̃𝗢        cemitério · clips
╭・𝗖𝗔𝗟𝗟𝗦             voice channels
╭・𝗚𝗘𝗥𝗔𝗟             chat · convívio · cor-org
```

Sync idempotente: nunca apaga, apenas renomeia/move/cria. Canais fora do template são listados no dry-run e ignorados.

## Documentação adicional

- [`docs/AUDIT.md`](docs/AUDIT.md) — auditoria do projecto pré-refactor
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — lista completa de mudanças e rationale

## Secrets

`.env`, `juri-490201-54e5053bd43a.json` (service account Google) e `logs/` estão em `.gitignore`. Nunca commitar secrets.
