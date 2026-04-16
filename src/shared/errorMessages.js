'use strict';
/**
 * @deprecated — usa `require('../content').ERRORS` ou `.SUCCESS` directamente.
 *
 * Este módulo é uma shim de compatibilidade com a camada antiga. Mantém a
 * mesma API (MESSAGES.FOO(args)) mas delega para `content/errors.js` e
 * `content/success.js`, onde vive a copy canónica.
 *
 * A apagar em release futura. Qualquer import novo deve ir directo ao content.
 */

const ERRORS  = require('../content/errors');
const SUCCESS = require('../content/success');

const MESSAGES = {
  // Erros
  DUPLICATE_REQUEST:    ERRORS.DUPLICATE_REQUEST,
  DB_UNAVAILABLE:       ERRORS.DB_UNAVAILABLE,
  DB_WRITE_FAILED:      ERRORS.DB_WRITE_FAILED,
  MEMBER_NOT_FOUND:     ERRORS.MEMBER_NOT_FOUND,
  NO_PERMISSION:        ERRORS.NO_PERMISSION,
  OPERATION_NOT_FOUND:  ERRORS.SAIDA_NOT_FOUND,
  OPERATION_CLOSED:     ERRORS.SAIDA_CLOSED,
  ITEM_NOT_FOUND:       ERRORS.ITEM_NOT_FOUND,
  INVALID_QUANTITY:     ERRORS.INVALID_QUANTITY,
  CHANNEL_CREATE_FAILED:ERRORS.CHANNEL_CREATE_FAILED,
  ALREADY_REGISTERED:   ERRORS.ALREADY_REGISTERED,
  // Sucesso
  SUCCESS: (action) => SUCCESS.SAVED(action),
};

module.exports = MESSAGES;
