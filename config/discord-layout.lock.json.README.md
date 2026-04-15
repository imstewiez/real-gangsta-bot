# Discord Layout Lock

Este directório guarda o **snapshot imutável** do layout do servidor Discord.

## Como criar / actualizar

Corre **uma vez** (com o `.env` preenchido):

```bash
cd bot
node scripts/manual/captureLayout.js
```

Cria (ou sobrescreve) `config/discord-layout.lock.json` com:
- Todas as categorias (id, nome, posição, overwrites)
- Todos os canais (id, nome, tipo, parentId, posição, topic, overwrites)
- Todos os roles (id, nome, cor, posição, permissões)

## Quem lê

- **`/rg-layout-check`** — compara o estado actual do Discord contra este lock
  e reporta o que mudou. **Nunca altera nada.**

## Quando actualizar

Só quando **intencionalmente** mudares o layout. Corres o script outra vez e
o lock passa a refletir o novo estado. Fora disso o ficheiro não muda.

## O bot nunca altera o layout

Desde este ponto em diante, o bot **não** renomeia categorias/canais/roles
globalmente, **não** move canais entre categorias, e **não** cria canais
globais. O único layout que o bot controla é:

- Canal individual de morador — criado no onboarding, renomeado na
  promoção (contextual ao ciclo de vida do membro, não é layout global).
- Permissões das categorias e canais conhecidos — aplicadas via
  `/rg-sync-perms` como garantia de segurança (não tocam em nomes/posições).
