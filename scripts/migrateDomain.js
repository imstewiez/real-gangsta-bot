'use strict';
/**
 * One-shot — migração de domínio Morador → Bairrista / Chefe Moradores →
 * Patrão di Zona.
 *
 * 1. Reporta estado actual da DB (rows com roles/movement_types legacy).
 * 2. Confirma que migração 20 correu (deve já ter feito UPDATE dos dados).
 * 3. Corre backfill contra roles do Discord actuais para reclassificar os
 *    3 Patrões di Zona que ficaram como 'morador' antes desta migração.
 * 4. Imprime sumário.
 *
 * Uso: node scripts/migrateDomain.js
 *      (pode correr com --dry-run para só relatar)
 *
 * Apaga este ficheiro depois de correr.
 */

require('dotenv').config();
const { query } = require('../src/db');
const { Client, GatewayIntentBits } = require('discord.js');
const CONFIG = require('../src/config');
const { backfillMembers } = require('../src/members/backfill');

const DRY = process.argv.includes('--dry-run');

(async () => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(` MIGRAÇÃO DE DOMÍNIO  ${DRY ? '[DRY-RUN]' : '[APPLY]'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Estado actual da DB
  const rolesRes = await query(`SELECT role, COUNT(*)::int AS n FROM members GROUP BY role ORDER BY role`);
  console.log('📊 Members por role:');
  for (const r of rolesRes.rows) console.log(`   ${r.role.padEnd(20)} ${r.n}`);

  const mtRes = await query(`SELECT movement_type, COUNT(*)::int AS n FROM inventory_movements GROUP BY movement_type ORDER BY movement_type`);
  console.log('\n📊 Movimentos por type:');
  for (const r of mtRes.rows) console.log(`   ${r.movement_type.padEnd(25)} ${r.n}`);

  // 2. Migrações aplicadas
  const migRes = await query(`SELECT id, name FROM schema_migrations WHERE id = 20`);
  if (migRes.rows.length === 0) {
    console.error('\n❌ Migração 20 ainda não correu. Arranca o bot primeiro (boot aplica migrations).');
    process.exit(1);
  }
  console.log(`\n✓ Migração 20 aplicada (${migRes.rows[0].name})`);

  // 3. Backfill — só se houver servidor Discord configurado
  if (!CONFIG.DISCORD_BOT_TOKEN || !CONFIG.DISCORD_GUILD_ID) {
    console.log('\n⚠️  DISCORD_BOT_TOKEN ou GUILD_ID em falta — a saltar backfill.');
    process.exit(0);
  }

  console.log('\n🔄 Ligar ao Discord para correr backfill...');
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  await new Promise((resolve, reject) => {
    client.once('ready', resolve);
    client.once('error', reject);
    client.login(CONFIG.DISCORD_BOT_TOKEN).catch(reject);
  });

  const guild = client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) {
    console.error(`❌ Guild ${CONFIG.DISCORD_GUILD_ID} não encontrada.`);
    client.destroy();
    process.exit(1);
  }

  console.log(`✓ Ligado a ${guild.name}. A correr backfill...\n`);
  const report = await backfillMembers(guild, {
    dryRun: DRY,
    actor: 'system:migrate-domain',
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' SUMÁRIO');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  scanned:     ${report.scanned}`);
  console.log(`  bots:        ${report.skippedBot}`);
  console.log(`  sem role RP: ${report.skippedNoRole}`);
  console.log(`  criados:     ${report.created}`);
  console.log(`  actualizados:${report.updated}`);
  console.log(`  sem mudança: ${report.unchanged}`);
  console.log(`  erros:       ${report.errors.length}`);
  if (report.errors.length > 0) {
    console.log('\n  Erros:');
    for (const e of report.errors) console.log(`    - ${e.discordId}: ${e.message}`);
  }

  // Re-query para mostrar estado pós-backfill
  const afterRes = await query(`SELECT role, COUNT(*)::int AS n FROM members WHERE status='ativo' GROUP BY role ORDER BY role`);
  console.log('\n📊 Members (activos) pós-backfill:');
  for (const r of afterRes.rows) console.log(`   ${r.role.padEnd(20)} ${r.n}`);

  console.log('\n✅ Migração concluída.');
  console.log('   Próximos passos:');
  console.log('   1. Correr /rg-sync-sheets no Discord (ou esperar 15 min).');
  console.log('   2. Verificar secção "DISTRIBUIÇÃO POR CLASSE" da tab Membros.');
  console.log('   3. Renomear role "Moradores" → "Bairristas" no admin do Discord.');
  console.log('   4. Apagar este script: scripts/migrateDomain.js\n');

  client.destroy();
  process.exit(0);
})().catch(e => {
  console.error('\n❌ Erro:', e.message);
  console.error(e.stack);
  process.exit(1);
});
