'use strict';
/**
 * Reconcile engine — orquestra drivers por domínio.
 *
 * API:
 *   await runReconcile({ domain, guild?, dryRun, actor })
 *
 *   domain:
 *     'members'  — compara DB members vs Discord roles (precisa de guild)
 *     'channels' — compara resident_channels vs Discord channels (precisa de guild)
 *     'sheet'    — staleness/errors em sheet_sync_state
 *     'all'      — corre todos (members + channels + sheet)
 *
 * Devolve:
 *   {
 *     domain, dryRun, per_domain: { [name]: { check, apply? } }, ms
 *   }
 */

const { log, warn } = require('../logger');
const { query } = require('../db');

const DRIVERS = {
  members: require('./drivers/members'),
  channels: require('./drivers/channels'),
  sheet: require('./drivers/sheet'),
};

async function runReconcile({ domain = 'all', guild = null, dryRun = true, actor = 'system:reconcile' } = {}) {
  const t0 = Date.now();
  const domains = (domain === 'all') ? Object.keys(DRIVERS) : [domain];
  if (!domains.every(d => DRIVERS[d])) throw new Error(`Domínio inválido: ${domain}`);

  const per_domain = {};
  for (const d of domains) {
    const driver = DRIVERS[d];
    try {
      // Members/channels precisam de guild
      if ((d === 'members' || d === 'channels') && !guild) {
        per_domain[d] = { error: 'guild não fornecido' };
        continue;
      }
      const check = await driver.check(guild);
      const entry = { check };
      if (!dryRun && check.has_drift) {
        entry.apply = await driver.apply(guild, check, { actor });
      }
      per_domain[d] = entry;
    } catch (e) {
      warn(`[RECONCILE:${d}] falhou: ${e.message}`);
      per_domain[d] = { error: e.message };
    }
  }

  // Log para archival_log
  try {
    await query(
      `INSERT INTO archival_log (domain, action, actor, reason, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      ['reconcile', 'archive', actor, `reconcile ${domain} dry=${dryRun}`,
       { per_domain: Object.fromEntries(Object.entries(per_domain).map(([k, v]) => [k, {
         has_drift: v.check?.has_drift,
         total_checked: v.check?.total_checked,
         corrected: v.apply?.corrected,
         error: v.error,
       }])) }]
    );
  } catch (_) { /* ignore se archival_log ainda não existir */ }

  const ms = Date.now() - t0;
  log(`[RECONCILE] domain=${domain} dry=${dryRun} · ${ms}ms · ${Object.keys(per_domain).join(', ')}`);
  return { domain, dryRun, per_domain, ms };
}

module.exports = { runReconcile, DRIVERS };
