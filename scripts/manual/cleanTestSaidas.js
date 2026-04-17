'use strict';
/**
 * Limpa dados de teste de saídas.
 * Remove TODAS as saídas e dados associados (participantes, materiais).
 *
 * Uso:
 *   DATABASE_URL=... node scripts/manual/cleanTestSaidas.js
 *   -- ou via Railway: railway run node scripts/manual/cleanTestSaidas.js
 */

const { pool } = require('../../src/db');

async function main() {
  const client = await pool.connect();
  try {
    console.log('[CLEAN] A limpar dados de teste de saídas...\n');

    // Ver o que existe antes de apagar
    const before = await client.query(`
      SELECT id, date, spot, operation_type, status, result
      FROM operations ORDER BY id
    `);
    if (!before.rows.length) {
      console.log('[CLEAN] Sem saídas na base de dados. Nada a limpar.');
      return;
    }

    console.log(`[CLEAN] ${before.rows.length} saída(s) encontrada(s):`);
    for (const s of before.rows) {
      console.log(`  #${s.id} — ${s.operation_type} · ${s.spot || '—'} · ${s.status} · ${s.result || '—'} · ${s.date}`);
    }

    await client.query('BEGIN');

    // 1. Apagar materiais das saídas
    const matDel = await client.query('DELETE FROM operation_materials');
    console.log(`\n[CLEAN] operation_materials: ${matDel.rowCount} row(s) removida(s)`);

    // 2. Apagar participantes
    const partDel = await client.query('DELETE FROM operation_participants');
    console.log(`[CLEAN] operation_participants: ${partDel.rowCount} row(s) removida(s)`);

    // 3. Apagar movimentos de inventário ligados a saídas
    const invDel = await client.query(`DELETE FROM inventory_movements WHERE saida_id IS NOT NULL`);
    console.log(`[CLEAN] inventory_movements (saída): ${invDel.rowCount} row(s) removida(s)`);

    // 4. Apagar kills ligados a saídas
    const killDel = await client.query(`DELETE FROM kill_logs WHERE saida_id IS NOT NULL`);
    console.log(`[CLEAN] kill_logs (saída): ${killDel.rowCount} row(s) removida(s)`);

    // 5. Apagar saídas
    const opDel = await client.query('DELETE FROM operations');
    console.log(`[CLEAN] operations: ${opDel.rowCount} row(s) removida(s)`);

    // 6. Limpar spot_stats
    const spotDel = await client.query('DELETE FROM spot_stats');
    console.log(`[CLEAN] spot_stats: ${spotDel.rowCount} row(s) removida(s)`);

    // 7. Limpar member_saida_stats
    const mssDel = await client.query('DELETE FROM member_saida_stats');
    console.log(`[CLEAN] member_saida_stats: ${mssDel.rowCount} row(s) removida(s)`);

    // 8. Limpar audit logs de saídas
    const auditDel = await client.query(`DELETE FROM audit_logs WHERE entity_type = 'saida'`);
    console.log(`[CLEAN] audit_logs (saída): ${auditDel.rowCount} row(s) removida(s)`);

    await client.query('COMMIT');
    console.log('\n[CLEAN] Limpeza concluída com sucesso. Dados de teste removidos.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[CLEAN] ERRO:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
