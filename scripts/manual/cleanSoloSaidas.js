'use strict';
/**
 * Apaga todas as saídas onde um membro específico foi o único participante
 * (ou o criador sem mais ninguém inscrito). Qualquer saída com 2+ membros
 * reais fica intacta.
 *
 * Uso:
 *   SOLO_DISCORD_ID=123456789 node scripts/manual/cleanSoloSaidas.js
 *   SOLO_DISCORD_ID=123456789 DRY_RUN=true node scripts/manual/cleanSoloSaidas.js
 *
 *   railway run SOLO_DISCORD_ID=123456789 node scripts/manual/cleanSoloSaidas.js
 *
 * Cascade:
 *   - operations + operation_participants + operation_materials
 *   - inventory_movements (saida_id)
 *   - kill_logs ligadas
 *   - audit_logs relacionados
 *   - member_saida_stats e spot_stats dos afectados (reset — recompoe no
 *     próximo finalizeSaida via applyIncrement)
 *   - recompute monthly + all-time rankings
 *
 * IRREVERSÍVEL após COMMIT. Corre DRY_RUN=true primeiro para preview.
 */

const { pool } = require('../../src/db');

async function main() {
  const soloDiscordId = process.env.SOLO_DISCORD_ID;
  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

  if (!soloDiscordId) {
    console.error('Uso: SOLO_DISCORD_ID=<discord_id> node scripts/manual/cleanSoloSaidas.js');
    console.error('       (adiciona DRY_RUN=true para preview sem apagar)');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    // Resolve member
    const mr = await client.query('SELECT id, display_name FROM members WHERE discord_id = $1', [soloDiscordId]);
    if (!mr.rows.length) {
      console.error(`Discord ID ${soloDiscordId} não existe em members.`);
      process.exit(1);
    }
    const member = mr.rows[0];
    console.log(`=== LIMPEZA DE SAÍDAS SOLO ${dryRun ? '(DRY RUN)' : ''} ===`);
    console.log(`Target: ${member.display_name} (${soloDiscordId}, member_id=${member.id})\n`);

    // Saídas "solo":
    //   (a) criador é o target E não há participantes
    //   (b) há apenas 1 participante distinct E esse participante é o target
    const r = await client.query(
      `
      WITH agg AS (
        SELECT o.id,
               o.date, o.spot, o.operation_type, o.status, o.result, o.created_by,
               COUNT(DISTINCT op.member_id)::int AS participants_count,
               BOOL_OR(op.member_id = $1) AS target_is_participant
          FROM operations o
          LEFT JOIN operation_participants op ON op.operation_id = o.id
         GROUP BY o.id
      )
      SELECT * FROM agg
       WHERE (participants_count = 0 AND created_by = $2)
          OR (participants_count = 1 AND target_is_participant = TRUE)
       ORDER BY id
      `,
      [member.id, soloDiscordId]
    );

    if (!r.rows.length) {
      console.log('Sem saídas solo encontradas. Nada a apagar.');
      await pool.end();
      return;
    }

    console.log(`${r.rows.length} saída(s) solo encontrada(s):`);
    for (const s of r.rows) {
      const who = s.participants_count === 0 ? 'criou e ninguém entrou' : '1 participante (só tu)';
      console.log(
        `  #${s.id} — ${s.operation_type} · ${s.spot || '—'} · ${s.status} · ${s.result || '—'} · ${s.date} · ${who}`
      );
    }
    console.log('');

    const ids = r.rows.map(row => row.id);

    if (dryRun) {
      console.log(`(DRY_RUN=true — não apaguei nada. Corre sem DRY_RUN para aplicar.)`);
      console.log(`\nComando para aplicar:`);
      console.log(`  railway run SOLO_DISCORD_ID=${soloDiscordId} node scripts/manual/cleanSoloSaidas.js`);
      await pool.end();
      return;
    }

    await client.query('BEGIN');

    const spotsAffected = await client.query(
      `SELECT DISTINCT spot FROM operations WHERE id = ANY($1::int[]) AND spot IS NOT NULL AND spot != ''`,
      [ids]
    );
    const spotsList = spotsAffected.rows.map(row => row.spot);

    const r1 = await client.query(`DELETE FROM inventory_movements WHERE saida_id = ANY($1::int[])`, [ids]);
    console.log(`inventory_movements (saida_id):    ${r1.rowCount} apagados`);

    const r2 = await client.query(`DELETE FROM operation_materials WHERE operation_id = ANY($1::int[])`, [ids]);
    console.log(`operation_materials:               ${r2.rowCount} apagados`);

    const r3 = await client.query(`DELETE FROM operation_participants WHERE operation_id = ANY($1::int[])`, [ids]);
    console.log(`operation_participants:            ${r3.rowCount} apagados`);

    // kill_logs — verifica se a tabela tem saida_id/operation_id
    const killCol = await client.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'kill_logs' AND column_name IN ('saida_id','operation_id')
       LIMIT 1
    `);
    if (killCol.rows.length) {
      const col = killCol.rows[0].column_name;
      const r4 = await client.query(`DELETE FROM kill_logs WHERE ${col} = ANY($1::int[])`, [ids]);
      console.log(`kill_logs (${col}):           ${r4.rowCount} apagados`);
    }

    // Kills do member onde não há saida ligada (standalone) — user disse "todos
    // os dados em todo o lado" — assumo que kills standalone do target
    // durante testes também devem ir. Filtra por created_by = soloDiscordId.
    const killerCol = await client.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'kill_logs' AND column_name IN ('killer_discord_id','created_by','member_id')
    `);
    if (killerCol.rows.some(c => c.column_name === 'killer_discord_id')) {
      const rKill = await client.query(
        `DELETE FROM kill_logs WHERE killer_discord_id = $1 AND ${
          killCol.rows.length
            ? `(${killCol.rows[0].column_name} IS NULL OR ${killCol.rows[0].column_name} = ANY($2::int[]))`
            : 'TRUE'
        }`,
        killCol.rows.length ? [soloDiscordId, ids] : [soloDiscordId]
      );
      console.log(`kill_logs standalone do target:    ${rKill.rowCount} apagados`);
    }

    const r5 = await client.query(
      `DELETE FROM audit_logs
        WHERE entity_type IN ('saida','operation','participant')
          AND entity_id = ANY($1::text[])`,
      [ids.map(String)]
    );
    console.log(`audit_logs:                        ${r5.rowCount} apagados`);

    const r6 = await client.query(`DELETE FROM operations WHERE id = ANY($1::int[])`, [ids]);
    console.log(`operations:                        ${r6.rowCount} apagadas`);

    // Reset stats do member e spots afectados — recompoe incremental no futuro
    const rReset = await client.query(`DELETE FROM member_saida_stats WHERE member_id = $1`, [member.id]);
    console.log(`member_saida_stats (target) reset: ${rReset.rowCount} rows`);

    if (spotsList.length) {
      const rSpot = await client.query(`DELETE FROM spot_stats WHERE spot = ANY($1::text[])`, [spotsList]);
      console.log(`spot_stats reset (${spotsList.length} spots):  ${rSpot.rowCount} rows`);
    }

    // Inventory movements standalone do target para tipos de saída (ex: se
    // criaste saída, forneceste material a ti próprio, e saída foi cancelada
    // — o movement não tinha saida_id link mas é semanticamente teste). Só
    // apaga se member_id = target E movement_type é de saída.
    const rInvStandalone = await client.query(
      `DELETE FROM inventory_movements
        WHERE member_id = $1
          AND saida_id IS NULL
          AND movement_type IN ('fornecimento_org','devolucao_saida','perda_saida','consumo_saida')`,
      [member.id]
    );
    console.log(`inventory_movements standalone (saída types): ${rInvStandalone.rowCount} apagados`);

    await client.query('COMMIT');

    // Recompute rankings (fora da transacção — são módulos próprios)
    console.log('\nA recomputar agregados...');
    const { computeMonthlyRankings, recomputeAllTimeStats } = require('../../src/rankings/monthlyRankingEngine');
    await computeMonthlyRankings().catch(e => console.warn(`  monthly: ${e.message}`));
    await recomputeAllTimeStats().catch(e => console.warn(`  all-time: ${e.message}`));

    console.log('\n✓ Limpeza concluída. Próximo sync de sheets reflecte o estado actual.');
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
