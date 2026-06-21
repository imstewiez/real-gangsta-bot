'use strict';
/**
 * Integration test end-to-end do fluxo de saída (I-3).
 *
 * Exercita o happy path completo com DB real:
 *   1. createSaida → valida row em operations + spot_cooldowns
 *   2. Tenta criar 2ª no mesmo spot → SPOT_COOLDOWN error
 *   3. Adiciona 2 participantes (caracterizado + trabalhador)
 *   4. Fornece material ao caracterizado
 *   5. closeSaida → em_liquidacao + metadata de resultado
 *   6. updateParticipantResult para cada participante
 *   7. finalizeSaida → concluida + scoring + MVP
 *   8. Valida side-effects: operations, participants, spot_stats,
 *      member_saida_stats, audit_logs
 *
 * Skip se DATABASE_URL não existe. Corre em ~2-5s.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { haveDb, cleanState } = require('./_helpers');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';

if (!haveDb()) {
  describe('integration/saidaFlow', { skip: 'DATABASE_URL em falta' }, () => {});
  return;
}

const { query, pool } = require('../../src/db');

// Stubs Discord — saidaEngine emite eventos + usa client para notificações.
// Substituir os getters no engine evita chamadas reais à Discord API.
const saidaEngine = require('../../src/saidas/saidaEngine');
const saidaRepo = require('../../src/repositories/saida');
const spotCooldown = require('../../src/saidas/spotCooldown');

function makeNoopClient() {
  return {
    channels: { fetch: async () => null },
    guilds: { cache: { get: () => null } },
  };
}

describe('integration/saidaFlow — end-to-end', () => {
  const STAFF_ID = 'saidaflow-staff';
  const PART_A_ID = 'saidaflow-part-a'; // caracterizado
  const PART_B_ID = 'saidaflow-part-b'; // trabalhador
  const SPOT = 'smoke-spot-1';
  const TODAY = new Date().toISOString().slice(0, 10);

  let _itemId;
  let _saidaId;

  before(async () => {
    await cleanState(query);
    // Stubar o client injectado (spotCooldown + saidaEngine usam client para
    // notificações Discord — no test, fire-and-forget para null).
    saidaEngine.setClient(makeNoopClient());
    spotCooldown.setClient(makeNoopClient());

    // Criar item.
    await query(
      `INSERT INTO items (name, category, unit, estimated_value, active)
       VALUES ('saidaflow-item', 'outros', 'unidade', 100, true)`
    );
    const i = await query("SELECT id FROM items WHERE name = 'saidaflow-item'");
    _itemId = i.rows[0].id;

    // Criar 3 membros.
    for (const id of [STAFF_ID, PART_A_ID, PART_B_ID]) {
      await query(
        `INSERT INTO members (discord_id, username, display_name, role, tier)
         VALUES ($1, $1, $1, 'bairrista', 'young_blood')`,
        [id]
      );
    }
  });

  after(async () => {
    // Order matters: FKs em operations / operation_participants.
    if (_saidaId) {
      await query('DELETE FROM operation_participants WHERE operation_id = $1', [_saidaId]);
      await query('DELETE FROM operation_materials WHERE operation_id = $1', [_saidaId]);
      await query('DELETE FROM inventory_movements WHERE saida_id = $1', [_saidaId]);
      await query('DELETE FROM operations WHERE id = $1', [_saidaId]);
    }
    await query('DELETE FROM spot_cooldowns WHERE spot = $1', [SPOT]);
    await query('DELETE FROM spot_stats WHERE spot = $1', [SPOT]);
    await query('DELETE FROM audit_logs WHERE entity_id::text IN ($1, $2, $3)', [STAFF_ID, PART_A_ID, PART_B_ID]);
    await query('DELETE FROM members WHERE discord_id IN ($1, $2, $3)', [STAFF_ID, PART_A_ID, PART_B_ID]);
    await query("DELETE FROM items WHERE name = 'saidaflow-item'");
    await pool.end();
  });

  it('1. createSaida cria row em operations + inicia cooldown do spot', async () => {
    const s = await saidaEngine.createSaida({
      date: TODAY,
      scheduledTime: '20:00',
      spot: SPOT,
      saidaType: 'outra',
      leaderDiscordId: STAFF_ID,
      groupNumber: 1,
      maxParticipants: 12,
      notes: 'teste integração',
      createdBy: STAFF_ID,
    });
    assert.ok(s.id, 'saída deve ter id');
    assert.equal(s.spot, SPOT);
    _saidaId = s.id;

    // spot_cooldowns upserted
    const cd = await query('SELECT spot, expires_at, saida_id FROM spot_cooldowns WHERE spot = $1', [SPOT]);
    assert.equal(cd.rows.length, 1);
    assert.equal(cd.rows[0].saida_id, _saidaId);
    assert.ok(new Date(cd.rows[0].expires_at).getTime() > Date.now());
  });

  it('2. tentar criar 2ª saída no mesmo spot durante cooldown → SPOT_COOLDOWN', async () => {
    await assert.rejects(
      () =>
        saidaEngine.createSaida({
          date: TODAY,
          spot: SPOT,
          saidaType: 'outra',
          leaderDiscordId: STAFF_ID,
          groupNumber: 2,
          maxParticipants: 12,
          notes: 'deve falhar',
          createdBy: STAFF_ID,
        }),
      err => {
        assert.equal(err.code, 'SPOT_COOLDOWN');
        assert.match(err.message, /cooldown/i);
        return true;
      }
    );

    // Com force=true deve passar — mas cria concorrente, não queremos para este test.
    // Ver issue #2 para lock distinto (promoção); spot cooldown é independente.
  });

  it('3. addParticipant — 1 caracterizado + 1 trabalhador', async () => {
    // Caracterizado com arma (usa _itemId como "arma" proxy).
    const pA = await saidaEngine.addParticipant(
      _saidaId,
      PART_A_ID,
      {
        participantType: 'caracterizado',
        weaponItemId: _itemId,
        ownWeapon: true,
      },
      STAFF_ID
    );
    assert.ok(pA.id);

    const pB = await saidaEngine.addParticipant(_saidaId, PART_B_ID, { participantType: 'trabalhador' }, STAFF_ID);
    assert.ok(pB.id);

    // Duplicate → rejeitado.
    await assert.rejects(
      () => saidaEngine.addParticipant(_saidaId, PART_A_ID, { participantType: 'caracterizado' }, STAFF_ID),
      /já estás inscrito/i
    );

    const r = await query('SELECT COUNT(*)::int AS n FROM operation_participants WHERE operation_id = $1', [_saidaId]);
    assert.equal(r.rows[0].n, 2);
  });

  it('4. issueMaterialToParticipant fornece material com cadeia de custódia', async () => {
    await saidaEngine.issueMaterialToParticipant(_saidaId, PART_A_ID, _itemId, 10, STAFF_ID, 'kit para saída');

    // Regista movimento fornecimento_org.
    const mov = await query(
      `SELECT movement_type, quantity FROM inventory_movements
       WHERE saida_id = $1 AND movement_type = 'fornecimento_org'`,
      [_saidaId]
    );
    assert.equal(mov.rows.length, 1);
    assert.equal(mov.rows[0].quantity, 10);

    // operation_materials regista como "fornecido".
    const mat = await query(
      `SELECT SUM(quantity)::int AS total FROM operation_materials
       WHERE operation_id = $1 AND direction = 'fornecido'`,
      [_saidaId]
    );
    assert.equal(mat.rows[0].total, 10);
  });

  it('5. closeSaida transita em_liquidacao + guarda metadata', async () => {
    // Avançar pelo state machine: criada → trancagem → em_preparacao → em_curso
    await saidaRepo.updateStatus(_saidaId, 'trancagem');
    await saidaRepo.updateStatus(_saidaId, 'em_preparacao');
    await saidaEngine.startSaida(_saidaId, STAFF_ID);

    await saidaEngine.closeSaida(
      _saidaId,
      {
        result: 'vitoria',
        had_fight: true,
        had_craft: false,
        enemy_name: 'Rivais',
        enemy_faction: 'Rivais',
        craft_amount: 0,
        result_notes: 'teste',
      },
      STAFF_ID
    );
    const r = await query('SELECT status, result, enemy_name FROM operations WHERE id = $1', [_saidaId]);
    assert.equal(r.rows[0].status, 'em_liquidacao');
    assert.equal(r.rows[0].result, 'vitoria');
    assert.equal(r.rows[0].enemy_name, 'Rivais');

    // Audit registado.
    const aud = await query(
      "SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'saida_em_liquidacao' AND entity_id = $1",
      [String(_saidaId)]
    );
    assert.ok(aud.rows[0].n >= 1);
  });

  it('6. updateParticipantResult para cada — kills + sobrevivência', async () => {
    await saidaEngine.updateParticipantResult(
      _saidaId,
      PART_A_ID,
      { kills: 3, died: false, weapon_return_status: 'declared_returned' },
      STAFF_ID
    );
    await saidaEngine.updateParticipantResult(_saidaId, PART_B_ID, { kills: 1, died: false }, STAFF_ID);
    const r = await query(
      `SELECT m.discord_id, op.kills, op.died
         FROM operation_participants op
         JOIN members m ON m.id = op.member_id
        WHERE op.operation_id = $1
        ORDER BY m.discord_id`,
      [_saidaId]
    );
    assert.equal(r.rows.length, 2);
    const byId = Object.fromEntries(r.rows.map(row => [row.discord_id, row]));
    assert.equal(byId[PART_A_ID].kills, 3);
    assert.equal(byId[PART_B_ID].kills, 1);
    assert.equal(byId[PART_A_ID].died, false);
  });

  it('7. finalizeSaida → concluida + valores económicos + MVP', async () => {
    const r = await saidaEngine.finalizeSaida(_saidaId, STAFF_ID);
    assert.ok(r, 'finalizeSaida deve devolver saida');

    // Status final.
    const op = await query('SELECT status, our_kills, net_value FROM operations WHERE id = $1', [_saidaId]);
    assert.equal(op.rows[0].status, 'concluida');
    assert.equal(op.rows[0].our_kills, 4, '3 + 1 = 4 kills totais');

    // Exactamente 1 MVP (dos 2 participantes).
    const mvp = await query(
      'SELECT COUNT(*)::int AS n FROM operation_participants WHERE operation_id = $1 AND mvp_flag = true',
      [_saidaId]
    );
    assert.equal(mvp.rows[0].n, 1, 'exactamente 1 MVP');

    // performance_score populado para todos.
    const scored = await query(
      'SELECT COUNT(*)::int AS n FROM operation_participants WHERE operation_id = $1 AND performance_score IS NOT NULL',
      [_saidaId]
    );
    assert.equal(scored.rows[0].n, 2);
  });

  it('8. spot_stats + member_saida_stats actualizados após finalize', async () => {
    const spot = await query('SELECT spot, total_saidas FROM spot_stats WHERE spot = $1', [SPOT]);
    assert.equal(spot.rows.length, 1);
    assert.ok(spot.rows[0].total_saidas >= 1);

    const mStats = await query(
      `SELECT m.discord_id, mss.saidas_total
         FROM member_saida_stats mss
         JOIN members m ON m.id = mss.member_id
        WHERE m.discord_id = ANY($1)`,
      [[PART_A_ID, PART_B_ID]]
    );
    assert.ok(mStats.rows.length >= 1, 'pelo menos um participante com stats');
    for (const row of mStats.rows) {
      assert.ok(row.saidas_total >= 1);
    }
  });

  it('9. audit trail completo do fluxo', async () => {
    const r = await query(
      `SELECT action FROM audit_logs
        WHERE entity_id = $1
        ORDER BY created_at`,
      [String(_saidaId)]
    );
    const actions = r.rows.map(x => x.action);
    // Em alguma ordem: saida_created, saida_participant_added (×2),
    // saida_em_liquidacao. Finalize pode ou não gravar audit dedicado.
    assert.ok(actions.includes('saida_created'), 'saida_created ausente');
    assert.ok(actions.includes('saida_em_liquidacao'), 'saida_em_liquidacao ausente');
    const participantAdds = actions.filter(a => a === 'saida_participant_added').length;
    assert.equal(participantAdds, 2);
  });
});
