# Style Guide — Firma RedWood

Guia obrigatório para qualquer texto visível ao utilizador final.
A camada `src/content/` é canónica — strings soltas em handlers/engines
violam este guide.

---

## 1. Voz & Tom

- **Português europeu (pt-PT) sempre.** Nunca pt-BR.
- **Directo, firme, bairro.** Nunca corporate, nunca infantil, nunca cringe.
- **Frases curtas.** Uma ideia por linha.
- **Gíria controlada.** Usada quando ancora — não como adorno.

### Termos preferidos
`casa` · `firma` · `rua` · `zona` · `guetto` · `nome` · `movimento`
`material` · `saída` · `spot` · `presença` · `peso` · `topo`

### Termos a evitar
`sistema` · `utilizador` · `processado` · `entidade` · `operação`
`sucesso` (em "concluído com sucesso") · `erro interno`

### Exemplos
| ❌ | ✅ |
| --- | --- |
| Operação concluída com sucesso. | Movimento fechado. |
| O utilizador foi processado. | Nome registado. |
| Não tens permissão para executar esta acção. | Ainda não tens acesso a isto. |
| Participante adicionado à equipa. | Entrou no movimento. |
| Erro ao gravar na base de dados. | A DB está fora. Nada foi guardado. |

---

## 2. Assinatura

**Marca única:** `Firma RedWood` — nunca "RedWood Firma", nunca "Firma Redwood",
nunca com variações de capitalização.

**Footer:** todos os embeds importantes usam `footer('SHORT')` (`— Firma RedWood`)
ou uma das variantes curtas:

```js
SIGNATURES.SHORT     // — Firma RedWood
SIGNATURES.HOUSE     // — Firma RedWood · casa
SIGNATURES.STREET    // — Firma RedWood · rua
SIGNATURES.MOVEMENT  // — Firma RedWood · movimento
SIGNATURES.TOP       // — Firma RedWood · topo
```

**Escolha da variante:** contextualiza. Painéis domésticos = `HOUSE`;
resultados de saídas / audit = `MOVEMENT`; rankings = `TOP`.

---

## 3. Emojis

### Regras duras
- **Máximo 1 emoji por título.**
- **Nunca** emojis a decorar final de linha.
- **Nunca** cadeias tipo `✅✅🔥`. Cada emoji tem significado.
- Usa sempre o alias da paleta (`EMOJI.SAIDA`, `EMOJI.MATERIAL`), nunca o
  codepoint bruto.

### Paleta
A paleta completa vive em `src/content/emojis.js`. Cada função tem um único
emoji canónico — substitui-se num sítio só se for preciso afinar.

---

## 4. Estrutura de camada de conteúdo

```
src/content/
  voice.js       — glossário, status, roles, tipos
  emojis.js      — paleta semântica
  footers.js     — helpers de assinatura
  errors.js      — mensagens de erro (curtas)
  success.js     — confirmações (sem drama)
  panels.js      — copy dos 5 painéis
  onboarding.js  — entrada, boas-vindas, tags
  saidas.js      — saídas, wizard, labels de publisher
  stats.js       — select de estatísticas
  kills.js       — copy do domínio kills
  availability.js— presença / sessões
  radio.js       — frequências
  inventory.js   — stock, catálogo
  rankings.js    — topos
  sticky.js      — stickys
  index.js       — re-exporta tudo
```

### Import padrão
```js
const { SAIDAS, EMOJI, footer, ERRORS, SUCCESS } = require('../content');
```

Nunca importar um domínio específico se `require('../content')` dá o mesmo.

---

## 5. Embeds

- Todos os embeds passam por `brandEmbed(variant)` de `shared/embedBuilders`.
- Títulos ≤ 60 caracteres, um emoji no início.
- Descrições: 2–4 linhas máximo no corpo principal.
- Campos: label curta, valor conciso. `inline: true` para chunks de 3.

### Exemplo
```js
const embed = brandEmbed('MOVEMENT')
  .setTitle(`${EMOJI.SAIDA} Saída #${id} — ${SAIDA_TYPE[type]}`)
  .addFields(
    { name: 'Spot', value: spot, inline: true },
    { name: 'Líder', value: leader, inline: true },
    { name: 'Resultado', value: RESULT_LABEL[result], inline: true },
  );
```

---

## 6. Botões & Labels

- ≤ 20 caracteres na label. Se não cabe, corta a palavra menos essencial.
- Verbo + objecto: "Criar Saída", "Ver Stock", "Fornecer a Nome".
- Emoji só quando ancora a acção (`⚔️` criar, `🏁` fechar, `📦` material).
- ButtonStyle: Success = acção positiva (criar), Danger = destrutiva
  (fechar, apagar), Primary = navegação, Secondary = leitura.

---

## 7. Modals

- Máximo 5 campos (limite Discord).
- Labels curtas: "Kills" não "Número de kills obtidos".
- Placeholders dão exemplos reais: `Ex: 21:30`, `Ex: 4321`.
- `TextInputStyle.Paragraph` só para campo "Notas" ou equivalente.

---

## 8. Erros

- Nunca começar por "Erro:". O emoji e a frase dizem tudo.
- Dá ao utilizador o que fazer a seguir quando possível.
- Curto. ≤ 80 caracteres no corpo.

| Cenário | Texto |
| --- | --- |
| DB offline | `⛔ A DB está fora. Nada foi guardado.` |
| Duplicado | `⏱️ Calma — já tinhas feito isso.` |
| Sem permissão | `🚫 Ainda não tens acesso a isto.` |
| Sessão expirada | `⏳ Sessão expirada — começa de novo.` |

Todos disponíveis via `ERRORS.X()` em `content/errors.js`.

---

## 9. Confirmações

- Voz passiva curta: "Material registado." não "O material foi registado com sucesso."
- Nada de "✅ Sucesso!". O `EMOJI.OK` já diz tudo.
- Dá contexto mínimo, não um relatório: `✅ Entrou no movimento.` basta.

Todos disponíveis via `SUCCESS.X()` em `content/success.js`.

---

## 10. Regra final

**Se hesitares, escolhe a versão mais curta.**
Se a versão mais curta perde significado, reescreve com outras palavras.
Adicionar texto é fácil — tirar é que arruma.

---

## 11. Layout Discord — congelado

O layout do servidor (categorias, canais, posições, nomes, emojis, roles) é
**imutável do ponto de vista do bot**. Está capturado em
`config/discord-layout.lock.json` via `scripts/manual/captureLayout.js`.

O bot NÃO:
- renomeia categorias / canais / roles globalmente
- move canais entre categorias
- cria canais globais novos
- reordena categorias ou canais
- força nomes "canónicos" de nada

O bot AINDA:
- cria o canal individual de morador em onboarding
- renomeia esse canal pessoal quando o membro é promovido
- aplica permissões em categorias e canais conhecidos (segurança)
- cria o role `Pendente` se não existir (onboarding depende)

Para auditar divergências contra o lock: `/rg-layout-check` (nunca altera).

— Firma RedWood
