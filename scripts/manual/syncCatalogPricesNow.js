'use strict';
/**
 * Corre a sincronização de preços do catálogo imediatamente, sem esperar
 * pelo job semanal. Lê config/prices-catalog.json e faz UPDATE do
 * estimated_value de cada item; audita mudanças.
 *
 * Uso:
 *   railway run node scripts/manual/syncCatalogPricesNow.js
 *   DATABASE_URL=... node scripts/manual/syncCatalogPricesNow.js
 */

const { pool } = require('../../src/db');

async function main() {
  const { runCatalogPricesSync } = require('../../src/jobs/catalogPricesJob');
  console.log('=== CATALOG PRICES SYNC ===\n');
  const r = await runCatalogPricesSync();
  console.log(`\n✓ Resultado:`);
  console.log(`  criados:      ${r.created}`);
  console.log(`  actualizados: ${r.updated}`);
  console.log(`  inalterados:  ${r.unchanged}`);
  console.log(`  erros:        ${r.errors}`);
  console.log('\nPreços activos na DB são os do catálogo. Next sync de sheets vai reflectir.');
  await pool.end();
}

main().catch(err => {
  console.error('✖ ERRO:', err.message);
  process.exit(1);
});
