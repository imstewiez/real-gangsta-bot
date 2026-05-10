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

const { query, queryWithTransaction } = require('../db');
const { logAudit } = require('../audit/auditEngine');
const eventBus = require('../core/eventBus');
const { MOVEMENT_TYPE, STOCK_INFLOW_TYPES, STOCK_OUTFLOW_TYPES } = require('../shared/movementTypes');
const { withAdvisoryLock } = require('../shared/advisoryLocks');
const inventoryBalanceRepo = require('../repositories/inventoryBalance');
const { ValidationError, ConflictError } = require('../shared/errors');

const VALID_LOCATIONS = ['armazem', 'grupo'];

function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function findItemByName(name) {
  if (!name) return null;
  // Tenta match exacto primeiro
  const r = await query(
    'SELECT id, name, category, unit, estimated_value FROM items WHERE name ILIKE $1 AND active = true',
    [name]
  );
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
  if (location) {
    return inventoryBalanceRepo.getBalance(itemId, location);
  }
  const r = await query(
    `
    SELECT COALESCE(SUM(
      CASE
        WHEN movement_type = ANY($2::text[])
          THEN quantity
        WHEN movement_type = ANY($3::text[])
          THEN -quantity
        WHEN movement_type = $4 THEN quantity
        ELSE 0
      END
    ), 0)::int AS balance
    FROM inventory_movements
    WHERE item_id = $1 AND ($5::text IS NULL OR location = $5)
  `,
    [itemId, STOCK_INFLOW_TYPES, STOCK_OUTFLOW_TYPES, MOVEMENT_TYPE.AJUSTE_MANUAL, location]
  );
  return r.rows[0]?.balance || 0;
}

async function addStock({ itemId, quantity, location, type = 'apreendido', actor, memberId = null, notes = '' }) {
  if (!VALID_LOCATIONS.includes(location))
    throw new ValidationError(`Casa inválida: ${location} (deve ser 'armazem' ou 'grupo')`, {
      code: 'INVALID_LOCATION',
    });
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new ValidationError('Quantidade tem de ser inteiro positivo', { code: 'INVALID_QUANTITY' });
  const VALID_INFLOW_TYPES = [
    MOVEMENT_TYPE.APREENDIDO,
    MOVEMENT_TYPE.CRAFTADO,
    MOVEMENT_TYPE.ENTREGA_BAIRRISTA,
    MOVEMENT_TYPE.ENTREGA_OFICIAL,
    MOVEMENT_TYPE.DEVOLUCAO_SAIDA,
  ];
  if (!VALID_INFLOW_TYPES.includes(type)) {
    throw new ValidationError(`Tipo de entrada inválido: ${type}`, { code: 'INVALID_MOVEMENT_TYPE' });
  }
  const r = await query(
    `INSERT INTO inventory_movements
     (movement_type, item_id, quantity, location, member_id, created_by, context, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [type, itemId, quantity, location, memberId, actor, 'add manual', notes]
  );
  await logAudit({
    action: 'stock_add',
    entityType: 'inventory',
    entityId: String(itemId),
    actorId: actor,
    afterState: { quantity, location, type },
    context: notes,
  }).catch(() => {});
  return { id: r.rows[0].id };
}

async function removeStock({
  itemId,
  quantity,
  location,
  type = 'venda_bairrista',
  actor,
  memberId = null,
  notes = '',
}) {
  if (!VALID_LOCATIONS.includes(location))
    throw new ValidationError(`Casa inválida: ${location}`, { code: 'INVALID_LOCATION' });
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new ValidationError('Quantidade tem de ser inteiro positivo', { code: 'INVALID_QUANTITY' });
  const VALID_OUTFLOW_TYPES = [
    MOVEMENT_TYPE.VENDA_BAIRRISTA,
    MOVEMENT_TYPE.FORNECIMENTO_ORG,
    MOVEMENT_TYPE.CONSUMO_SAIDA,
    MOVEMENT_TYPE.PERDA_SAIDA,
  ];
  if (!VALID_OUTFLOW_TYPES.includes(type)) {
    throw new ValidationError(`Tipo de saída inválido: ${type}`, { code: 'INVALID_MOVEMENT_TYPE' });
  }

  const run = async client => {
    const currentRes = await client.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN movement_type = ANY($2::text[])
            THEN quantity
          WHEN movement_type = ANY($3::text[])
            THEN -quantity
          WHEN movement_type = $4 THEN quantity
          ELSE 0
        END
      ), 0)::int AS balance
      FROM inventory_movements
      WHERE item_id = $1 AND ($5::text IS NULL OR location = $5)
    `,
      [itemId, STOCK_INFLOW_TYPES, STOCK_OUTFLOW_TYPES, MOVEMENT_TYPE.AJUSTE_MANUAL, location]
    );
    const current = currentRes.rows[0]?.balance || 0;
    if (current < quantity) {
      throw new ConflictError(`Stock insuficiente em ${location}: tem ${current}, queres tirar ${quantity}`, {
        code: 'INSUFFICIENT_STOCK',
      });
    }

    const r = await client.query(
      `INSERT INTO inventory_movements
       (movement_type, item_id, quantity, location, member_id, created_by, context, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [type, itemId, quantity, location, memberId, actor, 'remove manual', notes]
    );
    await inventoryBalanceRepo.touchBalance(itemId, location, -quantity, client);
    await logAudit({
      action: 'stock_remove',
      entityType: 'inventory',
      entityId: String(itemId),
      actorId: actor,
      afterState: { quantity, location, type },
      context: notes,
    }).catch(() => {});
    return { id: r.rows[0].id };
  };

  return withAdvisoryLock(`stock-transfer:${itemId}:${fromLocation}`, run);
}

async function transferStock({ itemId, quantity, fromLocation, toLocation, actor, memberId = null, notes = '' }) {
  if (!VALID_LOCATIONS.includes(fromLocation))
    throw new ValidationError(`Casa origem inválida: ${fromLocation}`, { code: 'INVALID_LOCATION' });
  if (!VALID_LOCATIONS.includes(toLocation))
    throw new ValidationError(`Casa destino inválida: ${toLocation}`, { code: 'INVALID_LOCATION' });
  if (fromLocation === toLocation)
    throw new ValidationError('Origem e destino não podem ser iguais', { code: 'INVALID_LOCATION' });
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new ValidationError('Quantidade tem de ser inteiro positivo', { code: 'INVALID_QUANTITY' });

  const run = async client => {
    const currentRes = await client.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN movement_type = ANY($2::text[])
            THEN quantity
          WHEN movement_type = ANY($3::text[])
            THEN -quantity
          WHEN movement_type = $4 THEN quantity
          ELSE 0
        END
      ), 0)::int AS balance
      FROM inventory_movements
      WHERE item_id = $1 AND ($5::text IS NULL OR location = $5)
    `,
      [itemId, STOCK_INFLOW_TYPES, STOCK_OUTFLOW_TYPES, MOVEMENT_TYPE.AJUSTE_MANUAL, fromLocation]
    );
    const current = currentRes.rows[0]?.balance || 0;
    if (current < quantity) {
      throw new ConflictError(`Stock insuficiente em ${fromLocation}: tem ${current}, queres mover ${quantity}`, {
        code: 'INSUFFICIENT_STOCK',
      });
    }

    // Par de movimentos ajuste_manual: -X numa casa, +X na outra. Saldo global mantém-se.
    const ctx = `transfer ${fromLocation} → ${toLocation}`;
    const out = await client.query(
      `INSERT INTO inventory_movements
       (movement_type, item_id, quantity, location, created_by, context, notes)
       VALUES ('ajuste_manual', $1, $2, $3, $4, $5, $6) RETURNING id`,
      [itemId, -quantity, fromLocation, actor, ctx, notes]
    );
    const inv = await client.query(
      `INSERT INTO inventory_movements
       (movement_type, item_id, quantity, location, created_by, context, notes)
       VALUES ('ajuste_manual', $1, $2, $3, $4, $5, $6) RETURNING id`,
      [itemId, quantity, toLocation, actor, ctx, notes]
    );
    await inventoryBalanceRepo.touchBalance(itemId, fromLocation, -quantity, client);
    await inventoryBalanceRepo.touchBalance(itemId, toLocation, quantity, client);
    await logAudit({
      action: 'stock_transfer',
      entityType: 'inventory',
      entityId: String(itemId),
      actorId: actor,
      afterState: { quantity, fromLocation, toLocation },
      context: notes,
    }).catch(() => {});

    eventBus
      .emitAsync('material.transferred', {
        itemId,
        quantity,
        fromLocation,
        toLocation,
        actorId: actor,
        notes,
        outMovementId: out.rows[0].id,
        inMovementId: inv.rows[0].id,
        at: new Date(),
      })
      .catch(() => {});

    return { outId: out.rows[0].id, inId: inv.rows[0].id };
  };

  if (memberId) {
    return withAdvisoryLock(`inventory:${memberId}`, run);
  }
  return queryWithTransaction(run);
}

async function adjustStock({ itemId, newTotal, location, actor, memberId = null, reason = 'contagem manual' }) {
  if (!VALID_LOCATIONS.includes(location))
    throw new ValidationError(`Casa inválida: ${location}`, { code: 'INVALID_LOCATION' });
  if (!Number.isInteger(newTotal) || newTotal < 0)
    throw new ValidationError('Novo total tem de ser inteiro >= 0', { code: 'INVALID_QUANTITY' });

  const run = async client => {
    const currentRes = await client.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN movement_type = ANY($2::text[])
            THEN quantity
          WHEN movement_type = ANY($3::text[])
            THEN -quantity
          WHEN movement_type = $4 THEN quantity
          ELSE 0
        END
      ), 0)::int AS balance
      FROM inventory_movements
      WHERE item_id = $1 AND ($5::text IS NULL OR location = $5)
    `,
      [itemId, STOCK_INFLOW_TYPES, STOCK_OUTFLOW_TYPES, MOVEMENT_TYPE.AJUSTE_MANUAL, location]
    );
    const current = currentRes.rows[0]?.balance || 0;
    const delta = newTotal - current;
    if (delta === 0) return { id: null, delta: 0, message: 'já igual ao actual, nenhum movimento' };
    const r = await client.query(
      `INSERT INTO inventory_movements
       (movement_type, item_id, quantity, location, created_by, context, notes)
       VALUES ('ajuste_manual', $1, $2, $3, $4, $5, $6) RETURNING id`,
      [itemId, delta, location, actor, 'adjust manual', reason]
    );
    await inventoryBalanceRepo.touchBalance(itemId, location, delta, client);
    await logAudit({
      action: 'stock_adjust',
      entityType: 'inventory',
      entityId: String(itemId),
      actorId: actor,
      beforeState: { balance: current },
      afterState: { balance: newTotal, delta },
      context: reason,
    }).catch(() => {});
    return { id: r.rows[0].id, delta };
  };

  if (memberId) {
    return withAdvisoryLock(`inventory:${memberId}`, run);
  }
  return queryWithTransaction(run);
}

module.exports = {
  findItemByName,
  getCurrentStock,
  addStock,
  removeStock,
  transferStock,
  adjustStock,
  VALID_LOCATIONS,
};
