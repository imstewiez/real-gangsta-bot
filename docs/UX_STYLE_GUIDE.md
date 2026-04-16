# UX Style Guide — Firma RedWood

Copy guide canónica para tudo o que o utilizador vê no Discord. Válida para embeds, botões, modais, replies, audits, sticky messages, rankings.

> Regra zero: se partir uma das regras abaixo, **reescreve**. Não há excepções "por uma vez".

---

## 1. Identidade

- **Nome**: Firma RedWood. Nunca "RedWood" sozinho, nunca "the RedWood crew", nunca "a firma" como nome.
- **Voz**: de alguém da casa — directo, firme, útil, com peso. Não soa a polícia nem a sistema corporativo.
- **Tema**: bairro, guetto, zona, rua, movimento, peso, topo.
- **Assinatura**: `Firma RedWood` em todos os footers de embeds importantes. Variantes em `voice.SIGNATURES` (SHORT, HOUSE, STREET, MOVEMENT, TOP).

---

## 2. Língua

- **Português europeu sempre**. Nunca pt-BR.
- **Segunda pessoa singular**: "tu", "teu", "tens". Nunca "vossa", "Exmo.", "por favor".
- **Frases curtas**. Uma ideia por linha. Blocos gigantes matam leitura.

Exemplos:

| ❌ Não | ✅ Sim |
|---|---|
| "Por favor, submeta o seu pedido de tag." | "Pede a tua tag aqui." |
| "O sistema processou a sua operação com sucesso." | "Saída aberta." |
| "Obrigado pela sua entrega." | "Entrega guardada." |

---

## 3. Palavras proibidas

Listagem em `src/content/tone.js → FORBIDDEN`.

- **operação** → usa **saída**
- **utilizador / user / membro** → usa **bairrista** / **nome**
- **sistema** → usa **bot** / **firma** / **casa** conforme contexto
- **entidade** → reescreve inteiro
- **processado / processar** → usa **guardado / registar**
- **efetuado / submetido / validado** → usa **feito / enviado / confirmado**
- **por favor / obrigado** → corta fora
- **gestão** → OK em dashboard/sheet; evita em copy user-facing directo

---

## 4. Palavras e expressões preferidas

- saída · spot · material · peso · casa · guetto · zona · firma · topo · movimento · progresso
- Em vez de "membros ativos" → "bairristas na zona"
- Em vez de "realizar saída" → "puxar saída"
- Em vez de "efetuar entrega" → "registar entrega" / "trazer material"

---

## 5. Emojis

- **0 ou 1 por título**. Nunca dois em cascata.
- **0 ou 1 por botão**. Só quando ancoram (ex: 📦 em "Registar Material", ✅ em "Aprovar").
- Nunca decorar sem razão. Se o botão já diz "Rádio", não precisa de 📻 + 🎵 — escolhe um.
- **Sempre via `EMOJI.*`** de `src/content/emojis.js`. Zero literal em código.

Emojis canónicos principais:
- `EMOJI.MATERIAL` = 📦
- `EMOJI.LUCRO` = 💰
- `EMOJI.KILL` = 💀
- `EMOJI.SAIDA` = 🎯
- `EMOJI.CASA` = 🏠
- `EMOJI.TOPO` = 🏆
- `EMOJI.ALERTA` = ⚠️
- `EMOJI.OK` = ✅
- `EMOJI.ERRO` = ❌

---

## 6. Títulos

Regras:
- Curtos (≤ 40 chars).
- Fortes, sem enrolação.
- 0 ou 1 emoji à esquerda.
- Nunca pontuação final.

| ❌ | ✅ |
|---|---|
| "🎯 Painel de Operações — Centro de Comando" | "Centro de Comando" |
| "📊 Ver estatísticas da tua performance." | "A tua performance" |
| "Novo membro aprovado no sistema!" | "Novo Bairrista — tag aprovada" |

---

## 7. Descrições (embed body)

- Abre forte. Primeira linha diz o essencial.
- Usa blocos curtos (≤ 3 linhas) separados por espaço.
- Usa fields para dados estruturados, não paragrafos.
- Sem "clica no botão abaixo" — o utilizador vê o botão.

---

## 8. Botões

- Labels ≤ 20 chars.
- Imperativo directo: "Registar Material", não "Material Registration".
- Emoji consistente por acção. Se dois painéis diferentes têm "Ver Histórico", ambos usam o mesmo emoji.
- Styles:
  - **Success** (verde) — acção primária produtiva (Registar, Aprovar, Criar).
  - **Primary** (azul) — acção default (Ver, Consultar, Atualizar).
  - **Secondary** (cinza) — acção auxiliar (Histórico, Detalhes).
  - **Danger** (vermelho) — acção destrutiva (Fechar Saída, Negar).

---

## 9. Modais

- **Título** ≤ 45 chars. Contexto claro: "Registar Kill", "Fechar Saída #42".
- **Labels** claras. Inclui unidade se aplicável: "Quantidade (unidades)", "Data (YYYY-MM-DD)".
- **Placeholders** com exemplo real: "Ex: 10", "21:30", "Chico Navalhas · Los Vagos".
- **Descrições** só quando não óbvio. Curtas.

---

## 10. Feedbacks

### Sucessos
Formato: `${EMOJI.OK} ${título}` + corpo curto.
```
✅ Entrega guardada
15× AK registada. Peso da semana: 18k.
```

### Erros
Formato: `${EMOJI.ERRO} ${causa directa}` + cta quando aplicável.
```
❌ Esse nome não está na casa.
Pede tag primeiro em #entradas.
```

### Nunca:
- "Algo deu errado" → diz o quê.
- "Tente novamente mais tarde" → explica porquê se sabes.
- "Ocorreu um erro inesperado" → isto não é Windows 95.

---

## 11. Dados no corpo do embed

Sempre que houver números, mostra-os. Não descrevas em prosa o que uma field resolve em segundos.

Patterns reutilizáveis em `src/shared/embedBuilders.js`:
- `deltaField(label, current, previous)` — mostra valor + seta ↑/↓ + %
- `progressBar(current, max)` — barra visual
- `rankBadge(position)` — 🥇🥈🥉 / #N
- `streakBadge(count)` — 🔥/⚡/💀 conforme streak

---

## 12. Onde viver cada coisa

| Domínio | Ficheiro |
|---|---|
| Voz, glossary, roles | `src/content/voice.js` |
| Emojis | `src/content/emojis.js` |
| Footers | `src/content/footers.js` |
| Erros | `src/content/errors.js` |
| Sucessos | `src/content/success.js` |
| Painéis (título/desc/botões) | `src/content/panels.js` |
| Labels de botões por domínio | `src/content/buttons.js` |
| Modais (título/labels/placeholders) | `src/content/modals.js` |
| Copy de onboarding | `src/content/onboarding.js` |
| Copy de saídas | `src/content/saidas.js` |
| Copy de kills | `src/content/kills.js` |
| Copy de ranking | `src/content/rankings.js` |
| Copy de disponibilidade | `src/content/availability.js` |
| Copy de rádio | `src/content/radio.js` |
| Copy de sticky | `src/content/sticky.js` |
| Stats do bairrista | `src/content/memberStats.js` |

**Regra de ouro**: se há uma string user-facing num handler, ela pertence a um destes ficheiros. Nunca inline.

---

## 13. Checks rápidos

Antes de fechar um PR de UX:

- [ ] `grep -rn "operação" src/content src/panels src/onboarding` → zero
- [ ] `grep -rn "new EmbedBuilder" src/` → só em embedBuilders.js / wrappers internos
- [ ] Todos os customIds dos botões mantêm-se (compat)
- [ ] Footer "Firma RedWood" em embeds importantes
- [ ] Zero emoji hardcoded fora de `emojis.js`
- [ ] Copy de sucesso segue `${EMOJI.OK} Título curto` + corpo
- [ ] Copy de erro segue `${EMOJI.ERRO} Causa directa` + cta
