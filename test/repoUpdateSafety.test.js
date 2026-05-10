'use strict';
/**
 * Regressão: o bug "multiple assignments to same column 'updated_at'"
 * aconteceu porque saidaRepo.updateStatus e memberRepo.update adicionam
 * `updated_at = NOW()` sempre no SET, e iteravam extras sem filtrar —
 * se o caller passasse updated_at no payload, o SQL ficava inválido.
 *
 * Esta suíte intercepta a query antes de correr contra a DB e valida:
 *   - `updated_at` aparece exactamente 1 vez no SET
 *   - `updated_at = NOW()` está lá (não foi perdido)
 *   - os outros fields chegam com placeholders correctos
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

// Capturador de queries — regista todas as chamadas para podermos
// inspeccionar o SQL final.
const _captured = [];
require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async (sql, values) => {
      _captured.push({ sql, values });
      return { rows: [{ id: 1 }] };
    },
    queryWithTransaction: async fn =>
      fn({
        query: async (sql, values) => {
          _captured.push({ sql, values });
          return { rows: [{ id: 1 }] };
        },
      }),
  },
};

const saidaRepo = require('../src/repositories/saida');
const memberRepo = require('../src/repositories/member');

function countOccurrences(str, substr) {
  return str.split(substr).length - 1;
}

describe('repository update — updated_at safety', () => {
  beforeEach(() => {
    _captured.length = 0;
  });

  it('saidaRepo.updateStatus — updated_at=NOW() aparece 1 vez mesmo se extras tem updated_at', async () => {
    await saidaRepo.updateStatus(1, 'em_liquidacao', {
      result: 'sem_conflito',
      updated_at: new Date(), // ← o que causava o bug
    });
    const last = _captured[_captured.length - 1];
    assert.ok(last, 'query foi emitida');
    assert.equal(countOccurrences(last.sql, 'updated_at'), 1, 'updated_at deve aparecer 1x no SET');
    assert.match(last.sql, /updated_at = NOW\(\)/, 'deve manter NOW()');
    // values devem ser: [status, result, id] — SEM o new Date() do updated_at.
    assert.equal(last.values.length, 3);
  });

  it('saidaRepo.updateStatus — status não é duplicado se for passado nos extras', async () => {
    await saidaRepo.updateStatus(1, 'criada', { status: 'seria_bug' });
    const last = _captured[_captured.length - 1];
    assert.equal(countOccurrences(last.sql, 'status = $'), 1);
  });

  it('saidaRepo.updateStatus — extras normais passam através sem problema', async () => {
    await saidaRepo.updateStatus(1, 'concluida', {
      result: 'vitoria',
      had_fight: true,
    });
    const last = _captured[_captured.length - 1];
    assert.equal(countOccurrences(last.sql, 'updated_at'), 1);
    assert.match(last.sql, /result = \$\d+/);
    assert.match(last.sql, /had_fight = \$\d+/);
    assert.equal(last.values.length, 4); // status, result, had_fight, id
  });

  it('memberRepo.update — updated_at=NOW() aparece 1 vez mesmo se fields tem updated_at', async () => {
    await memberRepo.update(1, {
      display_name: 'Novo',
      updated_at: new Date(),
    });
    const last = _captured[_captured.length - 1];
    assert.equal(countOccurrences(last.sql, 'updated_at'), 1);
    assert.match(last.sql, /updated_at = NOW\(\)/);
    assert.equal(last.values.length, 2); // display_name, id
  });

  it('memberRepo.update — fields normais passam através', async () => {
    await memberRepo.update(1, {
      display_name: 'X',
      nickname: 'Y',
      channel_id: 'abc',
    });
    const last = _captured[_captured.length - 1];
    assert.equal(countOccurrences(last.sql, 'updated_at'), 1);
    assert.equal(last.values.length, 4); // display_name, nickname, channel_id, id
  });
});
