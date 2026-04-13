'use strict';
const { query } = require('../db');
const { log, warn } = require('../logger');
const path = require('path');
const fs = require('fs');

async function seedFromFullInventory() {
  const catalogPath = path.resolve(process.cwd(), 'config', 'full-inventory.json');
  if (!fs.existsSync(catalogPath)) {
    log('[CATALOG] full-inventory.json não encontrado. A saltar seed.');
    return 0;
  }

  // Check if already seeded
  const existing = await query('SELECT COUNT(*) as count FROM items');
  if (parseInt(existing.rows[0].count) > 0) {
    log(`[CATALOG] Catálogo já tem ${existing.rows[0].count} itens. Seed ignorado.`);
    return 0;
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  let itemsCreated = 0;
  let stockLoaded = 0;

  log(`[CATALOG] A carregar ${catalog.items.length} itens do inventário completo...`);

  for (const item of catalog.items) {
    // Insert item
    const res = await query(
      `INSERT INTO items (name, category, unit, estimated_value, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      [item.name, item.category, item.unit || 'unidade', item.price || 0, '']
    );

    if (res.rows.length > 0) {
      itemsCreated++;
      const itemId = res.rows[0].id;

      // Load initial stock as ajuste_manual
      if (item.stock && item.stock > 0) {
        await query(
          `INSERT INTO inventory_movements
           (movement_type, item_id, quantity, member_role, origin, destination, context, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          ['ajuste_manual', itemId, item.stock, '', 'inventário_inicial', 'org',
           'Seed inicial', `Stock inicial: ${item.stock} ${item.unit}`, 'system']
        );
        stockLoaded++;
      }
    }
  }

  log(`[CATALOG] Seed completo: ${itemsCreated} itens criados, ${stockLoaded} com stock inicial.`);
  return itemsCreated;
}

function getCategories() {
  const catalogPath = path.resolve(process.cwd(), 'config', 'full-inventory.json');
  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    return catalog.categories || [];
  } catch {
    return ['dinheiro', 'metais', 'sucata_industria', 'quimicos_droga', 'comida_pesca', 'equipamento', 'municoes', 'armas_fogo', 'armas_brancas'];
  }
}

module.exports = { seedFromCatalog: seedFromFullInventory, getCategories };
