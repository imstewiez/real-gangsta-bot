'use strict';

class BotError extends Error {
  constructor(message, { code = 'UNKNOWN', context = {} } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.isUserFacing = false;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

class UserError extends BotError {
  constructor(message, { code = 'UNKNOWN', context = {} } = {}) {
    super(message, { code, context });
    this.isUserFacing = true;
  }
}

class ValidationError extends UserError {
  constructor(message, { code = 'VALIDATION_ERROR', context = {} } = {}) {
    super(message, { code, context });
  }
}

class PermissionError extends UserError {
  constructor(message, { code = 'PERMISSION_ERROR', context = {} } = {}) {
    super(message, { code, context });
  }
}

class NotFoundError extends UserError {
  constructor(message, { code = 'NOT_FOUND', context = {} } = {}) {
    super(message, { code, context });
  }
}

class ConflictError extends UserError {
  constructor(message, { code = 'CONFLICT', context = {} } = {}) {
    super(message, { code, context });
  }
}

class InternalError extends BotError {
  constructor(message, { code = 'INTERNAL_ERROR', context = {} } = {}) {
    super(message, { code, context });
    this.isUserFacing = false;
  }
}

module.exports = {
  BotError,
  UserError,
  ValidationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  InternalError,
};
