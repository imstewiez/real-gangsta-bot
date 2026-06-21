'use strict';

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= '12345678901234567';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

let nextRows = [];
require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: nextRows }),
  },
};

const replies = [];
require.cache[resolvedPath('shared/interactionHelpers.js')] = {
  exports: {
    safeReply: async (_interaction, payload, _opts) => {
      replies.push(payload);
      return true;
    },
    safeShowModal: async () => {},
    safeUpdate: async () => {},
    getModalField: () => '',
    isDuplicate: () => false,
    lockMessageComponents: async () => {},
  },
};

const { handleMeuPedido } = require('../src/onboarding/meuPedido');

function makeInteraction() {
  return {
    user: { id: '111' },
    deferReply: async () => {},
  };
}

function lastReply() {
  return replies[replies.length - 1];
}

describe('handleMeuPedido', () => {
  beforeEach(() => {
    replies.length = 0;
    nextRows = [];
  });

  it('returns raw text when the user has no request', async () => {
    await handleMeuPedido(makeInteraction());
    const reply = lastReply();
    assert.ok(reply.content);
    assert.match(reply.content, /nenhum pedido/i);
  });

  it('renders pending request details', async () => {
    nextRows = [
      {
        status: 'pending',
        full_name: 'Joao Silva',
        nickname: 'Jack',
        created_at: new Date('2026-04-10T10:00:00Z'),
        resolved_at: null,
        denial_reason: null,
        channel_create_failed: false,
        member_channel: null,
      },
    ];

    await handleMeuPedido(makeInteraction());
    const embed = lastReply().embeds[0].data;
    assert.equal(embed.color, 0xf39c12);
    assert.match(embed.title, /analise|análise/i);
    assert.match(embed.description, /Joao Silva/);
    assert.match(embed.description, /Jack/);
    assert.match(embed.description, /chefia/i);
  });

  it('renders approved request with member channel link', async () => {
    nextRows = [
      {
        status: 'approved',
        full_name: 'Maria',
        nickname: 'Mari',
        created_at: new Date('2026-04-10T10:00:00Z'),
        resolved_at: new Date('2026-04-11T10:00:00Z'),
        denial_reason: null,
        channel_create_failed: false,
        member_channel: '9999',
      },
    ];

    await handleMeuPedido(makeInteraction());
    const embed = lastReply().embeds[0].data;
    assert.equal(embed.color, 0x2ecc71);
    assert.match(embed.title, /aprovado/i);
    assert.match(embed.description, /<#9999>/);
    assert.doesNotMatch(embed.description, /ainda nao existe|ainda não existe/i);
  });

  it('renders a visible warning when approved but channel creation failed', async () => {
    nextRows = [
      {
        status: 'approved',
        full_name: 'Ze',
        nickname: 'Z',
        created_at: new Date(),
        resolved_at: new Date(),
        denial_reason: null,
        channel_create_failed: true,
        member_channel: null,
      },
    ];

    await handleMeuPedido(makeInteraction());
    const embed = lastReply().embeds[0].data;
    assert.match(embed.description, /ainda nao existe|ainda não existe/i);
  });

  it('renders denied request with reason', async () => {
    nextRows = [
      {
        status: 'denied',
        full_name: 'Ninguem',
        nickname: 'NN',
        created_at: new Date(),
        resolved_at: new Date(),
        denial_reason: 'nome inadequado',
        channel_create_failed: false,
        member_channel: null,
      },
    ];

    await handleMeuPedido(makeInteraction());
    const embed = lastReply().embeds[0].data;
    assert.equal(embed.color, 0xe74c3c);
    assert.match(embed.title, /recusado/i);
    assert.match(embed.description, /nome inadequado/);
  });

  it('renders denied request without a reason block when reason is missing', async () => {
    nextRows = [
      {
        status: 'denied',
        full_name: 'X',
        nickname: 'X',
        created_at: new Date(),
        resolved_at: new Date(),
        denial_reason: null,
        channel_create_failed: false,
        member_channel: null,
      },
    ];

    await handleMeuPedido(makeInteraction());
    const embed = lastReply().embeds[0].data;
    assert.doesNotMatch(embed.description, /razao|razão/i);
    assert.match(embed.description, /reapelar/i);
  });

  it('falls back to plain text for an unknown status', async () => {
    nextRows = [
      {
        status: 'weird',
        full_name: 'X',
        nickname: 'X',
        created_at: new Date(),
        resolved_at: null,
        denial_reason: null,
        channel_create_failed: false,
        member_channel: null,
      },
    ];

    await handleMeuPedido(makeInteraction());
    assert.match(lastReply().content, /desconhecido/i);
  });
});
