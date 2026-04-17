'use strict';
/**
 * Stock manager — operações manuais de gestão de inventário per-casa.
 *
 * Suporta:
 *   - addStock: regista entrada (entrega/apreendido/craftado)
 *   - removeStock: regista saída (venda/perda/consumo)
 *   - transferStock: move entre casas (par de movimentos ajuste_manual)
 *   - adjustStock: define stock absoluto (ex: contagem manual divergente)
 *   - findItemByName: busca por nome (ignora acentos/case)
 */

const { query } = require('../db');
const { logAudit } = require('../audit/auditEngine');

const VALID_LOCATIONS = ['armazem', 'grupo'];

function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findItemByName(name) {
  if (!name) return null;
  // Tenta match exacto primeiro
  let r = await query('SELECT id, name, category, unit, estimated_value FROM items WHERE name ILIKE $1 AND active = true', [name]);
  if (r.rows.length === 1) return r.rows[0];
  if (r.rows.length > 1) return r.rows[0]; // primeiro match
  // Fuzzy: por nome normalizado
  const all = await query('SELECT id, name, category, unit, estimated_value FROM items WHERE active = true');
  const target = norm(name);
  const exact = all.rows.find(i => norm(i.name) === target);
  if (exact) return exact;
  const partial = all.rows.find(i => norm(i.name).includes(target) || target.includes(norm(i.name)));
  return partial || null;
}

async function getCurrentStock(itemId, location = null) {
  const r = await query(`
    SELECT COALESCE(SUM(
      CASE
        WHEN movement_type IN ('saldo_inicial','entrega_bairrista','venda_bairrista','entrega_oficial','entrega_morador','venda_morador','devolucao_saida','devolucao_operacao','apreendido','craftado')
          THEN quantity
        WHEN movement_type IN ('fornecimento_org','consumo_saida','consumo_operacao','perda_saida','perda_operacao')
          THEN -quantity
        WHEN movement_type = 'ajuste_manual' THEN quantity
        ELSE 0
      END
    ), 0)::int AS balance
    FROM inventory_movements
    WHERE item_id = $1 ${location ? 'AND location = $2' : ''}
  `, location ? [itemId, location] : [itemId]);
  return r.rows[0]?.balance || 0;
}

async function addStock({ itemId, quantity, location, type = 'apreendido', actor, memberId = null, notes = '' }) {
  if (!VALID_LOCATIONS.includes(location)) throw new Error(`Casa inválida: ${location} (deve ser 'armazem' ou 'grupo')`);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Quantidade tem de ser inteiro positivo');
  if (!['apreendido', 'craftado', 'entrega_bairrista', 'entrega_morador', 'entrega_oficial', 'devolucao_saida', 'devolucao_operacao'].includes(type)) {
    throw new Error(`Tipo de entrada inválido: ${type}`);
  }
  const r = await query(
    `INSERT INTO inventory_movements
     (movement_type, item_id, quantity, location, member_id, created_by, context, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [type, itemId, quantity, location, memberId, actor, 'add manual', notes]
  );
  await logAudit({
    action: 'stock_add', entityType: 'inventory', entityId: String(itemId),
    actorId: actor, afterState: { quantity, location, type }, context: notes,
  }).catch(() => {});
  return { id: r.rows[0].id };
}

async function removeStock({ itemId, quantity, location, type = 'venda_bairrista', actor, memberId = null, notes = '' }) {
  if (!VALID_LOCATIONS.includes(location)) throw new Error(`Casa inválida: ${location}`);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Quantidade tem de ser inteiro positivo');
  if (!['venda_bairrista', 'venda_morador', 'fornecimento_org', 'consumo_saida', 'consumo_operacao', 'perda_saida', 'perda_operacao'].includes(type)) {
    throw new Error(`Tipo de saída inválido: ${type}`);
  }
  // Aviso se vai a negativo
  const current = await getCurrentStock(itemId, location);
  if (current < quantity) {
    throw new Error(`Stock insuficiente em ${location}: tem ${current}, queres tirar ${quantity}`);
  }
  const r = await query(
    `INSERT INTO inventory_movements
     (movement_type, item_id, quantity, location, member_id, created_by, context, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [type, itemId, quantity, location, memberId, actor, 'remove manual', notes]
  );
  await logAudit({
    action: 'stock_remove', entityType: 'inventory', entityId: String(itemId),
    actorId: actor, afterState: { quantity, location, type }, context: notes,
  }).catch(() => {});
  return { id: r.rows[0].id };
}

async function transferStock({ itemId, quantity, fromLocation, toLocation, actor, notes = '' }) {
  if (!VALID_LOCATIONS.includes(fromLocation)) throw new Error(`Casa origem inválida: ${fromLocation}`);
  if (!VALID_LOCATIONS.includes(toLocation))   throw new Error(`Casa destino inválida: ${toLocation}`);
  if (fromLocation === toLocation) throw new Error('Origem e destino não podem ser iguais');
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Quantidade tem de ser inteiro positivo');

  const current = await getCurrentStock(itemId, fromLocation);
  if (current < quantity) {
    throw new Error(`Stock insuficiente em ${fromLocation}: tem ${current}, queres mover ${quantity}`);
  }

  // Par de movimentos ajuste_manual: -X numa casa, +X na outra. Saldo global mantém-se.
  const ctx = `transfer ${fromLocation} → ${toLocation}`;
  const out = await query(
    `INSERT INTO inventory_movements
     (movement_type, item_id, quantity, location, created_by, context, notes)
     VALUES ('ajuste_manual', $1, $2, $3, $4, $5, $6) RETURNING id`,
    [itemId, -quantity, fromLocation, actor, ctx, notes]
  );
  const inv = await query(
    `INSERT INTO inventory_movements
     (movement_type, item_id, quantity, location, created_by, context, notes)
     VALUES ('ajuste_manual', $1, $2, $3, $4, $5, $6) RETURNING id`,
    [itemId, quantity, toLocation, actor, ctx, notes]
  );
  await logAudit({
    action: 'stock_transfer', entityType: 'inventory', entityId: String(itemId),
    actorId: actor, afterState: { quantity, fromLocation, toLocation },
    context: notes,
  }).catch(() => {});
  return { outId: out.rows[0].id, inId: inv.rows[0].id };
}

async function adjustStock({ itemId, newTotal, location, actor, reason = 'contagem manual' }) {
  if (!VALID_LOCATIONS.includes(location)) throw new Error(`Casa inválida: ${location}`);
  if (!Number.isInteger(newTotal) || newTotal < 0) throw new Error('Novo total tem de ser inteiro >= 0');
  const current = await getCurrentStock(itemId, location);
  const delta = newTotal - current;
  if (delta === 0) return { id: null, delta: 0, message: 'já igual ao actual, nenhum movimento' };
  const r = await query(
    `INSERT INTO inventory_movements
     (movement_type, item_id, quantity, location, created_by, context, notes)
     VALUES ('ajuste_manual', $1, $2, $3, $4, $5, $6) RETURNING id`,
    [itemId, delta, location, actor, 'adjust manual', reason]
  );
  await logAudit({
    action: 'stock_adjust', entityType: 'inventory', entityId: String(itemId),
    actorId: actor,
    beforeState: { balance: current },
    afterState: { balance: newTotal, delta },
    context: reason,
  }).catch(() => {});
  return { id: r.rows[0].id, delta };
}

module.exports = {
  findItemByName, getCurrentStock,
  addStock, removeStock, transferStock, adjustStock,
  VALID_LOCATIONS,
};
