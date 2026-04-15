'use strict';
// Corre syncOne para cada tab, relata sucesso/erro por tab.
// Uso: DATABASE_URL=... GOOGLE_SERVICE_ACCOUNT_JSON=... SPREADSHEET_ID=... node scripts/debug-sync.js
require('dotenv').config();

(async () => {
  const { syncOne, TAB_SYNCERS } = require('../src/sheets/syncEngine');
  const keys = Object.keys(TAB_SYNCERS);
  const results = [];

  for (const key of keys) {
    try {
      const r = await syncOne(key);
      if (r.skipped) {
        results.push({ key, status: 'skipped', detail: r.skipped });
      } else {
        results.push({ key, status: 'ok', ops: r.ops, ms: r.ms });
      }
    } catch (e) {
      results.push({ key, status: 'error', message: e.message, stack: e.stack });
    }
  }

  console.log('\n=== SYNC RESULTS ===\n');
  for (const r of results) {
    if (r.status === 'ok')      console.log(`✅ ${r.key.padEnd(14)} · ${r.ops} ops · ${r.ms}ms`);
    else if (r.status === 'skipped') console.log(`⚠️  ${r.key.padEnd(14)} · SKIPPED: ${r.detail}`);
    else                        console.log(`❌ ${r.key.padEnd(14)} · ${r.message}`);
  }

  const errors = results.filter(r => r.status === 'error');
  if (errors.length) {
    console.log('\n=== ERROR STACKS ===\n');
    for (const e of errors) {
      console.log(`\n--- ${e.key} ---`);
      console.log(e.stack);
    }
  }

  console.log(`\n${results.filter(r => r.status === 'ok').length}/${keys.length} tabs OK, ${errors.length} com erros.\n`);
  process.exit(errors.length ? 1 : 0);
})();
