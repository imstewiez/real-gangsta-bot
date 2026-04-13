# Real Gangsta

Bot de gestao de bairro/grupo RP para Discord. Focado em gestao de moradores, inventario de material, operacoes noturnas e rankings semanais.

## Stack

- **Runtime**: Node.js >= 18
- **Framework**: discord.js v14
- **Database**: PostgreSQL
- **Deploy**: Railway

## Configuracao

1. Copia `.env.example` para `.env` e preenche todas as variaveis
2. `npm install`
3. `npm run db:migrate`
4. `npm start`

### Variaveis de Ambiente Obrigatorias

| Variavel | Descricao |
|----------|-----------|
| `DISCORD_BOT_TOKEN` | Token do bot Discord |
| `DISCORD_GUILD_ID` | ID do servidor Discord |
| `DATABASE_URL` | Connection string PostgreSQL |

### Role IDs

| Variavel | Descricao |
|----------|-----------|
| `CHEFIA_ROLE_ID` | Role de Chefia (acesso total) |
| `CHEFE_MORADORES_ROLE_ID` | Role de Chefe de Moradores |
| `OFICIAL_ROLE_ID` | Role de Oficial |
| `MORADOR_ROLE_ID` | Role de Morador |

### Channel/Category IDs

| Variavel | Descricao |
|----------|-----------|
| `MORADOR_TOPICOS_CATEGORY_ID` | Categoria para canais individuais de moradores |
| `MORADOR_ARQUIVO_CATEGORY_ID` | Categoria para canais arquivados |
| `AUDIT_LOG_CHANNEL_ID` | Canal de logs de auditoria |
| `WEEKLY_TOP_CHANNEL_ID` | Canal para tops semanais |
| `PANEL_MORADORES_CHANNEL_ID` | Canal do painel de moradores |
| `PANEL_OFICIAIS_CHANNEL_ID` | Canal do painel de oficiais |
| `PANEL_CHEFIA_CHANNEL_ID` | Canal do painel de chefia |
| `PANEL_CHEFE_MORADORES_CHANNEL_ID` | Canal do painel do chefe de moradores |

## Arquitetura

```
src/
  index.js              # Entry point, routing, boot
  config.js             # Configuracao centralizada
  db.js                 # Pool PostgreSQL
  dbMigrate.js          # Migracoes
  slashCommands.js      # Definicao de slash commands
  panelBootstrap.js     # Sistema de paineis
  onboarding/           # Onboarding de moradores + canais
  members/              # Gestao de membros + promocoes
  inventory/            # Inventario, catalogo, movimentos
  operations/           # Saidas/operacoes noturnas
  rankings/             # Tops semanais
  panels/               # Definicao dos 4 paineis Discord
  permissions/          # Sistema de permissoes por role
  audit/                # Auditoria
  jobs/                 # Background jobs (scheduler)
  repositories/         # Camada de acesso a dados
  shared/               # Helpers partilhados
  lib/                  # Idempotencia, metricas
  web/                  # Health endpoints
```

## Modulos Principais

### Onboarding
Quando um utilizador recebe a role de **Morador**, o bot:
- Cria um canal individual em "Moradia - Topicos"
- Envia mensagem de boas-vindas com botoes
- Regista o membro na base de dados

Quando um morador e promovido a **Oficial**:
- O canal e arquivado (configuravel: `ARCHIVE_ON_PROMOTION`)
- O acesso do membro e removido
- O historico e preservado

### Inventario
Sistema de movimentos auditavel:
- `entrega_morador` / `venda_morador` / `entrega_oficial`
- `fornecimento_org` / `consumo_operacao` / `devolucao_operacao`
- `ajuste_manual` / `perda_operacao` / `apreendido` / `craftado`

Stock calculado automaticamente a partir dos movimentos.

### Operacoes
Gestao completa de saidas noturnas:
- Criar / iniciar / fechar / cancelar
- Participantes com estado (morreu, sobreviveu, devolveu material)
- Material fornecido vs devolvido vs perdido
- Resultado operacional (fight, inimigos, etc.)

### Rankings
Tops semanais automaticos baseados em:
- Entregas de material
- Vendas ao grupo
- Participacao em operacoes
- Valor ponderado por item

## Slash Commands

| Comando | Descricao |
|---------|-----------|
| `/rg-setup` | Configura paineis |
| `/rg-sync-panels` | Republica paineis |
| `/rg-stock` | Ver stock atual |
| `/rg-member` | Ficha de membro |
| `/rg-top-week` | Top semanal |
| `/rg-create-operation` | Criar operacao |
| `/rg-close-operation` | Fechar operacao |
| `/rg-audit` | Ver logs de auditoria |
| `/rg-items` | Catalogo de itens |
| `/rg-add-item` | Adicionar item ao catalogo |

## Paineis Discord

| Painel | Destinatarios | Funcionalidades |
|--------|---------------|-----------------|
| Morador | Moradores | Registar entregas/vendas, ver historico/totais |
| Oficial | Oficiais | Registar entregas, ver operacoes, historico |
| Chefia | Chefia | Criar/fechar operacoes, stock, tops, logs |
| Chefe de Moradores | Chefe Moradores | Listar moradores, ver entregas/vendas/tops |

## Testes

```bash
npm test
```

## Deploy (Railway)

O ficheiro `railway.toml` esta configurado. Basta conectar o repositorio ao Railway e definir as variaveis de ambiente.
