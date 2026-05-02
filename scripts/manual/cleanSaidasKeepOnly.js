'use strict';
/**
 * Apaga TODAS as saídas excepto os IDs listados em KEEP_SAIDA_IDS.
 *
 * Cascade:
 *   - operations + operation_participants + operation_materials (FK CASCADE)
 *   - inventory_movements (saida_id)
 *   - kill_logs ligadas + audit_logs relacionados
 *   - reset member_saida_stats + spot_stats afectados
 *   - recompute monthly + all-time rankings
 *   - DELETE da mensagem session no canal Discord (se client disponível)
 *   - trigger resync das tabs relevantes (saidas + dashboard + resumo)
 *
 * Uso:
 *   railway run KEEP_SAIDA_IDS="1,3,4,5" node scripts/manual/cleanSaidasKeepOnly.js
 *   railway run KEEP_SAIDA_IDS="1,3,4,5" DRY_RUN=true node scripts/manual/cleanSaidasKeepOnly.js
 *
 * IRREVERSÍVEL após COMMIT.
 *
 * NOTA Discord: o embed de RESULTADOS (no SAIDA_RESULTS_CHANNEL_ID) não é
 * tracked por message_id. Depois de correr, apaga manualmente do canal as
 * publicações das saídas apagadas — ou é mais rápido correr Discord's
 * "clear messages" via bot admin.
 *
 * NOTA Sheets: a tab `saidas` é event-driven. O script emite um re-sync
 * no fim; se falhar, corre /sync-sheets acao:all no Discord.
 */

const { pool } = require('../../src/db');

async function main() {
  const raw = process.env.KEEP_SAIDA_IDS;
  const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

  if (!raw) {
    console.error('Uso: KEEP_SAIDA_IDS="1,3,4,5" node scripts/manual/cleanSaidasKeepOnly.js');
    console.error('       (adiciona DRY_RUN=true para preview)');
    process.exit(1);
  }
  const keepIds = raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!keepIds.length) {
    console.error('Sem IDs válidos em KEEP_SAIDA_IDS.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log(`=== LIMPEZA — manter apenas ${keepIds.join(', ')} ${dryRun ? '(DRY RUN)' : ''} ===\n`);

    const all = await client.query(
      `SELECT id, date, spot, operation_type, status, result, session_message_id, session_channel_id
         FROM operations
        ORDER BY id`
    );
    if (!all.rows.length) {
      console.log('Sem saídas na DB. Nada a fazer.');
      await pool.end();
      return;
    }

    const kept = all.rows.filter(r => keepIds.includes(r.id));
    const toDelete = all.rows.filter(r => !keepIds.includes(r.id));

    console.log(`Saídas existentes: ${all.rows.length}`);
    console.log(`A manter (${kept.length}): ${kept.map(r => `#${r.id}`).join(', ') || '—'}`);
    console.log(`A apagar (${toDelete.length}):`);
    for (const s of toDelete) {
      console.log(`  #${s.id} — ${s.operation_type} · ${s.spot || '—'} · ${s.status} · ${s.result || '—'} · ${s.date}`);
    }
    const missingKeeps = keepIds.filter(id => !kept.find(r => r.id === id));
    if (missingKeeps.length) {
      console.log(`\n⚠ IDs pedidos para manter mas NÃO existem: ${missingKeeps.join(', ')}`);
    }

    if (!toDelete.length) {
      console.log('\nNada a apagar — todas as saídas já estão na lista keep.');
      await pool.end();
      return;
    }

    if (dryRun) {
      console.log('\n(DRY_RUN=true — não apaguei nada. Corre sem DRY_RUN para aplicar.)');
      await pool.end();
      return;
    }

    const deleteIds = toDelete.map(s => s.id);

    await client.query('BEGIN');

    // Captura spots + member_ids afectados para reset de stats depois.
    const spotsAffected = await client.query(
      "SELECT DISTINCT spot FROM operations WHERE id = ANY($1::int[]) AND spot IS NOT NULL AND spot != ''",
      [deleteIds]
    );
    const spotsList = spotsAffected.rows.map(r => r.spot);

    const membersAffected = await client.query(
      'SELECT DISTINCT member_id FROM operation_participants WHERE operation_id = ANY($1::int[])',
      [deleteIds]
    );
    const memberIdsAffected = membersAffected.rows.map(r => r.member_id).filter(Boolean);

    // 1. inventory_movements com saida_id nas a apagar
    const r1 = await client.query('DELETE FROM inventory_movements WHERE saida_id = ANY($1::int[])', [deleteIds]);
    console.log(`\ninventory_movements (saida_id):    ${r1.rowCount} apagados`);

    // 2. operation_materials (FK CASCADE mas explicito p/ log)
    const r2 = await client.query('DELETE FROM operation_materials WHERE operation_id = ANY($1::int[])', [deleteIds]);
    console.log(`operation_materials:               ${r2.rowCount} apagados`);

    // 3. operation_participants
    const r3 = await client.query('DELETE FROM operation_participants WHERE operation_id = ANY($1::int[])', [
      deleteIds,
    ]);
    console.log(`operation_participants:            ${r3.rowCount} apagados`);

    // 4. kill_logs ligadas (se coluna existe)
    const killCol = await client.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'kill_logs' AND column_name IN ('saida_id','operation_id')
       LIMIT 1
    `);
    if (killCol.rows.length) {
      const col = killCol.rows[0].column_name;
      const r4 = await client.query(`DELETE FROM kill_logs WHERE ${col} = ANY($1::int[])`, [deleteIds]);
      console.log(`kill_logs (${col}):           ${r4.rowCount} apagados`);
    }

    // 5. audit_logs relacionados
    const r5 = await client.query(
      `DELETE FROM audit_logs
        WHERE entity_type IN ('saida','operation','participant')
          AND entity_id = ANY($1::text[])`,
      [deleteIds.map(String)]
    );
    console.log(`audit_logs:                        ${r5.rowCount} apagados`);

    // 6. operations
    const r6 = await client.query('DELETE FROM operations WHERE id = ANY($1::int[])', [deleteIds]);
    console.log(`operations:                        ${r6.rowCount} apagadas`);

    // 7. Reset stats dos membros/spots afectados (recompoem via applyIncrement
    //    no próximo finalizeSaida; ranking full recompute abaixo)
    if (memberIdsAffected.length) {
      const rReset = await client.query('DELETE FROM member_saida_stats WHERE member_id = ANY($1::int[])', [
        memberIdsAffected,
      ]);
      console.log(`member_saida_stats reset:          ${rReset.rowCount} rows (${memberIdsAffected.length} membros)`);
    }
    if (spotsList.length) {
      const rSpot = await client.query('DELETE FROM spot_stats WHERE spot = ANY($1::text[])', [spotsList]);
      console.log(`spot_stats reset (${spotsList.length} spots):  ${rSpot.rowCount} rows`);
    }

    await client.query('COMMIT');

    console.log('\n--- Recompute monthly + all-time rankings ---');
    const { computeMonthlyRankings, recomputeAllTimeStats } = require('../../src/rankings/monthlyRankingEngine');
    await computeMonthlyRankings().catch(e => console.warn(`  monthly: ${e.message}`));
    await recomputeAllTimeStats().catch(e => console.warn(`  all-time: ${e.message}`));
    console.log('  ✓ rankings recomputados');

    // 8. Discord — apaga session messages das saídas eliminadas
    console.log('\n--- Discord cleanup (session messages) ---');
    const toCleanDiscord = toDelete.filter(s => s.session_message_id && s.session_channel_id);
    if (!toCleanDiscord.length) {
      console.log('  (nenhuma session_message_id registada — skip Discord)');
    } else {
      // Precisa de client Discord autenticado. Se disponível via env DISCORD_BOT_TOKEN
      // arranca um client minimal só para apagar as mensagens.
      try {
        const { Client, GatewayIntentBits } = require('discord.js');
        if (!process.env.DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN não definido');
        const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
        await discordClient.login(process.env.DISCORD_BOT_TOKEN);
        await new Promise(r => discordClient.once('ready', r));

        let dOk = 0,
          dFail = 0;
        for (const s of toCleanDiscord) {
          try {
            const ch = await discordClient.channels.fetch(s.session_channel_id).catch(() => null);
            if (!ch?.isTextBased?.()) {
              dFail++;
              continue;
            }
            const msg = await ch.messages.fetch(s.session_message_id).catch(() => null);
            if (!msg) {
              dFail++;
              continue;
            }
            await msg.delete().catch(() => {});
            dOk++;
          } catch (_) {
            dFail++;
          }
        }
        console.log(`  ✓ ${dOk} session messages apagadas, ${dFail} inacessíveis`);
        await discordClient.destroy();
      } catch (e) {
        console.warn(`  ⚠ Discord cleanup falhou: ${e.message}`);
        console.log('    Corre o bot normalmente — as mensagens stale ficam órfãs mas não afectam DB.');
      }
    }

    // 9. Sheets — trigger syncAll directamente. O syncEngine faz clearRange
    //    + re-write de cada tab a partir da DB, pelo que linhas stale das
    //    saídas apagadas desaparecem do Google Sheet.
    console.log('\n--- Sheets resync (clearRange + rewrite) ---');
    try {
      const { syncAll } = require('../../src/sheets/syncEngine');
      const results = await syncAll();
      for (const r of results) {
        if (r.error) {
          console.log(`  ⚠ ${r.tab}: ${r.error}`);
        } else {
          console.log(`  ✓ ${r.tab}: ${r.ops} ops em ${r.ms}ms`);
        }
      }
    } catch (e) {
      console.warn(`  ⚠ Sheets resync falhou: ${e.message}`);
      console.log('    Fallback: corre no Discord `/sync-sheets acao:all`.');
    }

    console.log('\n✓ Limpeza concluída.');
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
