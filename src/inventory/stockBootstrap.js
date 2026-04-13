'use strict';
/**
 * Bootstrap do stock inicial — importa `config/full-inventory.json` como
 * movimentos `saldo_inicial` auditáveis. Protegido por:
 *   - flag `confirm` explícita
 *   - registo em `inventory_bootstrap` (mesma source não aplica duas vezes
 *     sem `force`)
 *
 * Nunca faz overwrite de stock — apenas adiciona movimentos.
 */

const path = require('path');
const fs = require('fs');
const { pool, queryWithTransaction } = require('../db');
const { inventoryRepo } = require('../repositories');
const { logAudit } = require('../audit/auditEngine');
const { log } = require('../logger');

const DEFAULT_SOURCE = path.resolve(__dirname, '..', '..', 'config', 'full-inventory.json');

async function wasSourceApplied(source) {
  const res = await pool.query('SELECT id FROM inventory_bootstrap WHERE source = $1 LIMIT 1', [source]);
  return res.rows.length > 0;
}

async function loadSeed(sourcePath) {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.items)) {
    throw new Error(`Seed inválido em ${sourcePath} — falta array 'items'`);
  }
  return data;
}

/**
 * @param {object} opts
 * @param {boolean} opts.confirm  — protecção obrigatória contra execução acidental
 * @param {boolean} opts.force    — permite reaplicar mesmo source
 * @param {string}  opts.actor    — discord id do actor (para audit)
 * @param {string}  opts.source   — caminho para o seed (default full-inventory.json)
 * @param {boolean} opts.dryRun   — calcula mas não escreve
 * @returns {{ ok, dryRun, source, itemsCreated, itemsUpdated, movements, totalValue, skipped }}
 */
async function bootstrapStock(opts = {}) {
  if (!opts.confirm && !opts.dryRun) {
    throw new Error('Bootstrap requer `confirm: true` ou `dryRun: true`.');
  }
  const actor = opts.actor || 'system';
  const sourcePath = opts.source || DEFAULT_SOURCE;
  const sourceKey = path.basename(sourcePath);

  const already = !opts.dryRun && await wasSourceApplied(sourceKey);
  if (already && !opts.force) {
    return {
      ok: false,
      dryRun: false,
      source: sourceKey,
      skipped: true,
      reason: 'Este source já foi aplicado. Usa `force: true` para reaplicar.',
    };
  }

  const seed = await loadSeed(sourcePath);
  const report = {
    ok: true,
    dryRun: Boolean(opts.dryRun),
    source: sourceKey,
    itemsCreated: 0,
    itemsUpdated: 0,
    movements: 0,
    totalValue: 0,
    skipped: false,
  };

  if (opts.dryRun) {
    for (const it of seed.items) {
      if (!it.name || typeof it.stock !== 'number') continue;
      report.movements++;
      report.totalValue += (it.stock || 0) * (it.price || 0);
    }
    return report;
  }

  await queryWithTransaction(async (client) => {
    for (const it of seed.items) {
      if (!it.name || typeof it.stock !== 'number' || it.stock <= 0) continue;

      // Ensure item exists
      let item = await inventoryRepo.getItemByName(it.name);
      if (!item) {
        const created = await inventoryRepo.createItem({
          name: it.name,
          category: it.category || 'outros',
          unit: it.unit || 'unidade',
          estimatedValue: it.price != null ? it.price : null,
        });
        item = created;
        report.itemsCreated++;
      } else if (it.price != null && Number(item.estimated_value) !== Number(it.price)) {
        await inventoryRepo.updateItem(item.id, { estimated_value: it.price });
        report.itemsUpdated++;
      }

      // Register saldo_inicial movement
      await client.query(
        `INSERT INTO inventory_movements
          (movement_type, item_id, quantity, origin, destination, context, notes, created_by)
         VALUES ('saldo_inicial', $1, $2, 'bootstrap', 'org', $3, $4, $5)`,
        [item.id, it.stock, sourceKey, `Bootstrap inicial — ${it.name}`, actor]
      );

      report.movements++;
      report.totalValue += (it.stock || 0) * (it.price || 0);
    }

    await client.query(
      `INSERT INTO inventory_bootstrap (source, applied_by, items_count, total_value, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [sourceKey, actor, report.movements, report.totalValue, opts.notes || '']
    );
  });

  await logAudit({
    action: 'inventory_bootstrap',
    entityType: 'inventory',
    entityId: sourceKey,
    actorId: actor,
    afterState: {
      itemsCreated: report.itemsCreated,
      itemsUpdated: report.itemsUpdated,
      movements: report.movements,
      totalValue: report.totalValue,
    },
  });

  log(`[BOOTSTRAP] Source "${sourceKey}" aplicado por ${actor}: ${report.movements} movimentos, ${report.totalValue.toLocaleString('pt-PT')}€ total`);

  return report;
}

module.exports = { bootstrapStock, DEFAULT_SOURCE };
