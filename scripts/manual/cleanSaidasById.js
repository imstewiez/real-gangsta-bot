'use strict';
/**
 * Apaga saídas específicas por ID, com tudo relacionado (participants,
 * materials, inventory_movements via saida_id, audit_logs, kill_logs).
 * Mantém saídas não listadas intactas + reset incremental de stats dos
 * membros e spots afectados (incremental_decrement).
 *
 * Uso:
 *   DELETE_SAIDA_IDS="12,15,17" node scripts/manual/cleanSaidasById.js
 *   railway run DELETE_SAIDA_IDS="12,15,17" node scripts/manual/cleanSaidasById.js
 *
 * Transacção atómica — se algo falha, ROLLBACK.
 * IRREVERSÍVEL após COMMIT.
 */

const { pool } = require('../../src/db');

async function main() {
  const raw = process.env.DELETE_SAIDA_IDS;
  if (!raw) {
    console.error('Uso: DELETE_SAIDA_IDS="1,2,3" node scripts/manual/cleanSaidasById.js');
    process.exit(1);
  }
  const ids = raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!ids.length) {
    console.error('Sem IDs válidos em DELETE_SAIDA_IDS.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log(`=== LIMPEZA ESPECÍFICA — ${ids.length} saída(s) ===\n`);

    // Preview antes da transacção
    const preview = await client.query(
      `SELECT id, date, spot, operation_type, status, result
         FROM operations WHERE id = ANY($1::int[]) ORDER BY id`,
      [ids]
    );
    if (!preview.rows.length) {
      console.log('Nenhuma saída encontrada com os IDs fornecidos. Nada a fazer.');
      await pool.end();
      return;
    }
    console.log('Vou apagar:');
    for (const s of preview.rows) {
      console.log(`  #${s.id} — ${s.operation_type} · ${s.spot || '—'} · ${s.status} · ${s.result || '—'} · ${s.date}`);
    }
    const missing = ids.filter(id => !preview.rows.find(r => r.id === id));
    if (missing.length) {
      console.log(`\n⚠ IDs não encontrados (ignorados): ${missing.join(', ')}`);
    }
    console.log('');

    await client.query('BEGIN');

    // Material económico de cada participante — para reverter stats depois
    const participantsAffected = await client.query(
      `SELECT DISTINCT member_id FROM operation_participants WHERE operation_id = ANY($1::int[])`,
      [ids]
    );
    const memberIdsAffected = participantsAffected.rows.map(r => r.member_id).filter(Boolean);

    const spotsAffected = await client.query(
      `SELECT DISTINCT spot FROM operations WHERE id = ANY($1::int[]) AND spot IS NOT NULL AND spot != ''`,
      [ids]
    );
    const spotsList = spotsAffected.rows.map(r => r.spot);

    // 1. inventory_movements com saida_id nas listadas
    const r1 = await client.query(`DELETE FROM inventory_movements WHERE saida_id = ANY($1::int[])`, [ids]);
    console.log(`inventory_movements (saida_id):    ${r1.rowCount} apagados`);

    // 2. operation_materials
    const r2 = await client.query(`DELETE FROM operation_materials WHERE operation_id = ANY($1::int[])`, [ids]);
    console.log(`operation_materials:               ${r2.rowCount} apagados`);

    // 3. operation_participants
    const r3 = await client.query(`DELETE FROM operation_participants WHERE operation_id = ANY($1::int[])`, [ids]);
    console.log(`operation_participants:            ${r3.rowCount} apagados`);

    // 4. kill_logs ligadas às saídas (se a tabela tem operation_id/saida_id)
    const killCol = await client.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'kill_logs' AND column_name IN ('saida_id','operation_id')
    `);
    if (killCol.rows.length) {
      const col = killCol.rows[0].column_name;
      const r4 = await client.query(`DELETE FROM kill_logs WHERE ${col} = ANY($1::int[])`, [ids]);
      console.log(`kill_logs (${col}):           ${r4.rowCount} apagados`);
    }

    // 5. audit_logs relacionados
    const r5 = await client.query(
      `DELETE FROM audit_logs
        WHERE entity_type IN ('saida','operation','participant')
          AND entity_id = ANY($1::text[])`,
      [ids.map(String)]
    );
    console.log(`audit_logs:                        ${r5.rowCount} apagados`);

    // 6. operations
    const r6 = await client.query(`DELETE FROM operations WHERE id = ANY($1::int[])`, [ids]);
    console.log(`operations:                        ${r6.rowCount} apagadas`);

    // 7. Recompute stats agregadas (spot_stats, member_saida_stats, rankings)
    //    via full recompute — mais seguro que decrements manuais e evita drift.
    if (memberIdsAffected.length || spotsList.length) {
      console.log('\nA recomputar agregados (monthly + all-time)...');
      const { computeMonthlyRankings, recomputeAllTimeStats } = require('../../src/rankings/monthlyRankingEngine');
      await computeMonthlyRankings().catch(e => console.warn(`  monthly: ${e.message}`));
      await recomputeAllTimeStats().catch(e => console.warn(`  all-time: ${e.message}`));
      // Nota: spot_stats e member_saida_stats acumulam via applyIncrement no
      // finalizeSaida — sem recompute full. Reset dos membros/spots afectados
      // é a forma segura: a próxima saída recompoe incrementalmente.
      if (memberIdsAffected.length) {
        const rReset = await client.query(`DELETE FROM member_saida_stats WHERE member_id = ANY($1::int[])`, [
          memberIdsAffected,
        ]);
        console.log(`member_saida_stats reset:          ${rReset.rowCount} rows (${memberIdsAffected.length} membros)`);
      }
      if (spotsList.length) {
        const rSpot = await client.query(`DELETE FROM spot_stats WHERE spot = ANY($1::text[])`, [spotsList]);
        console.log(`spot_stats reset:                  ${rSpot.rowCount} rows (${spotsList.length} spots)`);
      }
    }

    await client.query('COMMIT');
    console.log('\n✓ Limpeza concluída. Saídas listadas foram apagadas; restantes ficaram intactas.');
    console.log('  Próximo sync de sheets reflecte o estado actual.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n✖ ERRO — ROLLBACK feito:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
