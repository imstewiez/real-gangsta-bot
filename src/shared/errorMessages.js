'use strict';

// Strings curtas, tom directo, sabor bairro — sem cringe. Assinadas pelo
// redwood quando embeds. Uso consistente em handlers/slash.
const MESSAGES = {
  DUPLICATE_REQUEST: () =>
    '⏱️ Calma lá — já tinhas pedido isso. Processado.',

  DB_UNAVAILABLE: () =>
    '🗄️ DB não respondeu. Nada foi guardado — tenta outra vez.',

  DB_WRITE_FAILED: (action) =>
    `⚠️ Não consegui guardar "${action}". Fica na tua — tenta de novo.`,

  MEMBER_NOT_FOUND: () =>
    '👤 Não achei este membro nos registos. Vê se já tem tag.',

  NO_PERMISSION: (action) =>
    `🚫 Não é contigo — não tens permissão para ${action}.`,

  SUCCESS: (action) =>
    `✅ ${action} — feito.`,

  OPERATION_NOT_FOUND: () =>
    '🔍 Operação não encontrada.',

  OPERATION_CLOSED: () =>
    '🔒 Essa operação já foi fechada ou cancelada.',

  ITEM_NOT_FOUND: () =>
    '📦 Item não está no catálogo.',

  INVALID_QUANTITY: () =>
    '🔢 Quantidade inválida — tem de ser um número positivo.',

  CHANNEL_CREATE_FAILED: () =>
    '📛 Não consegui criar o canal. Confirma as permissões do bot.',

  ALREADY_REGISTERED: () =>
    '✋ Este já está na malta — não precisas de registar de novo.',
};

module.exports = MESSAGES;
