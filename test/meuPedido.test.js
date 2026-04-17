'use strict';
/**
 * Testes de handleMeuPedido — verifica que o embed correcto é construído
 * per estado do pedido (sem pedidos, pendente, aprovado, negado).
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

// ── Stub DB: próxima query devolve estas rows ──
let _nextRows = [];
require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: _nextRows }),
  },
};

// Stub interactionHelpers — capturamos o que é enviado a safeReply.
const _replies = [];
require.cache[resolvedPath('shared/interactionHelpers.js')] = {
  exports: {
    safeReply: async (_interaction, payload, _opts) => {
      _replies.push(payload);
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
  return _replies[_replies.length - 1];
}

describe('handleMeuPedido', () => {
  beforeEach(() => {
    _replies.length = 0;
    _nextRows = [];
  });

  it('sem pedidos → content MY_REQUEST_NONE (raw text)', async () => {
    _nextRows = [];
    await handleMeuPedido(makeInteraction());
    const r = lastReply();
    assert.ok(r.content);
    assert.match(r.content, /nunca pediste tag/i);
  });

  it('pendente → embed amarelo com título pending', async () => {
    _nextRows = [
      {
        status: 'pending',
        full_name: 'João Silva',
        nickname: 'Jack',
        created_at: new Date('2026-04-10T10:00:00Z'),
        resolved_at: null,
        denial_reason: null,
        channel_create_failed: false,
        member_channel: null,
      },
    ];
    await handleMeuPedido(makeInteraction());
    const r = lastReply();
    assert.ok(r.embeds?.length === 1);
    const embed = r.embeds[0].data;
    assert.equal(embed.color, 0xf39c12);
    assert.match(embed.title, /análise/i);
    assert.match(embed.description, /João Silva/);
    assert.match(embed.description, /Jack/);
    assert.match(embed.description, /aguardar chefia/i);
  });

  it('aprovado com canal → embed verde com canal link', async () => {
    _nextRows = [
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
    assert.doesNotMatch(embed.description, /ainda não existe/i);
  });

  it('aprovado mas channel_create_failed → warning visível', async () => {
    _nextRows = [
      {
        status: 'approved',
        full_name: 'Zé',
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
    assert.match(embed.description, /ainda não existe/i);
  });

  it('negado com razão → embed vermelho + razão visível', async () => {
    _nextRows = [
      {
        status: 'denied',
        full_name: 'Ninguém',
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
    assert.match(embed.title, /negado/i);
    assert.match(embed.description, /nome inadequado/);
  });

  it('negado sem razão → embed vermelho sem bloco de razão', async () => {
    _nextRows = [
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
    assert.doesNotMatch(embed.description, /Razão/);
    assert.match(embed.description, /reapelar/i);
  });

  it('estado desconhecido → fallback content', async () => {
    _nextRows = [
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
