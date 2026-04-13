'use strict';

const MESSAGES = {
  DUPLICATE_REQUEST: () =>
    'Pedido duplicado detetado. A ação anterior já foi processada.',

  DB_UNAVAILABLE: () =>
    'A base de dados não respondeu. Nada foi guardado. Tenta novamente.',

  DB_WRITE_FAILED: (action) =>
    `O registo de "${action}" falhou. Nada foi guardado.`,

  MEMBER_NOT_FOUND: () =>
    'Membro não encontrado. Verifica se está registado.',

  NO_PERMISSION: (action) =>
    `Não tens permissão para ${action}.`,

  SUCCESS: (action) =>
    `${action} — registado com sucesso.`,

  OPERATION_NOT_FOUND: () =>
    'Operação não encontrada.',

  OPERATION_CLOSED: () =>
    'Esta operação já foi concluída ou cancelada.',

  ITEM_NOT_FOUND: () =>
    'Item não encontrado no catálogo.',

  INVALID_QUANTITY: () =>
    'Quantidade inválida. Deve ser um número positivo.',

  CHANNEL_CREATE_FAILED: () =>
    'Não foi possível criar o canal. Verifica as permissões do bot.',

  ALREADY_REGISTERED: () =>
    'Este membro já está registado no sistema.',
};

module.exports = MESSAGES;
