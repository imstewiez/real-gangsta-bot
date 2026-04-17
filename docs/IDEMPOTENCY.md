# Idempotência e Race Conditions

Documentação das garantias de idempotência cross-handler e riscos de race
conditions conhecidos. Usar em PR review — se um handler novo não se
enquadra aqui, pára e pensa.

---

## Regra geral do projecto

**Single-instance enforçado**: `acquireInstanceLockWithRetry(90_000)` no
bootstrap garante que apenas um processo corre de cada vez. Preempção por
heartbeat desliga instância antiga e antiga faz shutdown controlado.

Isto elimina grande parte das races distribuídas. **O que sobra são races
intra-processo** — event loop do Node reordenando promises concorrentes.

---

## Mapa por domínio

### Onboarding (`src/onboarding/onboardingEngine.js`)

**Race potencial**: user aprova tag + `role_invariants` job corre em
paralelo.

- `processApproval` faz:
  1. Add role `BAIRRISTAS_BASE`
  2. Add role `YOUNG_BLOOD`
  3. `ensureInvariants(guildMember)` — sanity-check imediato
- Job `role_invariants` (diário): reconcilia drift.

**Garantia**: `ensureInvariants` corre pós-add-roles no mesmo event tick.
Discord roles API é transactional (cada add/remove é commit individual).
Se `role_invariants` apanhasse o membro *entre* os dois adds, ia corrigir
(adicionar o que faltasse). Resultado: semanticamente convergente.

**Risco residual**: se `role_invariants` estiver a correr e user sai do
server no meio, `offboardingEngine` apanha `GuildMemberRemove` event e
limpa; ambos os paths convergem para member marcado inativo.

### Promoções (`src/members/autoPromotionEngine.js`)

**Race potencial**: user regista 2 movimentos de material em rápida
sucessão. Cada um chama `checkAndPromote`.

- Ambos fazem `getMemberMaterialQty` → podem ler mesma qty pré-promoção.
- Ambos fazem SELECT + UPDATE — SQL é row-locked via `SELECT ... FOR
  UPDATE`? **NÃO**. Este é um risco conhecido.

**Mitigação actual**: primeiro que chegar a `memberRepo.promote()` efectiva
a subida; segundo tenta re-promover ao mesmo tier — UPSERT no tier não
parte, mas gera 2 eventos `member.promoted` (audit spam).

**TODO** (tech-debt): adicionar advisory lock per-discord-id em
`checkAndPromote`. Ver `docs/TECH_DEBT.md`.

### Inventory movements (`src/inventory/inventoryEngine.js`)

**Concorrência é OK por design**:
- Cada `recordMovement` é um INSERT autónomo. Sem UPDATE cumulativo.
- Balance calculado sempre via SUM() da tabela — leitura sempre reflecte
  todos os inserts commitados.
- CHECK constraints bloqueiam movement_types inválidos (incluindo legacy
  pós-migration 027).

**Risco residual**: `notifyMovement` e `notifyBairristaMovement` são
fire-and-forget. Se o Discord API devolver rate limit, a notificação
perde-se mas o ledger está seguro.

### Saídas (`src/saidas/saidaEngine.js`)

**Race mais delicada**: state machine `em_preparacao → aberta →
em_liquidacao → fechada`.

**Garantia actual**:
- Transições protegidas por CHECK constraint `saida_state_valid` na DB
  (migration 025).
- Handler usa `UPDATE ... WHERE state = 'expected_from' RETURNING *` —
  se devolve 0 rows, a transição foi duplicada; handler aborta.

Este padrão elimina grande parte do risco. **Excepção**: `closeOperation`
actualiza múltiplos participantes em sequência. Se bot crash no meio,
alguns ficam settled e outros pendentes; workflow na DB permite retoma
via re-fecho (idempotente).

### Retention job

**Totalmente idempotente**: DELETE WHERE timestamp < threshold — se outra
coisa estiver a escrever simultaneamente, o DELETE ignora as novas rows
(não satisfazem o WHERE).

### Sticky messages (`src/sticky/stickyEngine.js`)

**Race potencial**: `runTimeBasedRefresh` e `onMessageCreate counter`
disparam em paralelo.

- Ambos usam `repostIfDue(channel, stickyRow)`.
- Protegido por `UPDATE sticky_messages SET last_message_id = $new WHERE
  id = $id AND last_message_id = $old` — se já foi re-postado, segundo
  handler vê mismatch e aborta.

---

## Padrões seguros

1. **SELECT + UPDATE de row**: usar `UPDATE ... WHERE ... RETURNING *` com
   precondição no WHERE. Se devolve 0 rows, alguém já mudou — abort.
2. **Balance/aggregados**: nunca cachear. Sempre SUM() directo. Tabela
   ledger cresce monotonicamente.
3. **Fire-and-forget para Discord**: rate limits são rotina, nunca fazer
   promise chain que bloqueie DB em função de Discord API.
4. **Unique indexes**: usar para prevenir duplicados que possam vir de
   retries (ex: `availability_sessions (channel_id, date)`).
5. **Event bus subscribers**: `emitAsync().catch()` — subscriber falhar
   nunca parte o caller. Subscriber deve ser idempotente nos seus
   side-effects.

---

## Padrões a evitar

1. **Read-compute-write sem lock**: se 2 transações concorrentes podem
   computar baseado no mesmo snapshot, use `SELECT FOR UPDATE` ou o
   `UPDATE ... WHERE precondition` acima.
2. **Dependência de ordem de eventos**: event bus é fire-and-forget em
   paralelo. Não pode assumir que subscriber A corre antes de subscriber
   B.
3. **Throttling baseado em memória**: `rateLimiter.js` é in-memory; ok
   para single-instance, mas nunca depender dele para correcção de dados
   (só UX).

---

## Backlog de hardening

Ver `docs/TECH_DEBT.md` → "Audit de idempotência cross-handler" (🟡
médio). Inclui:

- Advisory lock em `checkAndPromote` (race de promoção dupla)
- Stress test de saída end-to-end com concorrência
- Audit de subscribers do event bus para idempotência

Não é bloqueante para operação normal; é para elevar a barra antes de
crescer para mais bairros/guilds.
