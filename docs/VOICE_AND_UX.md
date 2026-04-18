# Voice & UX Writing System — Firma RedWood

Canonical guide para toda a copy user-facing do bot. Se escreveres uma
string nova, passa aqui primeiro. Se vais mudar uma existente, verifica
que continuas alinhado.

Ficheiros de suporte em código:
- `src/content/voice.js` — brand, signatures, status labels, glossary
- `src/content/tone.js` — palavras proibidas + exemplos canónicos
- `src/content/errors.js`, `success.js` — templates atómicos
- `src/content/panels.js`, `bairristas.js`, `saidas.js`, etc. — copy por domínio

---

## 1. Princípios duros

1. **pt-PT sempre.** Nunca pt-BR. Nunca inglês no user-facing (excepto
   termos aceites como "spot", "MVP", "K/D", "streak").
2. **Tu, sempre.** Nunca "utilizador", "o senhor", "por favor".
3. **Uma ideia por linha.** Blocos densos matam UX em Discord mobile.
4. **Dados > flavor.** Se tens o número, mostra-o. Flavor text vazio custa leitura.
5. **Identidade sem dano.** RP mantém-se em painéis user-facing. Em staff e erros,
   clareza manda. Nunca sacrificar comprensibilidade por estética.

---

## 2. Three-tier voice system

A voz do bot adapta-se à audiência. **Mesma identidade**, densidade diferente.

### Tier 1 — User-facing (painéis de entrada, canal pessoal, DMs)

Audiência: newcomers, bairristas, membros em uso RP.
- **Copy cheia.** Frase dupla aforística, metáforas de rua permitidas.
- **Tom:** firme, bairro, imersivo.
- **Exemplo bom:** _"Trás pedra ao bairro. O bairro devolve-te nome."_
- **Exemplo mau:** _"O seu pedido foi submetido com sucesso."_ (corporate)

### Tier 2 — Staff/admin-facing (chefia, patrão di zona, oficial staff actions)

Audiência: quem toma decisões operacionais em tempo real.
- **Copy densa mas curta.** Uma linha por acção, números à frente.
- **Tom:** firme, operacional, zero flourish no botão.
- **Flavor OK** no título/descrição do painel; **zero flavor** em botões e feedback.
- **Exemplo bom:** botão _"Abrir Saída"_. Embed _"Saída #42 aberta — Grove · 21:30 · 3 inscritos."_
- **Exemplo mau:** botão _"Abrir Novo Movimento de Campanha"_. Embed _"A sessão foi iniciada com êxito."_

### Tier 3 — System (errors, success, confirmations, loading)

Audiência: qualquer um, em momento de fricção.
- **Copy atómica.** 1 linha. Emoji semântico + frase.
- **Tom:** directo, sem drama, accionável.
- **Erros dizem:** o que falhou + o que fazer a seguir.
- **Success dizem:** o quê + (opcional) número.
- **Exemplo bom:** _"✅ Material guardado. +15 no peso da semana."_
- **Exemplo mau:** _"Operação processada com sucesso pelo sistema!"_ (corporate + vago)

---

## 3. Terminologia canónica

Termos aceites; **não usar sinónimos em user-facing**.

| Conceito | Termo canónico | **Não** usar |
|---|---|---|
| Novo membro em onboarding | Newcomer / Pendente | "utilizador", "candidato" |
| Membro base | Bairrista | "morador" (legacy removido), "user", "membro do grupo" |
| Chefe do bairro | Patrão di Zona | "chefe dos moradores" (legacy) |
| Supervisão | Oficial (OG, Real Gangster) | "moderador", "staff sénior" |
| Comando | Chefia (Manda-Chuva, Kingpin) | "admin", "dono" |
| Organização | Firma / casa / bairro | "organização", "empresa", "grupo" |
| Missão PvP | Saída | "operação", "missão", "sessão" |
| Movimento inventário | Entrega / Venda | "transacção", "submissão" |
| Painel visual | Painel | "dashboard", "UI" |
| Botão de acção | verbo imperativo | "Clicar para submeter" (gerúndio) |

### Labels de botões — padrão

- **Verbo + objecto, ≤ 20 chars.** Imperativo, não gerúndio.
- **Mesmo verbo para mesma acção** em todos os painéis.
- Canonizações recentes:
  - `Abrir Saída` (não "Nova Sessão", não "Criar Movimento")
  - `Ver Saídas` (não "Sessões Activas")
  - `Listar Bairristas` (não "Lista de Nomes")
  - `Registar Material` (único termo — bairrista, oficial, saída)
  - `Fechar Saída` (não "Encerrar Sessão")

### Status labels

Do código (enum DB) → user-facing:

| Enum | Label (pt-PT) | Emoji |
|---|---|---|
| `aberta` | Aberta | ✅ |
| `em_preparacao` | A preparar | ⏳ |
| `em_curso` | Na rua | 🔥 |
| `em_liquidacao` | Em liquidação | ⚖️ |
| `concluida` | Fechada | 🏁 |
| `cancelada` | Cancelada | ⛔ |

### Resultados de saída

| Enum | Label | Emoji |
|---|---|---|
| `vitoria` | Vitória | 🏆 |
| `derrota` | Derrota | ☠️ |
| `empate` | Empate | ⚖️ |
| `sem_conflito` | Sem conflito | ℹ️ |
| `abortada` | Abortada | ⚠️ |

**Nunca** mostrar ao user `win`, `loss`, `draw`. Esses valores existem
apenas em DB históricos pré-2026-04.

---

## 4. Padrões de embed

### Título
- ≤ 45 chars
- Emoji no início **só** se ancorar significado (não decorativo)
- Lead com a entidade, não com a acção: _"Saída #42 — Vitória"_, não _"Fechada: Saída #42"_

### Descrição
- Máx 2–3 parágrafos
- Frase dupla aforística só em painéis user-facing (Tier 1)
- Em staff/results: frases curtas de facto, sem filosofia

### Fields
- Máx 6 por embed (scan-friendly)
- Labels consistentes (`Spot`, `Líder`, `Inimigo` — capitalização única)
- `inline: true` para 2-3 colunas de números; `inline: false` para texto longo

### Footer
- `— Firma RedWood` via `voice.SIGNATURES.SHORT`
- Variantes: `SHORT`, `HOUSE`, `STREET`, `MOVEMENT`, `TOP` (aplicar por domínio)

---

## 5. Erros e sucessos

### Errors (`src/content/errors.js`)

- Começar pelo emoji (⛔ / ⚠️ / 🚫). **Nunca** pela palavra "Erro:"
- ≤ 1 linha idealmente
- Dizer o que falhou **e** o próximo passo quando aplicável
- Exposição de detalhes técnicos só via `correlationId` para debug — nunca
  stack trace ao user

**Estrutura canónica:**
```
<emoji> <o que falhou>. <o que fazer a seguir ou ref debug>.
```

Exemplos:
- ✅ `⛔ Essa saída não existe.`
- ✅ `⚠️ Só há 3 de AK — pediste 10.`
- ❌ `Erro: Error: SPOT_COOLDOWN — ...` (raw exposure)
- ❌ `Falha no sistema. Contacte o administrador.` (vago + corporate)

### Success (`src/content/success.js`)

- Emoji `✅` ou específico do domínio (`📦`, `🏁`, etc.)
- Verbo no particípio passivo: _"registado"_, _"fechado"_, _"aprovado"_
- Incluir dado útil se fizer sentido (peso da semana, posição no ranking)

**Estrutura:**
```
<emoji> <verbo passivo>. [<dado opcional>.]
```

Exemplos:
- ✅ `✅ Material guardado. +15 no peso da semana.`
- ✅ `🏁 Saída #42 fechada.`
- ❌ `Operação executada com sucesso.` (corporate)

---

## 6. Palavras proibidas

Ver `src/content/tone.js` → `FORBIDDEN`. Resumo:

| Banida | Substituir por |
|---|---|
| operação | saída |
| utilizador | bairrista / nome |
| sistema | bot / firma / casa |
| processado | guardado / registado |
| submetido | enviado |
| validado | confirmado / aprovado |
| efectuado | feito / registado |
| por favor | — (remover) |
| obrigado | — (remover) |
| reportado | avisado / registado |

---

## 7. Placeholders de modal

- **Prefixar com "Ex:"** quando é exemplo concreto. Não usar ">" ou "e.g.".
- Usar valores realistas para o domínio (nomes RP, items do catálogo).
- ≤ 45 chars para Discord não truncar em mobile.

Exemplos bons:
- `Ex: Chico Navalhas`
- `Ex: 10`
- `Ex: Grove, Motel, Sandy`

---

## 8. Onde mexer

| O que vais mudar | Ficheiro |
|---|---|
| Título de painel | `src/content/panels.js` |
| Label de botão | `src/content/buttons.js` |
| Field / placeholder de modal | `src/content/modals.js` |
| Mensagem de erro | `src/content/errors.js` |
| Mensagem de sucesso | `src/content/success.js` |
| Strings de onboarding | `src/content/onboarding.js` |
| Strings de domínio X | `src/content/<dominio>.js` |
| Status label novo | `src/content/voice.js` → `STATUS` |
| Role/tier label | `src/content/voice.js` → `ROLE` |
| Adicionar termo banido | `src/content/tone.js` → `FORBIDDEN` |

**Regra:** string que aparece ao user vive em `src/content/*`. Se encontrares
uma embebida num handler, move e deixa o handler mais fino. Excepção:
strings técnicas de debug/log (não user-facing).

---

## 9. Checklist de review

Antes de merge, para qualquer PR que toque em copy:

- [ ] Tier correcto (user / staff / system)?
- [ ] Palavras proibidas? (`grep` em `tone.js FORBIDDEN`)
- [ ] Termo canonical? (verificar secção 3)
- [ ] Emoji semântico ou decorativo?
- [ ] Staff label ≤ 20 chars?
- [ ] Error diz o próximo passo?
- [ ] Success mostra dado útil?
- [ ] Copy duplicada em outro sítio?

---

## 10. Revisão periódica

Este documento deve ser revisto quando:
- Novo domínio é adicionado ao bot (nova secção em content/)
- Audit externa aponta drift de tone
- Feedback de staff indica atrito em uso diário

Última revisão: 2026-04-18.
