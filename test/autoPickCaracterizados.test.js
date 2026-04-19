'use strict';
/**
 * Unit tests para o algoritmo de auto-pick:
 *
 *   - score composto (kd × 3 + mvp + survival + arma × 2 + material × 0.5)
 *   - protected roles (chefia, patrao_di_zona) têm lugar reservado
 *   - ties desempatam por created_at (mais cedo ganha)
 *   - pedir_juntar pós-Iniciar: se hipotético score > pior caract, bate
 *   - expireStaleRequests é idempotente e só mexe em requested antigos
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolved(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

// Stub DB: stats por member_id devolvidos pelo JOIN member_saida_stats.
const _statsByMember = new Map();
const _capturedQueries = [];
function _setStats(memberId, stats) {
  _statsByMember.set(memberId, stats);
}
function _clearStats() {
  _statsByMember.clear();
  _capturedQueries.length = 0;
}

require.cache[resolved('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async (sql, values) => {
      _capturedQueries.push({ sql, values });
      // Query principal do _loadScoringData
      if (/FROM members m/.test(sql) && /member_saida_stats/.test(sql)) {
        const memberIds = values[0] || [];
        return {
          rows: memberIds.map(id => {
            const s = _statsByMember.get(id) || {};
            return {
              member_id: id,
              kd_ratio: s.kd ?? 0,
              mvp_count: s.mvp ?? 0,
              survival_rate: s.surv ?? 0,
              material_value: s.material ?? 0,
            };
          }),
        };
      }
      // Delete de requested stale
      if (/DELETE FROM operation_participants/.test(sql)) {
        return { rowCount: 1 };
      }
      // Expire query
      if (/participant_type = 'requested'/.test(sql) && /NOW\(\)/.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    },
    queryWithTransaction: async fn => fn({ query: async () => ({ rows: [] }) }),
  },
};

const { autoPickCaracterizados, _scoreParticipant } = require('../src/saidas/autoPickCaracterizados');

// ═══════════════════════════════════════════════════════════════════════════
// Score composto
// ═══════════════════════════════════════════════════════════════════════════

describe('autoPickCaracterizados — scoring', () => {
  it('arma própria dá bónus fixo de 2.0', () => {
    const p = { own_weapon: true };
    const s = _scoreParticipant(p, null);
    assert.equal(s, 2.0);
  });

  it('sem stats e sem arma = 0', () => {
    const s = _scoreParticipant({ own_weapon: false }, null);
    assert.equal(s, 0);
  });

  it('kd_ratio domina (peso 3)', () => {
    const s = _scoreParticipant(
      { own_weapon: false },
      { kd_ratio: 2, mvp_count: 0, survival_rate: 0, material_value: 0 }
    );
    assert.equal(s, 6.0);
  });

  it('material normaliza a 100k €', () => {
    const s = _scoreParticipant(
      { own_weapon: false },
      { kd_ratio: 0, mvp_count: 0, survival_rate: 0, material_value: 100000 }
    );
    assert.equal(s, 0.5);
  });

  it('material acima de 100k não ultrapassa peso max (capped a 1.0 × 0.5)', () => {
    const s = _scoreParticipant(
      { own_weapon: false },
      { kd_ratio: 0, mvp_count: 0, survival_rate: 0, material_value: 500000 }
    );
    assert.equal(s, 0.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Protected roles
// ═══════════════════════════════════════════════════════════════════════════

describe('autoPickCaracterizados — protected roles', () => {
  beforeEach(() => _clearStats());

  it('chefia entra sempre como caract, mesmo com score 0', async () => {
    _setStats(10, { kd: 0, mvp: 0, surv: 0, material: 0 });
    _setStats(20, { kd: 5, mvp: 5, surv: 1, material: 0 });
    const participants = [
      { member_id: 10, member_role: 'chefia', own_weapon: false, participant_type: 'pending', created_at: '2026-01-01' },
      { member_id: 20, member_role: 'bairrista', own_weapon: false, participant_type: 'pending', created_at: '2026-01-01' },
    ];
    const { caracterizados, trabalhadores } = await autoPickCaracterizados(participants, 1);
    // chefia tem lugar reservado; maxChar=1 → sobra 0 slots para competitive → bairrista fica trab
    assert.equal(caracterizados.length, 1);
    assert.equal(caracterizados[0].member_id, 10);
    assert.equal(trabalhadores.length, 1);
    assert.equal(trabalhadores[0].member_id, 20);
  });

  it('patrao_di_zona protegido; competitivos competem pelos slots restantes', async () => {
    _setStats(1, { kd: 10, mvp: 0, surv: 0, material: 0 });
    _setStats(2, { kd: 1, mvp: 0, surv: 0, material: 0 });
    const participants = [
      { member_id: 1, member_role: 'bairrista', own_weapon: false, participant_type: 'pending', created_at: '2026-01-01' },
      { member_id: 2, member_role: 'bairrista', own_weapon: false, participant_type: 'pending', created_at: '2026-01-01' },
      { member_id: 99, member_role: 'patrao_di_zona', own_weapon: false, participant_type: 'pending', created_at: '2026-01-01' },
    ];
    const { caracterizados, trabalhadores } = await autoPickCaracterizados(participants, 2);
    // 1 protected + 1 vaga → apenas kd=10 (member 1) vai. member 2 (kd=1) fica trab.
    const ids = caracterizados.map(c => c.member_id).sort();
    assert.deepEqual(ids, [1, 99]);
    assert.equal(trabalhadores.length, 1);
    assert.equal(trabalhadores[0].member_id, 2);
  });

  it('se protected excede maxChar, ainda entram todos (lugar reservado)', async () => {
    const participants = [
      { member_id: 1, member_role: 'chefia', own_weapon: false, participant_type: 'pending', created_at: '2026-01-01' },
      { member_id: 2, member_role: 'chefia', own_weapon: false, participant_type: 'pending', created_at: '2026-01-01' },
      { member_id: 3, member_role: 'patrao_di_zona', own_weapon: false, participant_type: 'pending', created_at: '2026-01-01' },
    ];
    const { caracterizados, trabalhadores } = await autoPickCaracterizados(participants, 1);
    assert.equal(caracterizados.length, 3);
    assert.equal(trabalhadores.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tie-breaker: created_at
// ═══════════════════════════════════════════════════════════════════════════

describe('autoPickCaracterizados — ties', () => {
  beforeEach(() => _clearStats());

  it('empate em score desempata por created_at asc', async () => {
    _setStats(1, { kd: 2, mvp: 0, surv: 0, material: 0 });
    _setStats(2, { kd: 2, mvp: 0, surv: 0, material: 0 });
    const participants = [
      { member_id: 1, member_role: 'bairrista', own_weapon: false, participant_type: 'pending', created_at: '2026-01-02T10:00:00Z' },
      { member_id: 2, member_role: 'bairrista', own_weapon: false, participant_type: 'pending', created_at: '2026-01-02T09:00:00Z' },
    ];
    const { caracterizados } = await autoPickCaracterizados(participants, 1);
    // member 2 inscreveu 1h antes → ganha o desempate
    assert.equal(caracterizados[0].member_id, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Empty + edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('autoPickCaracterizados — edge cases', () => {
  beforeEach(() => _clearStats());

  it('lista vazia devolve tudo vazio', async () => {
    const r = await autoPickCaracterizados([], 12);
    assert.equal(r.caracterizados.length, 0);
    assert.equal(r.trabalhadores.length, 0);
    assert.equal(r.scored.length, 0);
  });

  it('todos cabem (participants ≤ maxChar) → nenhum trabalhador', async () => {
    _setStats(1, { kd: 1, mvp: 0, surv: 0, material: 0 });
    _setStats(2, { kd: 2, mvp: 0, surv: 0, material: 0 });
    const participants = [
      { member_id: 1, member_role: 'bairrista', own_weapon: false, participant_type: 'pending', created_at: '2026-01-01' },
      { member_id: 2, member_role: 'bairrista', own_weapon: false, participant_type: 'pending', created_at: '2026-01-01' },
    ];
    const { caracterizados, trabalhadores } = await autoPickCaracterizados(participants, 12);
    assert.equal(caracterizados.length, 2);
    assert.equal(trabalhadores.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cenário hipotético: pedir_juntar pós-Iniciar com score superior
// ═══════════════════════════════════════════════════════════════════════════

describe('autoPickCaracterizados — cenário pedir_juntar (simula alerta)', () => {
  beforeEach(() => _clearStats());

  it('requester com kd alto bate pior caract actual', async () => {
    // Caracts actuais: kd=1, kd=2, kd=3 (maxChar=3).
    // Requester tem kd=5 — devia ficar dentro na hipótese.
    _setStats(1, { kd: 1, mvp: 0, surv: 0, material: 0 });
    _setStats(2, { kd: 2, mvp: 0, surv: 0, material: 0 });
    _setStats(3, { kd: 3, mvp: 0, surv: 0, material: 0 });
    _setStats(99, { kd: 5, mvp: 0, surv: 0, material: 0 });

    const currentCaracs = [
      { member_id: 1, member_role: 'bairrista', own_weapon: false, participant_type: 'caracterizado', created_at: '2026-01-01' },
      { member_id: 2, member_role: 'bairrista', own_weapon: false, participant_type: 'caracterizado', created_at: '2026-01-01' },
      { member_id: 3, member_role: 'bairrista', own_weapon: false, participant_type: 'caracterizado', created_at: '2026-01-01' },
    ];
    const newRequester = {
      member_id: 99,
      member_role: 'bairrista',
      own_weapon: false,
      participant_type: 'requested',
      created_at: '2026-01-02',
    };
    const hypothetical = [...currentCaracs, newRequester];
    const { caracterizados } = await autoPickCaracterizados(hypothetical, 3);
    const wouldBeat = caracterizados.some(c => c.member_id === 99);
    assert.equal(wouldBeat, true, 'requester com kd=5 devia entrar nos top 3');
    // Quem sai: member 1 (kd=1)
    const displaced = currentCaracs.find(c => !caracterizados.some(w => w.member_id === c.member_id));
    assert.equal(displaced.member_id, 1);
  });

  it('requester com kd baixo não bate — alerta não dispararia', async () => {
    _setStats(1, { kd: 3, mvp: 0, surv: 0, material: 0 });
    _setStats(2, { kd: 3, mvp: 0, surv: 0, material: 0 });
    _setStats(99, { kd: 0.5, mvp: 0, surv: 0, material: 0 });

    const currentCaracs = [
      { member_id: 1, member_role: 'bairrista', own_weapon: false, participant_type: 'caracterizado', created_at: '2026-01-01' },
      { member_id: 2, member_role: 'bairrista', own_weapon: false, participant_type: 'caracterizado', created_at: '2026-01-01' },
    ];
    const newRequester = {
      member_id: 99,
      member_role: 'bairrista',
      own_weapon: false,
      participant_type: 'requested',
      created_at: '2026-01-02',
    };
    const hypothetical = [...currentCaracs, newRequester];
    const { caracterizados } = await autoPickCaracterizados(hypothetical, 2);
    const wouldBeat = caracterizados.some(c => c.member_id === 99);
    assert.equal(wouldBeat, false, 'kd=0.5 não bate kd=3');
  });
});
