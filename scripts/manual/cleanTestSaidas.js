'use strict';
/**
 * Limpa TODOS os dados de saídas e combate (teste) da base de dados.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/manual/cleanTestSaidas.js
 *   -- ou via Railway: railway run node scripts/manual/cleanTestSaidas.js
 *
 * O que apaga:
 *   - operations + operation_participants + operation_materials (CASCADE)
 *   - kill_logs (todas — standalone e ligadas a saídas)
 *   - spot_stats, member_saida_stats
 *   - inventory_movements ligados a saídas + tipos de saída
 *   - audit_logs de saídas e kills
 *   - reset rankings (contadores de saída/kills/wins a zero)
 *   - reset sequences (IDs voltam a 1)
 *
 * IRREVERSÍVEL — só correr se os dados são de teste.
 */

const { pool } = require('../../src/db');

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== LIMPEZA DE DADOS DE TESTE — SAÍDAS & COMBATE ===\n');

    const before = await client.query(`
      SELECT id, date, spot, operation_type, status, result
      FROM operations ORDER BY id
    `);
    const killsBefore = await client.query(`SELECT COUNT(*)::int AS n FROM kill_logs`);

    if (!before.rows.length && killsBefore.rows[0].n === 0) {
      console.log('Sem saídas nem kills na base de dados. Nada a limpar.');
      await pool.end();
      return;
    }

    console.log(`${before.rows.length} saída(s) encontrada(s):`);
    for (const s of before.rows) {
      console.log(`  #${s.id} — ${s.operation_type} · ${s.spot || '—'} · ${s.status} · ${s.result || '—'} · ${s.date}`);
    }
    console.log(`${killsBefore.rows[0].n} kill(s) registada(s)\n`);

    await client.query('BEGIN');

    // 1. Movimentos de inventário ligados a saídas (por FK)
    const r1 = await client.query(`DELETE FROM inventory_movements WHERE saida_id IS NOT NULL`);
    console.log(`inventory_movements (saida_id):    ${r1.rowCount} apagados`);

    // 2. Movimentos de inventário de tipos de saída (sem FK mas semanticamente ligados)
    const r1b = await client.query(`
      DELETE FROM inventory_movements
      WHERE movement_type IN (
        'fornecimento_org',
        'devolucao_saida', 'devolucao_operacao',
        'perda_saida', 'perda_operacao',
        'consumo_saida', 'consumo_operacao'
      ) AND saida_id IS NULL
    `);
    console.log(`inventory_movements (tipos saída): ${r1b.rowCount} apagados`);

    // 3. Materiais das saídas
    const r2a = await client.query('DELETE FROM operation_materials');
    console.log(`operation_materials:               ${r2a.rowCount} apagados`);

    // 4. Participantes
    const r2b = await client.query('DELETE FROM operation_participants');
    console.log(`operation_participants:            ${r2b.rowCount} apagados`);

    // 5. Kill logs (TODAS — standalone e ligadas)
    const r3 = await client.query('DELETE FROM kill_logs');
    console.log(`kill_logs:                         ${r3.rowCount} apagados`);

    // 6. Saídas
    const r4 = await client.query('DELETE FROM operations');
    console.log(`operations:                        ${r4.rowCount} apagadas`);

    // 7. Stats agregadas
    const r5 = await client.query('DELETE FROM spot_stats');
    console.log(`spot_stats:                        ${r5.rowCount} apagados`);

    const r6 = await client.query('DELETE FROM member_saida_stats');
    console.log(`member_saida_stats:                ${r6.rowCount} apagados`);

    // 8. Audit logs de saídas e kills
    const r7 = await client.query(`
      DELETE FROM audit_logs
      WHERE entity_type IN ('saida', 'operation', 'kill', 'kill_log', 'participant')
         OR action LIKE '%saida%' OR action LIKE '%operation%' OR action LIKE '%kill%'
    `);
    console.log(`audit_logs (saída/kill):            ${r7.rowCount} apagados`);

    // 9. Reset contadores de saída nos rankings
    const r8 = await client.query(`
      UPDATE weekly_rankings SET
        operations_count = 0, wins_count = 0, loss_count = 0,
        kills_count = 0, net_profit_generated = 0,
        survival_rate = 0, performance_score = 0
    `);
    console.log(`weekly_rankings resetados:         ${r8.rowCount} rows`);

    const r9 = await client.query(`
      UPDATE monthly_rankings SET
        operations_count = 0, wins_count = 0, loss_count = 0,
        kills_count = 0, net_profit_generated = 0,
        survival_rate = 0, performance_score = 0
    `);
    console.log(`monthly_rankings resetados:        ${r9.rowCount} rows`);

    const r10 = await client.query(`
      UPDATE all_time_stats SET
        saidas_total = 0, wins = 0, losses = 0,
        kills_total = 0, deaths_total = 0,
        profit_generated = 0, mvp_count = 0
    `);
    console.log(`all_time_stats resetados:          ${r10.rowCount} rows`);

    // 10. Reset sequences
    await client.query(`ALTER SEQUENCE IF EXISTS operations_id_seq RESTART WITH 1`);
    await client.query(`ALTER SEQUENCE IF EXISTS kill_logs_id_seq RESTART WITH 1`);
    await client.query(`ALTER SEQUENCE IF EXISTS operation_participants_id_seq RESTART WITH 1`);
    await client.query(`ALTER SEQUENCE IF EXISTS operation_materials_id_seq RESTART WITH 1`);
    console.log(`sequences resetadas:               operations, kill_logs, participants, materials`);

    await client.query('COMMIT');
    console.log('\n✓ Limpeza concluída. Todos os dados de teste de saídas e combate foram removidos.');
    console.log('  O próximo sync de sheets vai reflectir as tabs vazias.');
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
