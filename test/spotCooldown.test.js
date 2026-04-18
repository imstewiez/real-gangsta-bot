'use strict';
/**
 * Unit tests para spotCooldown engine.
 *
 * Cobre:
 *   - getStatus devolve { active: false } sem rows
 *   - getStatus devolve { active: true, remainingMs } quando expires_at > NOW()
 *   - startCooldown faz INSERT e tenta postar notificação
 *   - startCooldown com client ausente não parte
 *   - runExpirer limpa rows expirados
 *   - formatRemaining retorna "X min" razoável
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';
process.env.SPOT_COOLDOWN_CHANNEL_ID ||= '12345678901234567';

function resolvedPath(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

// ── Stub DB com queries capturadas ──
const _queries = [];
let _nextRows = [];
require.cache[resolvedPath('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async (sql, values) => {
      _queries.push({ sql, values });
      return { rows: _nextRows.shift() || [] };
    },
  },
};

const spotCooldown = require('../src/saidas/spotCooldown');

describe('spotCooldown.getStatus', () => {
  beforeEach(() => {
    _queries.length = 0;
    _nextRows.length = 0;
  });

  it('devolve { active: false } quando não há rows', async () => {
    _nextRows.push([]);
    const r = await spotCooldown.getStatus('Spot X');
    assert.equal(r.active, false);
  });

  it('devolve { active: true, remainingMs, saidaId } quando há row activo', async () => {
    const future = new Date(Date.now() + 15 * 60_000);
    _nextRows.push([{ spot: 'Spot X', started_at: new Date(), expires_at: future, saida_id: 42 }]);
    const r = await spotCooldown.getStatus('Spot X');
    assert.equal(r.active, true);
    assert.equal(r.saidaId, 42);
    assert.ok(r.remainingMs > 0);
    assert.ok(r.remainingMs <= 15 * 60_000 + 100);
  });

  it('spot vazio/null → { active: false } sem query', async () => {
    const r1 = await spotCooldown.getStatus(null);
    const r2 = await spotCooldown.getStatus('');
    assert.equal(r1.active, false);
    assert.equal(r2.active, false);
    assert.equal(_queries.length, 0);
  });
});

describe('spotCooldown.startCooldown', () => {
  beforeEach(() => {
    _queries.length = 0;
    _nextRows.length = 0;
    spotCooldown.setClient(null); // sem client = só escreve DB, não notifica
  });

  it('UPSERT na DB com expires_at correcto', async () => {
    const before = Date.now();
    const r = await spotCooldown.startCooldown({
      spot: 'Bairro Novo',
      saidaId: 99,
      minutes: 10,
    });
    const after = Date.now();

    // Primeiro query deve ser o INSERT/UPSERT.
    assert.ok(_queries.length >= 1);
    const insertSql = _queries[0].sql;
    assert.match(insertSql, /INSERT INTO spot_cooldowns/);
    assert.match(insertSql, /ON CONFLICT \(spot\) DO UPDATE/);

    // expires_at enviado deve ser ~10min no futuro.
    const expiresAtParam = _queries[0].values[1];
    const expectedMin = before + 10 * 60_000;
    const expectedMax = after + 10 * 60_000 + 100;
    assert.ok(expiresAtParam.getTime() >= expectedMin);
    assert.ok(expiresAtParam.getTime() <= expectedMax);

    assert.ok(r.expiresAt instanceof Date);
    assert.equal(r.messageId, null, 'sem client → sem msg');
  });

  it('spot vazio → no-op', async () => {
    const r = await spotCooldown.startCooldown({ spot: '', saidaId: 1 });
    assert.equal(r.messageId, null);
    assert.equal(_queries.length, 0);
  });

  it('usa default de CONFIG se minutes não fornecido', async () => {
    const before = Date.now();
    await spotCooldown.startCooldown({ spot: 'Default Test', saidaId: 1 });
    const expiresAtParam = _queries[0].values[1];
    // Default é 30min.
    assert.ok(expiresAtParam.getTime() >= before + 29 * 60_000);
    assert.ok(expiresAtParam.getTime() <= before + 31 * 60_000);
  });
});

describe('spotCooldown.runExpirer', () => {
  beforeEach(() => {
    _queries.length = 0;
    _nextRows.length = 0;
    spotCooldown.setClient(null);
  });

  it('sem expired → 0 cleaned', async () => {
    _nextRows.push([]); // select expired
    const r = await spotCooldown.runExpirer();
    assert.equal(r.cleaned, 0);
  });

  it('com 2 expired → delete de cada + cleaned = 2', async () => {
    _nextRows.push([
      { spot: 'A', saida_id: 1, notification_channel_id: null, notification_msg_id: null },
      { spot: 'B', saida_id: 2, notification_channel_id: null, notification_msg_id: null },
    ]);
    _nextRows.push([]); // delete A
    _nextRows.push([]); // delete B
    const r = await spotCooldown.runExpirer();
    assert.equal(r.cleaned, 2);
    const deletes = _queries.filter(q => q.sql.includes('DELETE FROM spot_cooldowns'));
    assert.equal(deletes.length, 2);
  });
});

describe('spotCooldown.formatRemaining', () => {
  it('< 1 min → "menos de 1 min"', () => {
    assert.equal(spotCooldown.formatRemaining(30_000), 'menos de 1 min');
  });

  it('arredonda para cima em minutos', () => {
    assert.equal(spotCooldown.formatRemaining(90_000), '2 min');
    assert.equal(spotCooldown.formatRemaining(5 * 60_000), '5 min');
    assert.equal(spotCooldown.formatRemaining(29 * 60_000 + 30_000), '30 min');
  });
});
