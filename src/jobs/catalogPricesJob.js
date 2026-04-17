'use strict';
/**
 * Catalog prices job — corre semanalmente e sincroniza `estimated_value`
 * dos items a partir de `config/prices-catalog.json`. Substitui o antigo
 * slash `/precario` que era tooling manual.
 *
 * Idempotente: itens iguais ficam inalterados, novos são inseridos,
 * mudanças de preço são logadas em auditoria.
 */

const { log, warn } = require('../logger');
const { logAudit } = require('../audit/auditEngine');

async function runCatalogPricesSync() {
  const { syncPrices } = require('../inventory/catalogPricesSync');
  try {
    const r = await syncPrices({ full: false });
    log(
      `[JOB] catalog_prices: ${r.created.length} criados, ${r.updated.length} actualizados, ${r.unchanged.length} iguais, ${r.errors.length} erros.`
    );

    // Audit trail por preço alterado — permite reconstituir histórico.
    for (const u of r.updated) {
      try {
        await logAudit({
          action: 'item_price_updated',
          entityType: 'item',
          entityId: String(u.id || u.name),
          actorId: 'system:catalog-prices-job',
          beforeState: { estimated_value: u.oldPrice },
          afterState: { estimated_value: u.newPrice },
        });
      } catch (_) {
        /* audit é best-effort */
      }
    }

    return {
      created: r.created.length,
      updated: r.updated.length,
      unchanged: r.unchanged.length,
      errors: r.errors.length,
    };
  } catch (e) {
    warn(`[JOB] catalog_prices falhou: ${e.message}`);
    throw e;
  }
}

module.exports = { runCatalogPricesSync };
