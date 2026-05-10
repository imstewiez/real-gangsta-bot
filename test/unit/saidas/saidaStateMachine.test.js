'use strict';
/**
 * Unit tests para saidaStateMachine — transições, metadados, estados terminais.
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolved(rel) {
  return require.resolve(path.join(__dirname, '..', '..', '..', 'src', rel));
}

const state = { status: 'criada' };

require.cache[resolved('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async () => ({ rows: [] }),
    queryWithTransaction: async fn => fn({ query: async () => ({ rows: [] }) }),
  },
};

require.cache[resolved('repositories/index.js')] = {
  exports: {
    saidaRepo: {
      findById: async id => (id === 999 ? null : { id, status: state.status }),
    },
  },
};

const {
  ALLOWED_TRANSITIONS,
  STATUS_METADATA,
  canTransition,
  assertTransition,
  getTerminalStates,
} = require('../../../src/saidas/saidaStateMachine');

describe('saidaStateMachine', () => {
  beforeEach(() => {
    state.status = 'criada';
  });

  it('ALLOWED_TRANSITIONS mapeia estados corretamente', () => {
    assert.ok(ALLOWED_TRANSITIONS.criada.has('trancagem'));
    assert.ok(ALLOWED_TRANSITIONS.criada.has('cancelada'));
    assert.ok(ALLOWED_TRANSITIONS.trancagem.has('em_preparacao'));
    assert.ok(ALLOWED_TRANSITIONS.em_curso.has('em_liquidacao'));
    assert.ok(ALLOWED_TRANSITIONS.em_liquidacao.has('concluida'));
    assert.ok(ALLOWED_TRANSITIONS.em_liquidacao.has('cancelada'));
    assert.equal(ALLOWED_TRANSITIONS.concluida.size, 0);
    assert.equal(ALLOWED_TRANSITIONS.cancelada.size, 0);
  });

  it('STATUS_METADATA tem cor e label para todos os estados', () => {
    for (const status of Object.keys(ALLOWED_TRANSITIONS)) {
      assert.ok(STATUS_METADATA[status], `metadata para ${status}`);
      assert.ok(STATUS_METADATA[status].label);
      assert.ok(STATUS_METADATA[status].color);
      assert.equal(typeof STATUS_METADATA[status].terminal, 'boolean');
    }
  });

  it('canTransition permite transições válidas', () => {
    assert.ok(canTransition('criada', 'trancagem'));
    assert.ok(canTransition('trancagem', 'em_preparacao'));
    assert.ok(canTransition('em_liquidacao', 'concluida'));
  });

  it('canTransition rejeita transições inválidas', () => {
    assert.equal(canTransition('concluida', 'criada'), false);
    assert.equal(canTransition('cancelada', 'em_curso'), false);
    assert.equal(canTransition('criada', 'criada'), false);
  });

  it('assertTransition retorna saida em transição válida', async () => {
    state.status = 'criada';
    const saida = await assertTransition(1, 'trancagem');
    assert.equal(saida.status, 'criada');
  });

  it('assertTransition rejeita transição para o mesmo estado', async () => {
    state.status = 'em_curso';
    await assert.rejects(assertTransition(1, 'em_curso'), /já está/);
  });

  it('assertTransition rejeita transição inválida', async () => {
    state.status = 'concluida';
    await assert.rejects(assertTransition(1, 'criada'), /Transição proibida/);
  });

  it('assertTransition rejeita saida inexistente', async () => {
    await assert.rejects(assertTransition(999, 'concluida'), /não existe/);
  });

  it('getTerminalStates retorna concluida e cancelada', () => {
    const terminals = getTerminalStates();
    assert.ok(terminals.includes('concluida'));
    assert.ok(terminals.includes('cancelada'));
    assert.equal(terminals.length, 2);
  });
});
