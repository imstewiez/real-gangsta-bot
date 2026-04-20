'use strict';
/**
 * Lista todas as saídas com meta agregada, flaga prováveis testes
 * (heurística: < 3 participantes OU sem kills/material) e imprime o
 * comando a correr para apagar as que escolheres.
 *
 * Uso:
 *   DATABASE_URL=... node scripts/manual/listSaidasForCleanup.js
 *   railway run node scripts/manual/listSaidasForCleanup.js
 *
 * Não apaga nada — só lista. Para apagar IDs específicos, corre o
 * cleanSaidasById.js (gerado com output desta script).
 */

const { pool } = require('../../src/db');

const MIN_REAL_PARTICIPANTS = Number(process.env.MIN_REAL_PARTICIPANTS || 3);

async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(`
      SELECT o.id, o.date, o.scheduled_time, o.spot, o.operation_type, o.status,
             o.result, o.created_by, m.display_name AS leader_name,
             o.our_kills, o.deaths, o.survivors, o.net_value,
             COUNT(DISTINCT op.member_id)::int AS participants_count,
             COUNT(DISTINCT om.id)::int AS material_lines,
             COALESCE(SUM(om.quantity), 0)::int AS material_qty,
             o.created_at
        FROM operations o
   LEFT JOIN operation_participants op ON op.operation_id = o.id
   LEFT JOIN operation_materials om    ON om.operation_id = o.id
   LEFT JOIN members m ON m.id = o.leader_id
       GROUP BY o.id, m.display_name
       ORDER BY o.date DESC, o.id DESC
    `);

    if (!r.rows.length) {
      console.log('Sem saídas na base de dados.');
      await pool.end();
      return;
    }

    console.log(`\n=== ${r.rows.length} saída(s) ===\n`);
    console.log(
      'ID  | Data       | Hora  | Status         | Resultado    | Part | Kills | Materiais    | Spot                     | Criada por'
    );
    console.log(
      '----|------------|-------|----------------|--------------|------|-------|--------------|--------------------------|---------'
    );

    const testIds = [];
    const realIds = [];
    for (const s of r.rows) {
      const participantes = s.participants_count;
      const kills = Number(s.our_kills) || 0;
      const material = Number(s.material_lines) || 0;
      const isLikelyTest =
        participantes < MIN_REAL_PARTICIPANTS ||
        (s.status !== 'concluida' && participantes < 2) ||
        (s.status === 'concluida' && kills === 0 && material === 0 && participantes < 3);

      const flag = isLikelyTest ? '⚠ TESTE?' : '✓ real  ';
      const idCol = String(s.id).padEnd(4);
      const dateCol = String(s.date || '').padEnd(10);
      const timeCol = String(s.scheduled_time || '—')
        .slice(0, 5)
        .padEnd(5);
      const statusCol = String(s.status || '').padEnd(14);
      const resultCol = String(s.result || '—').padEnd(12);
      const partCol = String(participantes).padEnd(4);
      const killsCol = String(kills).padEnd(5);
      const matCol = `${material}l/${s.material_qty}u`.padEnd(12);
      const spotCol = String(s.spot || '—')
        .slice(0, 24)
        .padEnd(24);
      const leader = s.leader_name || s.created_by || '—';

      console.log(
        `${idCol}| ${dateCol} | ${timeCol} | ${statusCol} | ${resultCol} | ${partCol} | ${killsCol} | ${matCol} | ${spotCol} | ${leader.slice(0, 18)}  ${flag}`
      );
      if (isLikelyTest) testIds.push(s.id);
      else realIds.push(s.id);
    }

    console.log(`\n${realIds.length} ✓ reais · ${testIds.length} ⚠ prováveis testes\n`);

    if (testIds.length) {
      console.log('🧹 Para apagar as prováveis testes (hard delete com cascade):');
      console.log('');
      console.log(`   DELETE_SAIDA_IDS="${testIds.join(',')}" node scripts/manual/cleanSaidasById.js`);
      console.log('');
      console.log('(revê a lista acima antes. Se alguma "TESTE?" for real, tira o ID antes de correr.)');
    }
    if (realIds.length) {
      console.log('Reais (mantidas se só correres o comando acima):');
      console.log(`   ${realIds.join(', ')}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('✖ ERRO:', err.message);
  process.exit(1);
});
