'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

const ctx = require('../src/shared/requestContext');

describe('requestContext — AsyncLocalStorage', () => {
  it('fora de run() current() é null', () => {
    assert.equal(ctx.current(), null);
    assert.equal(ctx.correlationId(), null);
  });

  it('gera correlationId automaticamente se não passar', () => {
    ctx.run({ actorId: 'u1' }, () => {
      const id = ctx.correlationId();
      assert.ok(id);
      assert.match(id, /^req_/);
    });
  });

  it('preserva correlationId explícito', () => {
    ctx.run({ correlationId: 'req_custom', actorId: 'u1' }, () => {
      assert.equal(ctx.correlationId(), 'req_custom');
    });
  });

  it('actorId acessível', () => {
    ctx.run({ actorId: 'u42', action: 'test' }, () => {
      assert.equal(ctx.actorId(), 'u42');
    });
  });

  it('tag retorna [req_xxx]', () => {
    ctx.run({ correlationId: 'req_abc', actorId: 'u1' }, () => {
      assert.equal(ctx.tag(), '[req_abc]');
    });
  });

  it('elapsed mede tempo desde run()', async () => {
    await ctx.run({ actorId: 'u1' }, async () => {
      await new Promise(r => setTimeout(r, 30));
      assert.ok(ctx.elapsed() >= 25);
    });
  });

  it('contextos aninhados — inner shadows outer', () => {
    ctx.run({ correlationId: 'outer', actorId: 'u1' }, () => {
      ctx.run({ correlationId: 'inner', actorId: 'u2' }, () => {
        assert.equal(ctx.correlationId(), 'inner');
      });
      assert.equal(ctx.correlationId(), 'outer');
    });
  });

  it('async boundaries preservam contexto', async () => {
    await ctx.run({ correlationId: 'req_async', actorId: 'u1' }, async () => {
      await new Promise(r => setTimeout(r, 10));
      assert.equal(ctx.correlationId(), 'req_async');
    });
  });
});
