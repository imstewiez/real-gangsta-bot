'use strict';
const { inventoryRepo } = require('../repositories');
const { log } = require('../logger');
const path = require('path');
const fs = require('fs');

async function seedFromCatalog() {
  const catalogPath = path.resolve(process.cwd(), 'config', 'items-catalog.json');
  if (!fs.existsSync(catalogPath)) {
    log('[CATALOG] Ficheiro items-catalog.json não encontrado. A saltar seed.');
    return 0;
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  let created = 0;

  for (const item of catalog.defaultItems || []) {
    const existing = await inventoryRepo.getItemByName(item.name);
    if (!existing) {
      await inventoryRepo.createItem({
        name: item.name,
        category: item.category,
        unit: item.unit || 'unidade',
        estimatedValue: item.estimatedValue || null,
        notes: '',
      });
      created++;
    }
  }

  if (created > 0) log(`[CATALOG] ${created} itens adicionados ao catálogo.`);
  return created;
}

function getCategories() {
  const catalogPath = path.resolve(process.cwd(), 'config', 'items-catalog.json');
  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    return catalog.categories || [];
  } catch {
    return ['metais', 'quimicos', 'polvora', 'componentes', 'pecas', 'consumiveis', 'armamento', 'municoes', 'outros'];
  }
}

module.exports = { seedFromCatalog, getCategories };
