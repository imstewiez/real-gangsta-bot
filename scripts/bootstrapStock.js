#!/usr/bin/env node
'use strict';
/**
 * CLI: bootstrap do stock inicial.
 *
 *   node scripts/bootstrapStock.js                  # dry-run
 *   node scripts/bootstrapStock.js --apply          # aplica (requer --confirm)
 *   node scripts/bootstrapStock.js --apply --confirm
 *   node scripts/bootstrapStock.js --apply --confirm --force
 */

const { runMigrations } = require('../src/dbMigrate');
const { bootstrapStock } = require('../src/inventory/stockBootstrap');
const { pool } = require('../src/db');

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const confirm = args.includes('--confirm');
  const force = args.includes('--force');

  if (apply && !confirm) {
    console.error('\n⚠️  Usa --confirm para aplicar (protecção contra execução acidental).');
    console.error('    Exemplo: node scripts/bootstrapStock.js --apply --confirm\n');
    process.exit(2);
  }

  await runMigrations();

  const report = await bootstrapStock({
    dryRun: !apply,
    confirm,
    force,
    actor: process.env.USER || 'cli',
  });

  console.log('\n' + '═'.repeat(70));
  console.log('  BOOTSTRAP DE STOCK — RELATÓRIO');
  console.log('═'.repeat(70));
  console.log(`  Source:         ${report.source}`);
  console.log(`  Modo:           ${report.dryRun ? 'DRY-RUN' : 'APPLY'}`);
  if (report.skipped) {
    console.log(`  ⏭️  Saltado:      ${report.reason}`);
  } else {
    console.log(`  Items criados:  ${report.itemsCreated}`);
    console.log(`  Items actualiz: ${report.itemsUpdated}`);
    console.log(`  Movimentos:     ${report.movements}`);
    console.log(`  Valor total:    ${report.totalValue.toLocaleString('pt-PT')} €`);
  }
  console.log('═'.repeat(70) + '\n');

  if (report.dryRun) {
    console.log('  ⚠️  DRY-RUN — nada foi escrito na base de dados.');
    console.log('  Para aplicar: node scripts/bootstrapStock.js --apply --confirm\n');
  }

  await pool.end();
  process.exit(0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
