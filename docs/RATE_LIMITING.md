# Rate Limiting

Política actual, decisão arquitectural e gatilhos para reavaliar.

---

## Estado actual

**Implementação**: `src/shared/rateLimiter.js`

- Storage: `Map<userId::actionKey, {count, resetAt}>` em memória
- Janela deslizante simples (não token bucket)
- Cleanup 60s remove buckets expirados
- Single-instance: in-memory funciona porque o bot é forçado a correr em
  uma única instância via `acquireInstanceLockWithRetry` em
  `instanceCoordinator.js`.

---

## Decisão arquitectural (2026-04-17)

**Escolha**: Manter in-memory. **Não** migrar para Redis ou similar.

**Porquê**:
- Bot corre single-instance (lock + heartbeat preempção). Se tentas
  arrancar 2× num preempt shutdown da antiga. **Nunca há dois processos
  a enforçar rate limiting em simultâneo.**
- Zero latência, zero dependência externa, zero infra extra no Railway.
- O que o rate limiter protege é UX (prevenir spam de clicks), não
  correcção de dados. Correcção é garantida pela DB via unique indexes e
  CHECK constraints (ver `docs/IDEMPOTENCY.md`).
- Redis seria resolver um problema que não existe neste perfil de deploy.

**Custo**: quando o bot reinicia, buckets zeram — um user rate-limited
poderia tentar imediatamente a seguir ao restart. Aceitável; restarts são
raros e previsíveis.

---

## Gatilhos para reavaliar

Mudar para rate limiter distribuído **SE e só se** um destes acontecer:

1. **Correr multi-instância de propósito** — ex: se houver bot para 2
   guilds diferentes em processos separados mas com limits partilhados
   (improvável — limits são per-user por action, não cross-guild).
2. **Escala > 10k membros activos** — em memória começa a ser relevante
   footprint. Mapa a crescer com mesh de (user × action) precisa de
   eviction mais agressiva.
3. **Audit de abuso** — se passares a cross-reference rate limit events
   com outros sinais para banimento automático. Aí Redis faz sentido
   para ter histórico persistente.
4. **Requisito de observabilidade avançado** — queres métricas detalhadas
   (Prometheus histogram de wait times, etc.) que ficam bem num store
   externo.

Até então, mantém in-memory.

---

## Como é usado

```javascript
const rl = require('./shared/rateLimiter');

// Bloquear se user estoirou o limit
if (!rl.allow(userId, 'rg-member', { limit: 5, windowMs: 10000 })) {
  return safeReply(interaction, { content: rl.denyMessage() });
}
```

Convencional usar `actionKey` com domínio-prefixo: `bairrista::registar_material`,
`saida::inscrever`, etc. Permite logs e métricas por prefixo se precisar.

---

## Métricas

- `rate_limit_denials_total` — contador Prometheus. Incrementa quando um
  pedido é recusado por bucket full. Visível em `/metrics`.

Sem histograma de wait times actualmente. Adicionar se o gatilho #4 acima
disparar.

---

## Testes

- `test/rateLimiter.test.js` — valida janela, cleanup, reset. Não precisa
  de DB.
