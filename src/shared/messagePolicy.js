'use strict';
/**
 * Política central de ciclo de vida de mensagens do bot.
 *
 * Hierarquia:
 *   Nível 1 — descartável (BANAL)       → feedback rápido, confirmações
 *   Nível 2 — leitura curta (WARN/ERROR) → validação, erro recuperável
 *   Nível 3 — leitura detalhada (RESULT) → listas, histórico, consulta
 *   Nível 4 — cockpit/navegação (COCKPIT) → perfis, dashboards pessoais
 *   Nível 5a — fluxo interactivo (FLOW)  → wizards (desactivam ao expirar)
 *   Nível 5b — persistente (PERSISTENT) → painéis, logs em canais
 *
 * Uso:
 *   await safeReply(interaction, payload, { messageClass: 'COCKPIT' })
 *
 * Cada handler deve declarar a classe da sua resposta.
 */

/**
 * Classes canónicas. Todas as respostas do bot devem cair numa destas.
 * Qualquer coisa que não seja classificada herda DEFAULT (BANAL).
 */
const MessageClass = Object.freeze({
  BANAL: 'BANAL', // "guardado", "feito", validação OK — 20s
  WARN: 'WARN', // input inválido, duplicado — 45s
  ERROR: 'ERROR', // falha recuperável, item não encontrado — 60s
  RESULT: 'RESULT', // lista, ranking, histórico curto — 60s
  COCKPIT: 'COCKPIT', // Movimento no Bairro, perfis, drill-downs — 120s
  FLOW: 'FLOW', // wizard multi-step — persiste; desactiva on expire
  PERSISTENT: 'PERSISTENT', // painéis, logs — nunca auto-dismiss
});

/**
 * TTL por classe em milissegundos. Valores calibrados para PT-PT reading speed
 * e densidade típica de informação.
 */
const TTL_MS = Object.freeze({
  BANAL: 10_000, // "guardado", confirmações — 10s (dropado de 20s por UX feedback)
  WARN: 45_000,
  ERROR: 60_000,
  RESULT: 60_000,
  COCKPIT: 120_000,
  FLOW: 300_000, // 5 min — tempo suficiente para interagir, depois limpa
  PERSISTENT: null, // sem TTL — nunca auto-dismiss
});

/**
 * Se true, a mensagem auto-delete silencioso quando o TTL expira.
 * FLOW/PERSISTENT nunca auto-delete.
 */
const AUTO_DELETE = Object.freeze({
  BANAL: true,
  WARN: true,
  ERROR: true,
  RESULT: true,
  COCKPIT: true,
  FLOW: false,
  PERSISTENT: false,
});

/**
 * Se true, mensagens de fluxo ficam com componentes bloqueados ao expirar
 * (em vez de desaparecer). Só aplicável a FLOW.
 */
const LOCK_ON_EXPIRE = Object.freeze({
  FLOW: true,
});

function ttlForClass(cls) {
  return TTL_MS[cls] ?? TTL_MS.BANAL;
}

function autoDeletes(cls) {
  return AUTO_DELETE[cls] ?? true;
}

function locksOnExpire(cls) {
  return LOCK_ON_EXPIRE[cls] === true;
}

/**
 * Retrocompatibilidade: `opts.dismissible` → classe.
 * Usado quando handlers antigos ainda passam `{ dismissible: true }`.
 */
function classFromLegacyOpts({ dismissible, messageClass, payload }) {
  if (messageClass && MessageClass[messageClass]) return messageClass;
  if (dismissible === true) return MessageClass.BANAL;
  if (dismissible === false) return MessageClass.FLOW;
  // auto — inferir a partir do payload:
  const hasComponents = Array.isArray(payload?.components) && payload.components.length > 0;
  const hasEmbeds = Array.isArray(payload?.embeds) && payload.embeds.length > 0;
  if (hasComponents) return MessageClass.FLOW;
  if (hasEmbeds) return MessageClass.RESULT;
  return MessageClass.BANAL;
}

module.exports = {
  MessageClass,
  TTL_MS,
  AUTO_DELETE,
  ttlForClass,
  autoDeletes,
  locksOnExpire,
  classFromLegacyOpts,
};
