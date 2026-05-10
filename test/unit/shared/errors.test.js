'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  BotError,
  UserError,
  ValidationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  InternalError,
} = require('../../../src/shared/errors');

describe('Structured Errors', () => {
  it('class hierarchy — all instanceof Error and BotError', () => {
    const errors = [
      new BotError('bot'),
      new UserError('user'),
      new ValidationError('validation'),
      new PermissionError('permission'),
      new NotFoundError('not found'),
      new ConflictError('conflict'),
      new InternalError('internal'),
    ];
    for (const e of errors) {
      assert.ok(e instanceof Error, `${e.constructor.name} should extend Error`);
      assert.ok(e instanceof BotError, `${e.constructor.name} should extend BotError`);
    }
  });

  it('UserError subclasses have isUserFacing = true', () => {
    assert.equal(new UserError('u').isUserFacing, true);
    assert.equal(new ValidationError('v').isUserFacing, true);
    assert.equal(new PermissionError('p').isUserFacing, true);
    assert.equal(new NotFoundError('n').isUserFacing, true);
    assert.equal(new ConflictError('c').isUserFacing, true);
  });

  it('BotError and InternalError have isUserFacing = false', () => {
    assert.equal(new BotError('b').isUserFacing, false);
    assert.equal(new InternalError('i').isUserFacing, false);
  });

  it('custom codes and contexts', () => {
    const e = new ValidationError('bad input', { code: 'INVALID_NAME', context: { field: 'name' } });
    assert.equal(e.code, 'INVALID_NAME');
    assert.deepStrictEqual(e.context, { field: 'name' });
    assert.equal(e.message, 'bad input');
  });

  it('default code is set per subclass', () => {
    assert.equal(new BotError('x').code, 'UNKNOWN');
    assert.equal(new UserError('x').code, 'UNKNOWN');
    assert.equal(new ValidationError('x').code, 'VALIDATION_ERROR');
    assert.equal(new PermissionError('x').code, 'PERMISSION_ERROR');
    assert.equal(new NotFoundError('x').code, 'NOT_FOUND');
    assert.equal(new ConflictError('x').code, 'CONFLICT');
    assert.equal(new InternalError('x').code, 'INTERNAL_ERROR');
  });
});
