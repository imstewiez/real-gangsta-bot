'use strict';
/**
 * Mensagens de erro — curtas, directas, sem drama.
 *
 * Nunca começar por "Erro:". O emoji e a frase dizem tudo.
 * Sempre tu, nunca "utilizador".
 */

const E = require('./emojis');

const ERRORS = {
  // Genéricos
  GENERIC: () => `${E.ERRO} Algo correu mal. Tenta outra vez.`,

  // Erro com mensagem user-friendly explícita (ex: throws de domínio tipo
  // "Spot em cooldown — faltam 22 min"). Usar APENAS com strings já
  // preparadas para user-facing; nunca com stack traces ou detail técnico.
  WITH_DETAIL: detail => `${E.ERRO} ${detail}`,

  // Falha interna com correlation ID — o correlation vem do requestContext
  // e permite grep nos logs. Standardiza a linguagem entre todos os handlers.
  INTERNAL: cid => `${E.ERRO} Falha interna. Ref: \`${cid}\`.`,

  DUPLICATE_REQUEST: () => `${E.DUPLICADO} Calma — já tinhas feito isso.`,

  DB_UNAVAILABLE: () => `${E.ERRO} A DB está fora. Nada foi guardado.`,

  DB_WRITE_FAILED: what => `${E.WARN} Não consegui guardar "${what}". Tenta de novo.`,

  // Duplicado em catálogo / lista.
  ALREADY_EXISTS: what => `${E.DUPLICADO} "${what}" já existe.`,

  // Permissões
  NO_PERMISSION: what => `${E.NO_PERMISSION} ${what ? `Não é contigo — ${what}.` : 'Ainda não tens acesso a isto.'}`,

  NO_ROLE: () => `${E.NO_PERMISSION} Não tens o peso para isto.`,

  // Membros
  MEMBER_NOT_FOUND: () => `${E.NOT_FOUND} Esse nome não está na casa.`,

  ALREADY_REGISTERED: () => `${E.WARN} Já está na firma — não precisas de registar outra vez.`,

  // Saídas
  SAIDA_NOT_FOUND: () => `${E.NOT_FOUND} Essa saída não existe.`,

  SAIDA_CLOSED: () => `${E.BLOQUEADO} Essa saída já foi fechada.`,

  SAIDA_FULL: max => `${E.WARN} Grupo cheio — máximo ${max}.`,

  SAIDA_NOT_OPEN: () => `${E.BLOQUEADO} A saída não está aberta para isto.`,

  // Material
  ITEM_NOT_FOUND: () => `${E.NOT_FOUND} Esse material não está no catálogo.`,

  STOCK_EMPTY: item => `${E.MATERIAL} Sem ${item} em stock.`,

  STOCK_INSUFFICIENT: (item, have, want) => `${E.WARN} Só há ${have} de ${item} — pediste ${want}.`,

  INVALID_QUANTITY: () => `${E.WARN} Quantidade inválida — tem de ser positiva.`,

  // Canais / permissões
  CHANNEL_CREATE_FAILED: () => `${E.WARN} Não consegui abrir o canal. Confirma as permissões.`,

  // Votação / sessões
  SESSION_NOT_FOUND: () => `${E.NOT_FOUND} Sessão não encontrada.`,

  SESSION_CLOSED: () => `${E.BLOQUEADO} Sessão fechada — votos congelados.`,

  INVALID_STATE: () => `${E.WARN} Estado inválido.`,

  // Sticky
  STICKY_NOT_FOUND: () => `${E.NOT_FOUND} Sticky não existe ou está inactiva.`,

  // ── Legacy aliases (não tens de usar; só para callers antigos) ──────────
  // Migrar para os nomes directamente quando tocares no handler.
  get OPERATION_NOT_FOUND() {
    return this.SAIDA_NOT_FOUND;
  },
  get OPERATION_CLOSED() {
    return this.SAIDA_CLOSED;
  },
};

module.exports = ERRORS;
