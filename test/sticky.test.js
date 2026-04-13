'use strict';
/**
 * Testes do stickyEngine — registradores, render, e listener counter.
 * Sem Discord nem DB real (stubs).
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

// In-memory stub do stickyRepo — cada teste reseta via setData.
const stickyState = { rows: [], counter: 1 };
function resetStickyState() { stickyState.rows = []; stickyState.counter = 1; }
function setStickyRows(rows) { stickyState.rows = rows.map(r => ({ ...r })); }

require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
  },
};
require.cache[resolvedPath('repositories/index.js')] = {
  exports: {
    memberRepo: {}, inventoryRepo: {}, operationRepo: {}, rankingRepo: {},
    auditRepo: {}, jobRepo: {}, availabilityRepo: {}, radioRepo: {},
    stickyRepo: {
      listActive: async () => stickyState.rows.filter(r => r.active !== false),
      listForChannel: async (cid) => stickyState.rows.filter(r => r.channel_id === cid && r.active !== false),
      getByChannelSource: async (cid, src) => stickyState.rows.find(r => r.channel_id === cid && r.source_key === src) || null,
      upsert: async (data) => {
        const found = stickyState.rows.find(r => r.channel_id === data.channelId && r.source_key === data.sourceKey);
        if (found) {
          Object.assign(found, {
            mode: data.mode, payload: data.payload, threshold_msgs: data.thresholdMsgs,
            threshold_minutes: data.thresholdMinutes, active: true,
          });
          return found;
        }
        const row = {
          id: stickyState.counter++,
          channel_id: data.channelId, source_key: data.sourceKey,
          mode: data.mode, payload: data.payload,
          threshold_msgs: data.thresholdMsgs, threshold_minutes: data.thresholdMinutes,
          msgs_since_post: 0, last_message_id: null, last_posted_at: new Date(),
          created_by: data.createdBy, active: true,
        };
        stickyState.rows.push(row);
        return row;
      },
      setLastMessage: async (id, mid) => {
        const r = stickyState.rows.find(x => x.id === id);
        if (r) { r.last_message_id = mid; r.msgs_since_post = 0; r.last_posted_at = new Date(); }
      },
      incrementCounter: async (id) => {
        const r = stickyState.rows.find(x => x.id === id);
        if (!r) return null;
        r.msgs_since_post = (r.msgs_since_post || 0) + 1;
        return { msgs_since_post: r.msgs_since_post, threshold_msgs: r.threshold_msgs };
      },
      deactivate: async (id) => {
        const r = stickyState.rows.find(x => x.id === id);
        if (r) r.active = false;
      },
    },
  },
};
require.cache[resolvedPath('audit/auditEngine.js')] = {
  exports: { logAudit: async () => {} },
};

const stickyEngine = require('../src/sticky/stickyEngine');

function fakeClient(channelOps = {}) {
  return {
    channels: {
      fetch: async (id) => ({
        id, isTextBased: () => true,
        send: async (payload) => {
          channelOps.lastSent = payload;
          return { id: 'msg-' + Math.random().toString(36).slice(2, 8), edit: async () => {}, delete: async () => {} };
        },
        messages: {
          fetch: async (mid) => ({
            id: mid,
            edit: async (p) => { channelOps.lastEdited = p; },
            delete: async () => { channelOps.deleted = true; },
          }),
        },
      }),
    },
  };
}

describe('stickyEngine — renderer registry', () => {
  it('registerRenderer + listRenderers', () => {
    stickyEngine.registerRenderer('test:foo', async () => ({ content: 'foo' }));
    assert.ok(stickyEngine.listRenderers().includes('test:foo'));
  });

  it('renderPayload usa renderer registado', async () => {
    stickyEngine.registerRenderer('test:bar', async () => ({ content: 'BAR' }));
    const payload = await stickyEngine.renderPayload(null, { source_key: 'test:bar', payload: {} });
    assert.equal(payload.content, 'BAR');
  });

  it('renderPayload sem renderer devolve payload guardado', async () => {
    const payload = await stickyEngine.renderPayload(null, { source_key: 'unknown', payload: { content: 'static' } });
    assert.equal(payload.content, 'static');
  });
});

describe('stickyEngine — setSticky / removeSticky', () => {
  beforeEach(() => resetStickyState());

  it('setSticky upserta e remove desactiva', async () => {
    const s = await stickyEngine.setSticky({
      channelId: 'C1', sourceKey: 'k1', mode: 'update',
      payload: { content: 'hi' }, createdBy: 'u1',
    });
    assert.equal(s.channel_id, 'C1');
    assert.equal(s.active, true);

    const removed = await stickyEngine.removeSticky({ channelId: 'C1', sourceKey: 'k1', actorId: 'u1' });
    assert.ok(removed);
    assert.equal(stickyState.rows[0].active, false);
  });

  it('setSticky rejeita modo inválido', async () => {
    await assert.rejects(
      stickyEngine.setSticky({ channelId: 'C', sourceKey: 'k', mode: 'pin', createdBy: 'u' }),
      /Modo inválido/
    );
  });
});

describe('stickyEngine — onMessageCreate counter & repost', () => {
  beforeEach(() => {
    resetStickyState();
    setStickyRows([{
      id: 1, channel_id: 'C1', source_key: 'k1', mode: 'repost',
      threshold_msgs: 3, threshold_minutes: 0, msgs_since_post: 0,
      last_message_id: 'old-msg', payload: { content: 'sticky' }, active: true,
      last_posted_at: new Date(),
    }]);
  });

  it('ignora mensagens de bots', async () => {
    const ops = {};
    const client = fakeClient(ops);
    await stickyEngine.onMessageCreate(client, {
      channel: { id: 'C1', isTextBased: () => true },
      author: { bot: true },
    });
    assert.equal(stickyState.rows[0].msgs_since_post, 0);
  });

  it('incrementa contador em mensagens humanas', async () => {
    const client = fakeClient();
    await stickyEngine.onMessageCreate(client, {
      channel: { id: 'C1', isTextBased: () => true },
      author: { bot: false },
    });
    assert.equal(stickyState.rows[0].msgs_since_post, 1);
  });

  it('dispara postFresh ao atingir threshold', async () => {
    const ops = {};
    const client = fakeClient(ops);
    for (let i = 0; i < 3; i++) {
      await stickyEngine.onMessageCreate(client, {
        channel: { id: 'C1', isTextBased: () => true },
        author: { bot: false },
      });
    }
    // após 3 msgs, devia ter postado fresh (delete + send)
    assert.ok(ops.lastSent, 'esperava-se um channel.send após threshold');
  });
});

describe('stickyEngine — runTimeBasedRefresh', () => {
  beforeEach(() => {
    resetStickyState();
    setStickyRows([{
      id: 1, channel_id: 'C1', source_key: 'k1', mode: 'repost',
      threshold_msgs: 0, threshold_minutes: 5, msgs_since_post: 0,
      last_message_id: 'old', payload: { content: 'x' }, active: true,
      last_posted_at: new Date(Date.now() - 10 * 60 * 1000), // 10 min atrás
    }]);
  });

  it('reposta quando idade > threshold_minutes', async () => {
    const ops = {};
    const client = fakeClient(ops);
    const result = await stickyEngine.runTimeBasedRefresh(client);
    assert.equal(result.posted, 1);
    assert.ok(ops.lastSent);
  });

  it('não reposta antes do threshold', async () => {
    setStickyRows([{
      id: 1, channel_id: 'C1', source_key: 'k1', mode: 'repost',
      threshold_msgs: 0, threshold_minutes: 60, msgs_since_post: 0,
      last_message_id: 'old', payload: { content: 'x' }, active: true,
      last_posted_at: new Date(Date.now() - 30 * 1000), // 30s atrás
    }]);
    const ops = {};
    const result = await stickyEngine.runTimeBasedRefresh(fakeClient(ops));
    assert.equal(result.posted, 0);
  });
});
