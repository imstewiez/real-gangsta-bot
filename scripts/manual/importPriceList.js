'use strict';
/**
 * Importa lista_precos_corrigida.json para a DB.
 *
 * Uso:
 *   node scripts/manual/importPriceList.js
 *   DRY_RUN=1 node scripts/manual/importPriceList.js
 *
 * O script:
 *   1. Lê C:\Users\steve\Downloads\lista_precos_corrigida.json
 *   2. Normaliza nomes de ingredientes nos crafts
 *   3. Cria itens novos necessários para crafts (Ouro, Molde de Arma, Dinheiro Sujo)
 *   4. Insere/actualiza todos os itens com estimated_value = preco
 *   5. Cria as receitas de craft
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('../../src/db');

const DRY_RUN = process.env.DRY_RUN === '1';
const JSON_PATH =
  process.env.PRICE_JSON ||
  path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'lista_precos_corrigida.json');

// ── Normalização de nomes ─────────────────────────────────────────────────
const NAME_NORMALIZATION = {
  'Barra de Cobre': 'Cobre',
  'Barra de Ouro': 'Ouro',
  'Tábua de Ébano': 'Tábua Ébano',
  'Print de Orange': 'Print Laranja',
  'Print de Red': 'Print Vermelha',
  'Print de Arma Laranja': 'Print Laranja',
  'Print de Arma Azul': 'Print Azul',
  'Print de Arma Vermelho': 'Print Vermelha',
  'Print de Arma Amarelo': 'Print Amarela',
  'Molde de Arma': 'Molde de Arma',
  'Dinheiro Sujo': 'Dinheiro Sujo',
  // Armas: nomes nas receitas vs nomes no catálogo
  'Pistola XM3': 'Pistol XM3',
  'AP Pistola': 'AP Pistol',
  'Pistola .50': '.50',
  'SMG de Assalto': 'Assault Shotgun',
  'Combat PDW': 'PDW',
  'Pistola Gadget': 'Gadget Pistol',
  'Bullpup Rifle': 'Bullpup',
};

// Mapeamento de categorias do JSON para categorias válidas na DB
const CATEGORY_MAP = {
  lixo: 'reciclagem',
  madeiras: 'madeiras',
  materias_primas: 'componentes',
  minerios: 'metais',
  corpos: 'componentes',
  prints: 'componentes',
  armas_extra: 'armas',
  armas_brancas: 'armas_brancas',
  armas_orange: 'armas_fogo',
  armas_red: 'armas_fogo',
  carregadores: 'municoes',
  coletes: 'equipamento',
  acessorios: 'acessorios',
  drogas: 'droga',
  mercado_Bairro: 'outros',
  mercado_favela: 'outros',
  craft_weapons: 'armas_fogo',
  craft_carregadores: 'municoes',
  craft_prints: 'componentes',
  craft_corpos: 'componentes',
};

// Itens extra que não existem no JSON mas são necessários para crafts
const EXTRA_ITEMS = [
  { name: 'Ouro', category: 'metais', price: 5000 },
  { name: 'Molde de Arma', category: 'componentes', price: 10000 },
  { name: 'Dinheiro Sujo', category: 'dinheiro', price: 1 },
];

function normalizeName(name) {
  return NAME_NORMALIZATION[name] || name;
}

function loadJson() {
  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function ensureItems(client, data) {
  const items = [];

  // Extract simple items
  for (const [category, list] of Object.entries(data)) {
    const mappedCategory = CATEGORY_MAP[category] || category;
    if (Array.isArray(list)) {
      for (const entry of list) {
        items.push({
          name: entry.nome,
          category: mappedCategory,
          price: entry.preco,
        });
      }
    } else if (typeof list === 'object') {
      // craft_weapons has sub-categories (orange, red)
      for (const [_subCategory, subList] of Object.entries(list)) {
        for (const entry of subList) {
          items.push({
            name: entry.nome,
            category: mappedCategory,
            price: null, // crafted items don't have a direct price in the JSON
          });
        }
      }
    }
  }

  // Add extra items
  for (const extra of EXTRA_ITEMS) {
    items.push({ name: extra.name, category: extra.category, price: extra.price });
  }

  // Deduplicate by name
  const byName = new Map();
  for (const item of items) {
    if (!byName.has(item.name)) {
      byName.set(item.name, item);
    }
  }

  const results = { inserted: 0, updated: 0, skipped: 0 };

  for (const item of byName.values()) {
    const existing = await client.query('SELECT id FROM items WHERE name ILIKE $1', [item.name]);
    if (existing.rows.length === 0) {
      if (!DRY_RUN) {
        await client.query(
          `INSERT INTO items (name, category, unit, estimated_value, active, notes)
           VALUES ($1, $2, 'unidade', $3, true, '')`,
          [item.name, item.category, item.price]
        );
      }
      results.inserted++;
      console.log(`  [INSERT] ${item.name} (${item.category}) — ${item.price ?? 'sem preço'}€`);
    } else {
      if (item.price !== null && item.price !== undefined && !DRY_RUN) {
        await client.query('UPDATE items SET estimated_value = $1, category = $2, updated_at = NOW() WHERE id = $3', [
          item.price,
          item.category,
          existing.rows[0].id,
        ]);
      }
      results.updated++;
      console.log(`  [UPDATE] ${item.name} (${item.category}) — ${item.price ?? 'sem preço'}€`);
    }
  }

  return results;
}

async function buildItemIdMap(client) {
  const res = await client.query('SELECT id, name FROM items');
  const map = new Map();
  for (const row of res.rows) {
    map.set(row.name.toLowerCase(), row.id);
    // Also map normalized names
    const normalized = normalizeName(row.name);
    if (normalized !== row.name) {
      map.set(normalized.toLowerCase(), row.id);
    }
  }
  // Pre-populate reverse mappings for craft recipe lookups
  for (const [craftName, catalogName] of Object.entries(NAME_NORMALIZATION)) {
    if (craftName === catalogName) continue;
    const existingId = map.get(catalogName.toLowerCase());
    if (existingId) {
      map.set(craftName.toLowerCase(), existingId);
    }
  }
  return map;
}

async function ensureRecipes(client, data, itemIdMap) {
  const recipes = [];

  for (const [category, list] of Object.entries(data)) {
    if (!category.startsWith('craft_')) continue;

    if (Array.isArray(list)) {
      for (const entry of list) {
        const itemName = normalizeName(entry.nome);
        const itemId = itemIdMap.get(itemName.toLowerCase());
        if (!itemId) {
          console.warn(`  [SKIP RECIPE] Item não encontrado: ${itemName}`);
          continue;
        }
        const ingredients = entry.ingredientes
          .map(ing => {
            const ingName = normalizeName(ing.nome);
            const ingId = itemIdMap.get(ingName.toLowerCase());
            if (!ingId) {
              console.warn(`  [SKIP INGREDIENT] Ingrediente não encontrado: ${ingName} (para ${itemName})`);
            }
            return { name: ingName, itemId: ingId, quantity: ing.quantidade };
          })
          .filter(i => i.itemId);

        recipes.push({ itemId, category, tier: null, ingredients });
      }
    } else if (typeof list === 'object') {
      // craft_weapons has sub-categories (orange, red)
      for (const [tier, subList] of Object.entries(list)) {
        for (const entry of subList) {
          const itemName = normalizeName(entry.nome);
          const itemId = itemIdMap.get(itemName.toLowerCase());
          if (!itemId) {
            console.warn(`  [SKIP RECIPE] Item não encontrado: ${itemName}`);
            continue;
          }
          const ingredients = entry.ingredientes
            .map(ing => {
              const ingName = normalizeName(ing.nome);
              const ingId = itemIdMap.get(ingName.toLowerCase());
              if (!ingId) {
                console.warn(`  [SKIP INGREDIENT] Ingrediente não encontrado: ${ingName} (para ${itemName})`);
              }
              return { name: ingName, itemId: ingId, quantity: ing.quantidade };
            })
            .filter(i => i.itemId);

          recipes.push({ itemId, category, tier, ingredients });
        }
      }
    }
  }

  if (!DRY_RUN) {
    // Clear existing recipes first
    await client.query('DELETE FROM recipe_ingredients');
    await client.query('DELETE FROM craft_recipes');
  }

  for (const recipe of recipes) {
    if (!DRY_RUN) {
      const recipeRes = await client.query(
        `INSERT INTO craft_recipes (item_id, category, tier)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [recipe.itemId, recipe.category, recipe.tier]
      );
      const recipeId = recipeRes.rows[0].id;
      for (const ing of recipe.ingredients) {
        await client.query(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient_item_id, quantity)
           VALUES ($1, $2, $3)`,
          [recipeId, ing.itemId, ing.quantity]
        );
      }
    }
    console.log(
      `  [RECIPE] ${recipe.category}${recipe.tier ? `/${recipe.tier}` : ''} → item_id=${recipe.itemId} (${recipe.ingredients.length} ingredientes)`
    );
  }

  return { count: recipes.length };
}

async function main() {
  console.log('=== IMPORTAÇÃO LISTA DE PREÇOS ===');
  console.log(`JSON: ${JSON_PATH}`);
  console.log(`DRY RUN: ${DRY_RUN ? 'SIM' : 'NÃO'}`);
  console.log('');

  if (!fs.existsSync(JSON_PATH)) {
    console.error(`Ficheiro não encontrado: ${JSON_PATH}`);
    process.exit(1);
  }

  if (!pool) {
    console.error('DATABASE_URL não configurada. Exporta a variável de ambiente antes de correr o script.');
    process.exit(1);
  }

  const data = loadJson();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('--- Itens ---');
    const itemResults = await ensureItems(client, data);
    console.log(`Itens: ${itemResults.inserted} inseridos, ${itemResults.updated} actualizados\n`);

    console.log('--- Mapa de IDs ---');
    const itemIdMap = await buildItemIdMap(client);
    console.log(`${itemIdMap.size} itens no mapa\n`);

    console.log('--- Receitas ---');
    const recipeResults = await ensureRecipes(client, data, itemIdMap);
    console.log(`${recipeResults.count} receitas criadas\n`);

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('DRY RUN — ROLLBACK efectuado.');
    } else {
      await client.query('COMMIT');
      console.log('COMMIT efectuado.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERRO:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
