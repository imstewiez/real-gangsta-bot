# Bot di Zona

Bot de gestão do bairro/grupo RP **Bot di Zona**. Gere onboarding, hierarquia, inventário (ledger), operações/saídas, tops semanais, cemitério e auditoria — tudo com o Discord como interface e PostgreSQL como fonte de verdade.

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
 5. Patrão di Zona   │ Chefe do Bairro     (isPatraoDiZona)
 6. Gangster Fodido  │ tier 3 (topo)       ┐
 7. Young Blood      │ tier 2 (mid)        ├─ Bairristas
 8. O Gunão          │ tier 1 (entrada)    ┘
```

**Invariante core**: qualquer tier (Gun/YB/GF) ⇒ role base **Bairristas**. Aplicada em onboarding, promoções e via job diário.

A ordem foi corrigida na Fase 2 (era inversa). Membros existentes em produção podem ser migrados via `/rg-fix-tiers modo:dry-run` → `apply` (swap YB↔O Gunão + DB tier + rename do canal individual).

## Fluxos

### Onboarding
1. Pessoa clica "Pedir Tag" no painel de entrada → modal (nome + alcunha).
2. Pedido fica pendente em `tag_requests`. Chefia aprova no canal `🏷️│tags`.
3. Aprovação:
   - adiciona `Bairristas` (base) + `Young Blood` (tier 1)
   - cria registo em `members` (tier=young_blood)
   - cria canal individual no GUETTO com overwrites para o próprio + Comando + Supervisão + Patrão di Zona
   - envia embed de boas-vindas com painel pessoal
   - reforça invariantes

### Promoção automática
- `25.000€` de material acumulado (entregas + vendas) → promove **O Gunão → Young Blood**
- `50.000€` → **Young Blood → Gangster Fodido**
- Acima disso é manual.

Env vars: `PROMO_GUNAO_TO_YOUNG_BLOOD` e `PROMO_YOUNG_BLOOD_TO_GANGSTER_FODIDO` (com fallback para os nomes antigos `PROMO_YOUNG_BLOOD_TO_GUNAO` / `PROMO_GUNAO_TO_GANGSTER_FODIDO`).

### Promoção a Oficial
- Detectada via `GuildMemberUpdate` (adição de role OG / Real Gangster).
- Canal individual é arquivado (`ARCHIVE_ON_PROMOTION=true`) — não apagado.

### Inventário (ledger)
Tipos de movimento: `saldo_inicial`, `entrega_bairrista`, `venda_bairrista`, `entrega_oficial`, `fornecimento_org`, `consumo_operacao`, `devolucao_operacao`, `ajuste_manual`, `perda_operacao`, `apreendido`, `craftado`. (Legacy: `entrega_morador`, `venda_morador` — aceites em leitura durante transição.)

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

### Disponibilidade diária (Fase 3)
- `/rg-availability-create` publica uma sessão com SelectMenu (até 8 slots × 3 estados: ✅/❌/⏰) + botões "Apareço/Talvez/Não dá" para todos os slots + Resumo + Atualizar.
- Cada voto é upsert na DB; a mensagem **edita-se em vez de spammar**.
- Job opcional `availability_auto_publish` (5min interval) age só na hora indicada por `AVAILABILITY_AUTO_PUBLISH_HOUR` se `AVAILABILITY_AUTO_PUBLISH_ENABLED=true`.
- Slots default: `20:30,21:30,22:30,23:30,00:30,01:30,02:30,03:30` (configurável via `AVAILABILITY_SLOTS`).
- 10 cabeçalhos rotativos com tom de bairro — sem cringe.

### Rádio (Fase 4)
- `/rg-radio` publica painel com **Principal** + **Parceria** e botões aleatória/set/swap/history/refresh.
- Geração aleatória entre `RADIO_RANDOM_MIN`/`MAX` (default 1000-9999) com anti-colisão.
- Histórico em `radio_history` com quem mudou e modo (manual/random).
- `/rg-radio-set`, `/rg-radio-random`, `/rg-radio-history` para CLI rápido.

### Sticky messages (Fase 5)
- 2 modos: `update` (edita a mesma mensagem) e `repost` (republica após N mensagens novas e/ou Y minutos).
- `/rg-sticky-set canal:#X source:radio:current modo:update` mantém o painel da rádio sempre visível.
- `availability:daily` e `radio:current` são source_keys built-in com renderers automáticos — qualquer mudança refresca a sticky.
- `/rg-sticky-list`, `/rg-sticky-remove`, `/rg-sticky-refresh`.

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
| `/rg-close-saida` | Comando | Fechar saída (fallback ao painel) |
| `/rg-meu-ponto` | Todos | O teu ponto na casa |
| `/rg-ranking` | Todos | Ranking dos Bairristas |
| `/rg-progresso` | Todos | Progresso para próximo tier |
| `/rg-minha-saida` | Todos | As tuas últimas saídas |
| `/rg-audit` | Comando | Logs de auditoria |
| `/rg-items` | Todos | Catálogo |
| `/rg-add-item` | Comando | Adicionar item |
| `/rg-sync-sheets` | Comando | Export para Sheets (opcional) |
| `/rg-kill` | Todos | Registar kill |
| `/rg-cemetery` | Todos | Leaderboard cemitério |
| `/rg-fix-tiers modo:[dry-run|apply]` | Comando | Migração da nova ordem de tiers (Fase 2) |
| `/rg-availability-create` | Chefia/Chefe Mor | Publica disponibilidade do dia |
| `/rg-availability-close` | Chefia/Chefe Mor | Fecha sessão (votos congelados) |
| `/rg-availability-summary` | Todos | Resumo detalhado por slot |
| `/rg-radio` | Todos | Publica painel da rádio |
| `/rg-radio-set tipo:.. valor:..` | Chefia | Define rádio manualmente |
| `/rg-radio-random tipo:..` | Chefia/Chefe Mor | Gera rádio aleatória |
| `/rg-radio-history` | Todos | Histórico de alterações |
| `/rg-sticky-set canal:.. source:.. modo:..` | Comando | Configura sticky |
| `/rg-sticky-remove` / `refresh` / `list` | Comando | Gestão de stickys |

## CLI scripts

```bash
# Bootstrap de stock inicial (ledger saldo_inicial)
npm run stock:bootstrap              # dry-run (default)
npm run stock:bootstrap:apply        # aplica (inclui --confirm)

# Sync de estrutura Discord (via slash command)
# /rg-sync-perms modo:dry-run       — verifica permissões
# /rg-sync-perms modo:apply         — aplica permissões
# /rg-sync-panels                   — republica painéis
```

## Painéis

| Painel | Canal | Funcionalidades |
|---|---|---|
| Entrada | ENTRADA | Pedir Tag |
| Bairrista | GUETTO | Registar material, histórico, totais, progresso, top semanal |
| Oficial | OFICIAIS | Registar material, operações, histórico |
| Chefia | COMANDO | Criar/fechar operações, adicionar participantes, material, stock, gerir materiais, tops, logs |
| Patrão di Zona | GUETTO | Listar bairristas, entregas/vendas, tops bairristas |

## Estrutura do Discord (template)

11 categorias bem identificadas, geridas declarativamente em `src/discord/structureTemplate.js`:

```
╭・𝗘𝗡𝗧𝗥𝗔𝗗𝗔          divulgação · entradas · tags · regras · info
╭・𝗖𝗢𝗠𝗔𝗡𝗗𝗢          comunicados · chefia · preços · logs · logs-bot
╭・𝗢𝗙𝗜𝗖𝗜𝗔𝗜𝗦          chat · disponibilidade · ausências · rádio · baú
╭・𝗚𝗨𝗘𝗧𝗧𝗢            patrao-di-zona · baú-casa · encomendas · material · canais individuais
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

> **Nota**: a auditoria inicial (Fase 1) sinalizou o ficheiro de credenciais como crítico. Verificámos: o `.gitignore` está bem configurado e o ficheiro **nunca foi pushed para git history** — está apenas no working directory local, como suposto. Se algum dia for commitado por engano, usa `git filter-repo --path bot/juri-490201-54e5053bd43a.json --invert-paths` (ou BFG) e revoga a key no GCP imediatamente.
