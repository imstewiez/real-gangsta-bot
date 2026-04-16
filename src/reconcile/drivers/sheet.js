'use strict';
/**
 * Reconcile driver — Google Sheet staleness.
 * Compara sheet_sync_state com bounds esperados:
 *   - last_result='error' → reported as error
 *   - last_synced_at > 2× SHEETS_SYNC_INTERVAL_MIN → stale
 *   - sem entry → never synced
 *
 * apply() itera pelas tabs com drift e chama syncOne() em cada. Como a
 * projecção é event-driven, apply() só é invocada em reconciliação manual
 * (hoje raramente usada — os projections mantêm tudo fresco).
 */

const CONFIG = require('../../config');
const { getSheetSyncState } = require('../../repositories/_meta');

// Lista canónica de tabs (espelha workbook.js). Mantém em sync manualmente
// se novas tabs forem adicionadas/removidas.
const CANONICAL_TABS = ['dashboard', 'resumo', 'membros', 'saidas', 'stock', 'config'];

async function check() {
  const intervalMin = Number(CONFIG.SHEETS_SYNC_INTERVAL_MIN) || 15;
  const staleThresholdMs = intervalMin * 60 * 1000 * 2; // 2× o intervalo = stale
  const now = Date.now();

  const state = await getSheetSyncState();
  const stateByTab = new Map(state.map(s => [s.tab_key, s]));

  const drift = { total_checked: CANONICAL_TABS.length, errors: [], stale: [], never_synced: [], ok: 0 };

  for (const tab of CANONICAL_TABS) {
    const s = stateByTab.get(tab);
    if (!s) {
      drift.never_synced.push({ tab });
      continue;
    }
    if (s.last_result === 'error') {
      drift.errors.push({ tab, last_synced_at: s.last_synced_at, error: s.last_error });
      continue;
    }
    const last = s.last_synced_at ? new Date(s.last_synced_at).getTime() : 0;
    const ageMs = now - last;
    if (ageMs > staleThresholdMs) {
      drift.stale.push({ tab, last_synced_at: s.last_synced_at, age_ms: ageMs });
      continue;
    }
    drift.ok += 1;
  }
  drift.has_drift = drift.errors.length + drift.stale.length + drift.never_synced.length > 0;
  drift.stale_threshold_ms = staleThresholdMs;
  return drift;
}

async function apply(_ignored, drift, { actor = 'system:reconcile' } = {}) {
  // Corre syncOne por cada tab com drift. Evita re-sincronizar tabs OK.
  const { syncOne } = require('../../sheets/syncEngine');
  const t0 = Date.now();
  const tabsToFix = new Set([
    ...(drift.errors || []).map(x => x.tab),
    ...(drift.stale || []).map(x => x.tab),
    ...(drift.never_synced || []).map(x => x.tab),
  ]);
  const results = [];
  const errors = [];
  for (const tab of tabsToFix) {
    try {
      const r = await syncOne(tab);
      if (r?.skipped) continue;
      results.push(r);
    } catch (e) {
      errors.push({ tab, message: e.message });
    }
  }
  return {
    corrected: results.length,
    errors,
    total_ms: Date.now() - t0,
  };
}

module.exports = { check, apply, CANONICAL_TABS };
