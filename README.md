# Bot di Zona — Firma RedWood

Bot de gestão do bairro **Gangsta di Zona / Firma RedWood**. Gere onboarding, hierarquia, inventário (ledger), saídas/PvP, tops semanais, cemitério e auditoria — tudo com o Discord como interface e PostgreSQL como fonte de verdade.

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

## Hierarquia

```
 1. Manda-Chuva      │ Comando Total       (isCommand, isChefia)
 2. Kingpin          │
 3. OG               │ Supervisão          (isSupervisor, isOficial)
 4. Real Gangster    │
 5. Patrão di Zona   │ Chefe do Bairro     (isPatraoDiZona)
 6. Gangster Fodido  │ tier 3 (topo)       ┐
 7. O Gunão          │ tier 2 (mid)        ├─ Bairristas
 8. Young Blood      │ tier 1 (entrada)    ┘
```

**Invariante core**: qualquer tier (YB/Gunão/GF) ⇒ role base **Bairristas**. Aplicada em onboarding, promoções e via job diário.

## Fluxos

### Onboarding
1. Pessoa clica "Dar a Cara" no painel de entrada → modal (nome + alcunha).
2. Pedido fica pendente em `tag_requests`. Chefia aprova no canal `🏷️│tags`.
3. Aprovação:
   - adiciona `Bairristas` (base) + `Young Blood` (tier 1)
   - cria registo em `members` (tier=young_blood)
   - cria canal individual no GUETTO
   - envia embed de boas-vindas com painel pessoal

### Promoção automática
- **25.000 itens** de material acumulado (entregas + vendas) → promove **Young Blood → O Gunão**
- **50.000 itens** → **O Gunão → Gangster Fodido**
- Acima disso é manual (chefia atribui role via Discord).

Env vars: `PROMO_YOUNG_BLOOD_TO_GUNAO` e `PROMO_GUNAO_TO_GANGSTER_FODIDO`.

### Inventário (ledger)
Tipos de movimento: `saldo_inicial`, `entrega_bairrista`, `venda_bairrista`, `entrega_oficial`, `fornecimento_org`, `consumo_saida`, `devolucao_saida`, `ajuste_manual`, `perda_saida`, `apreendido`, `craftado`. (Legacy: `entrega_morador`, `venda_morador` — aceites em leitura.)

Stock é sempre calculado a partir do ledger — nunca sobreposto.

### Saídas / PvP
Fluxo completo:
1. **Criar** — tipo (select), spot (select), data/hora/notas (modal)
2. **Inscrição** — participante escolhe Caracterizado (com arma) ou Trabalhador
3. **Fechar** → entra em `em_liquidacao` (resultado guardado, scoring pendente)
4. **Liquidação** — bot pinga todos com @, cada participante preenche: sobreviveu? kills? arma devolvida?
5. **Finalizar** → scoring com dados reais, MVP, stats, 3 embeds publicados
6. **Armas** — staff confirma devoluções de arma da org

Cadeia de custódia por participante. Material reconciliado automaticamente.

### Cemitério
- `/kill` → modal de kill. Auto-publica no canal cemitério.

### Tops semanais
- Publicação automática via scheduler. Hybrid score: contribuição (40%) + performance (40%) + fiabilidade (20%).

### Disponibilidade diária
- Sessão com SelectMenu (slots × estados) + botões de atalho.
- Cada voto edita a mensagem — zero spam.

### Rádio
- Painel com Principal + Parceria. Botões: aleatória/set/swap/history/refresh.

## Slash commands (10)

Filosofia: **painéis são a via principal**. Slash commands são atalhos rápidos.

### User-facing
| Comando | Descrição |
|---|---|
| `/versao` | Estado do bot |
| `/stock` | Stock actual |
| `/catalogo` | Catálogo de materiais com preços |
| `/ficha` | Ficha de um membro |
| `/movimento` | Cockpit pessoal com drill-downs |
| `/ranking` | Rankings (semanal, mensal, histórico) |
| `/saidas` | As tuas últimas saídas |
| `/kill` | Registar uma kill |

### Staff
| Comando | Descrição |
|---|---|
| `/audit` | Logs de auditoria |
| `/transfer` | Mover material entre casas |

## Painéis

| Painel | Funcionalidades |
|---|---|
| **Entrada** | Dar a Cara (onboarding) |
| **Bairrista** | Registar Material, Movimento no Bairro, Ranking, Encomendas |
| **Oficial** | Sessões (criar/ver/stats), Registar Material, O meu Movimento, Ranking |
| **Chefia** | Sessões, Stock, Gestão (rádio/stickys), Dados (tops/logs) |
| **Patrão di Zona** | Listar Bairristas, Entregas, Vendas, Tops |

## Secrets

`.env` e credenciais Google estão em `.gitignore`. Nunca commitar secrets.

— **Firma RedWood**
