'use strict';
/**
 * Testes do DM helper (src/shared/dm.js):
 *   - sendDM ok / erro
 *   - tryDmOrFallback: DM ok | DM falha com canal | DM falha sem canal |
 *     DM falha com canal que falha | fallback com menção
 */

const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
  },
};

const { sendDM, tryDmOrFallback } = require('../src/shared/dm');

function makeUser(opts = {}) {
  const dmSend = opts.dmSendImpl || (async () => {});
  const createDMImpl =
    opts.createDMImpl ||
    (async () => ({
      send: dmSend,
    }));
  return { id: opts.id || '111', createDM: createDMImpl };
}

function makeChannel(sendImpl = async () => {}) {
  const calls = [];
  return {
    send: async payload => {
      calls.push(payload);
      return sendImpl(payload);
    },
    _calls: calls,
  };
}

describe('dmHelper — sendDM', () => {
  it('retorna ok:true quando createDM + send sucedem', async () => {
    const user = makeUser();
    const r = await sendDM(user, { content: 'olá' });
    assert.equal(r.ok, true);
  });

  it('retorna ok:false com código de erro quando send atira', async () => {
    const user = makeUser({
      dmSendImpl: async () => {
        const err = new Error('Cannot send messages to this user');
        err.code = 50007;
        throw err;
      },
    });
    const r = await sendDM(user, { content: 'olá' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 50007);
  });

  it('retorna ok:false quando user é null', async () => {
    const r = await sendDM(null, { content: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no_user');
  });
});

describe('dmHelper — tryDmOrFallback', () => {
  it('delivered:dm quando DM sucede', async () => {
    const user = makeUser();
    const fallbackChannel = makeChannel();
    const r = await tryDmOrFallback({
      user,
      payload: { content: 'teste' },
      fallbackChannel,
    });
    assert.equal(r.delivered, 'dm');
    assert.equal(fallbackChannel._calls.length, 0, 'canal fallback não deve ser usado');
  });

  it('delivered:channel quando DM falha e canal sucede', async () => {
    const user = makeUser({
      dmSendImpl: async () => {
        const err = new Error('DMs closed');
        err.code = 50007;
        throw err;
      },
    });
    const fallbackChannel = makeChannel();
    const r = await tryDmOrFallback({
      user,
      payload: { content: 'teste' },
      fallbackChannel,
    });
    assert.equal(r.delivered, 'channel');
    assert.equal(r.dmError, 50007);
    assert.equal(fallbackChannel._calls.length, 1);
  });

  it('fallback adiciona menção ao user no content quando fallbackMention=true', async () => {
    const user = makeUser({
      id: '999',
      dmSendImpl: async () => {
        throw new Error('closed');
      },
    });
    const fallbackChannel = makeChannel();
    await tryDmOrFallback({
      user,
      payload: { content: 'olá' },
      fallbackChannel,
      fallbackMention: true,
    });
    const sent = fallbackChannel._calls[0];
    assert.match(sent.content, /^<@999>/);
    assert.deepEqual(sent.allowedMentions, { users: ['999'] });
  });

  it('fallback NÃO adiciona menção quando fallbackMention=false', async () => {
    const user = makeUser({
      id: '999',
      dmSendImpl: async () => {
        throw new Error('closed');
      },
    });
    const fallbackChannel = makeChannel();
    await tryDmOrFallback({
      user,
      payload: { content: 'olá' },
      fallbackChannel,
      fallbackMention: false,
    });
    const sent = fallbackChannel._calls[0];
    assert.equal(sent.content, 'olá');
    assert.ok(!sent.allowedMentions);
  });

  it('delivered:none quando DM falha e sem canal fallback', async () => {
    const user = makeUser({
      dmSendImpl: async () => {
        throw new Error('closed');
      },
    });
    const r = await tryDmOrFallback({
      user,
      payload: { content: 'x' },
      fallbackChannel: null,
    });
    assert.equal(r.delivered, 'none');
  });

  it('delivered:none quando DM falha e canal também falha', async () => {
    const user = makeUser({
      dmSendImpl: async () => {
        throw new Error('dm closed');
      },
    });
    const fallbackChannel = makeChannel(async () => {
      throw new Error('channel unavailable');
    });
    const r = await tryDmOrFallback({
      user,
      payload: { content: 'x' },
      fallbackChannel,
    });
    assert.equal(r.delivered, 'none');
    assert.ok(r.dmError);
    assert.ok(r.channelError);
  });

  it('preserva embeds/components no fallback', async () => {
    const user = makeUser({
      dmSendImpl: async () => {
        throw new Error('closed');
      },
    });
    const fallbackChannel = makeChannel();
    const fakeEmbed = { title: 'x' };
    await tryDmOrFallback({
      user,
      payload: { embeds: [fakeEmbed] },
      fallbackChannel,
      fallbackMention: false,
    });
    assert.deepEqual(fallbackChannel._calls[0].embeds, [fakeEmbed]);
  });
});
