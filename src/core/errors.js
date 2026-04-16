'use strict';
/**
 * Domain errors — classes para situações previsíveis.
 *
 * Handlers devem apanhar estes erros e mapear para respostas user-friendly.
 * Erros não-domain continuam a lançar → apanhados pelo dispatcher global.
 */

class DomainError extends Error {
  constructor(message, code = 'DOMAIN_ERROR') {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

class ValidationError extends DomainError {
  constructor(message, field = null) {
    super(message, 'VALIDATION');
    this.name = 'ValidationError';
    this.field = field;
  }
}

class NotFoundError extends DomainError {
  constructor(entity, id = null) {
    super(id ? `${entity} #${id} não encontrado.` : `${entity} não encontrado.`, 'NOT_FOUND');
    this.name = 'NotFoundError';
    this.entity = entity;
    this.id = id;
  }
}

class PermissionError extends DomainError {
  constructor(action = 'esta acção') {
    super(`Sem permissão para ${action}.`, 'PERMISSION');
    this.name = 'PermissionError';
    this.action = action;
  }
}

class ConflictError extends DomainError {
  constructor(message) {
    super(message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

class ExpiredError extends DomainError {
  constructor(what = 'sessão') {
    super(`${what} expirada.`, 'EXPIRED');
    this.name = 'ExpiredError';
  }
}

module.exports = {
  DomainError,
  ValidationError,
  NotFoundError,
  PermissionError,
  ConflictError,
  ExpiredError,
};
