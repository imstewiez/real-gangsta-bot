'use strict';
/**
 * Sincroniza preços do catálogo com `config/prices-catalog.json`.
 *
 * Comportamento:
 *   - Item existe (match exacto por nome) → UPDATE estimated_value
 *     (e opcionalmente category/unit se passar `full: true`)
 *   - Item não existe → INSERT com name/category/unit/estimated_value
 *   - Nunca apaga nada
 *
 * Devolve sumário { created, updated, unchanged, errors }.
 */

const fs = require('fs');
const path = require('path');
const { query } = require('../db');
const { log, warn } = require('../logger');

function loadCatalog() {
  const p = path.resolve(process.cwd(), 'config', 'prices-catalog.json');
  if (!fs.existsSync(p)) throw new Error('config/prices-catalog.json não encontrado');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(raw.items)) throw new Error('prices-catalog.json sem `items`');
  return raw.items;
}

async function syncPrices({ full = false } = {}) {
  const items = loadCatalog();
  const result = { created: [], updated: [], unchanged: [], errors: [] };

  for (const it of items) {
    try {
      const { name, category, unit, price } = it;
      const existing = await query('SELECT id, estimated_value, category, unit FROM items WHERE name = $1', [name]);
      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO items (name, category, unit, estimated_value, is_active)
           VALUES ($1, $2, $3, $4, true)`,
          [name, category, unit || 'unidade', price]
        );
        result.created.push({ name, price });
        continue;
      }
      const row = existing.rows[0];
      const oldPrice = Number(row.estimated_value) || 0;
      if (oldPrice === price && (!full || (row.category === category && row.unit === unit))) {
        result.unchanged.push({ name, price });
        continue;
      }
      const sets = ['estimated_value = $1', 'updated_at = NOW()'];
      const values = [price];
      if (full) {
        sets.push('category = $2', 'unit = $3');
        values.push(category, unit || 'unidade');
      }
      values.push(row.id);
      await query(`UPDATE items SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
      result.updated.push({ name, oldPrice, newPrice: price });
    } catch (e) {
      warn(`[CATALOG-PRICES] ${it.name}: ${e.message}`);
      result.errors.push({ name: it.name, message: e.message });
    }
  }

  log(
    `[CATALOG-PRICES] sync: ${result.created.length} criados, ${result.updated.length} actualizados, ${result.unchanged.length} igual, ${result.errors.length} erros`
  );
  return result;
}

module.exports = { syncPrices, loadCatalog };
