'use strict';
/**
 * Unit tests para recordDeliveryBatch + undoSubmission:
 *
 *   - submissão atómica de N itens (BEGIN/INSERT×N/COMMIT)
 *   - preço custom por linha só em vendas, persistido em unit_price
 *   - preço = base → unit_price fica NULL (economiza row)
 *   - rollback em erro de um item (stock, validação)
 *   - undo só pelo autor, dentro de 5min, com deleteSubmission
 *   - undo expirado rejeita com razão clara
 *   - role oficial → movement_type = entrega_oficial em entregas
 */

const path = require('path');
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

function resolved(rel) {
  return require.resolve(path.join(__dirname, '..', 'src', rel));
}

// ── Captura de queries + estado de mocks ──
const _insertedMovements = [];
let _failOnItemId = null; // força erro num INSERT de um item específico
let _submissionRows = [];
const _deliveryRequests = new Map();

function _reset() {
  _insertedMovements.length = 0;
  _failOnItemId = null;
  _submissionRows = [];
  _deliveryRequests.clear();
}

// Items de catálogo para mock
const _items = {
  1: { id: 1, name: 'Pregos', category: 'metais', estimated_value: 10 },
  2: { id: 2, name: 'Tábuas', category: 'madeiras', estimated_value: 20 },
  3: { id: 3, name: 'Parafusos', category: 'metais', estimated_value: 5 },
};

// Members
const _members = {
  bairrista: { id: 100, discord_id: 'B001', display_name: 'Alice', role: 'bairrista' },
  oficial: { id: 200, discord_id: 'O001', display_name: 'Bob', role: 'oficial' },
};

// Stub do DB
require.cache[resolved('db.js')] = {
  exports: {
    pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
    query: async (sql, values) => {
      if (/DELETE FROM inventory_movements WHERE submission_id/.test(sql)) {
        const sid = values[0];
        const before = _submissionRows.length;
        _submissionRows = _submissionRows.filter(r => r.submission_id !== sid);
        return { rowCount: before - _submissionRows.length };
      }
      if (/FROM inventory_movements im\s+JOIN items i/.test(sql) && /submission_id = \$1/.test(sql)) {
        const sid = values[0];
        return {
          rows: _submissionRows
            .filter(r => r.submission_id === sid)
            .map(r => ({
              ...r,
              item_name: _items[r.item_id]?.name,
              effective_price: r.unit_price ?? _items[r.item_id]?.estimated_value,
            })),
        };
      }
      if (/UPDATE inventory_movements/.test(sql) && /log_message_id/.test(sql)) {
        // attachSubmissionLogMessage
        return { rowCount: 1 };
      }
      return { rows: [] };
    },
    queryWithTransaction: async fn => {
      const inserts = [];
      const client = {
        query: async (sql, values) => {
          if (/INSERT INTO delivery_batches/.test(sql)) {
            return { rows: [{ id: values[0] }] };
          }
          if (/INSERT INTO inventory_movements/.test(sql) && /UNNEST/.test(sql)) {
            const itemIds = values[1];
            const quantities = values[2];
            const memberIds = values[3];
            const submissionIds = values[11];
            const unitPrices = values[12];
            const rows = [];
            for (let i = 0; i < itemIds.length; i++) {
              if (_failOnItemId && itemIds[i] === _failOnItemId) {
                throw new Error(`simulated INSERT failure for item ${itemIds[i]}`);
              }
              const row = {
                id: _insertedMovements.length + inserts.length + 1,
                movement_type: values[0][i],
                item_id: itemIds[i],
                quantity: quantities[i],
                member_id: memberIds[i],
                submission_id: submissionIds[i],
                unit_price: unitPrices[i],
                created_at: new Date().toISOString(),
              };
              inserts.push(row);
              rows.push(row);
            }
            return { rows };
          }
          if (/INSERT INTO inventory_movements/.test(sql)) {
            const itemId = values[1];
            if (_failOnItemId && itemId === _failOnItemId) {
              throw new Error(`simulated INSERT failure for item ${itemId}`);
            }
            const row = {
              id: _insertedMovements.length + inserts.length + 1,
              movement_type: values[0],
              item_id: itemId,
              quantity: values[2],
              member_id: values[3],
              submission_id: values[11],
              unit_price: values[12],
              created_at: new Date().toISOString(),
            };
            inserts.push(row);
            return { rows: [row] };
          }
          return { rows: [] };
        },
      };
      const result = await fn(client);
      // COMMIT only if no throw — push to global
      for (const row of inserts) _insertedMovements.push(row);
      _submissionRows.push(...inserts);
      return result;
    },
  },
};

// Stub repositories
require.cache[resolved('repositories/index.js')] = {
  exports: {
    inventoryRepo: {
      getItemById: async id => _items[id] || null,
      getStockForItem: async () => 100,
      recordMovement: async ({ client, ...args }) => {
        // Esta função delega ao client via SQL quando em transacção. Os
        // tests dispararão via queryWithTransaction, por isso o mock acima
        // devolve rows directamente ao client.query. Aqui reutilizamos:
        const values = [
          args.movementType,
          args.itemId,
          args.quantity,
          args.memberId,
          args.memberRole,
          args.origin,
          args.destination,
          args.context,
          args.notes,
          args.operationId,
          args.createdBy,
          args.submissionId,
          args.unitPrice,
        ];
        const res = await client.query(
          `INSERT INTO inventory_movements
           (movement_type, item_id, quantity, member_id, member_role, origin, destination,
            context, notes, saida_id, created_by, submission_id, unit_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          values
        );
        return res.rows[0];
      },
      recordMovementsBulk: async ({
        client,
        lines,
        movementType,
        memberId,
        memberRole,
        origin,
        destination,
        context,
        notes,
        operationId,
        createdBy,
        submissionId,
      }) => {
        const values = [
          lines.map(() => movementType),
          lines.map(l => l.itemId),
          lines.map(l => l.quantity),
          lines.map(() => memberId),
          lines.map(() => memberRole),
          lines.map(() => origin),
          lines.map(() => destination),
          lines.map(() => context),
          lines.map(() => notes),
          lines.map(() => operationId),
          lines.map(() => createdBy),
          lines.map(() => submissionId),
          lines.map(l => l.unitPrice ?? null),
        ];
        const res = await client.query(
          `INSERT INTO inventory_movements
            (movement_type, item_id, quantity, member_id, member_role, origin, destination,
             context, notes, saida_id, created_by, submission_id, unit_price)
           SELECT * FROM UNNEST(
             $1::text[], $2::int[], $3::int[], $4::int[], $5::text[], $6::text[], $7::text[],
             $8::text[], $9::text[], $10::int[], $11::text[], $12::uuid[], $13::numeric[]
           )
           RETURNING *`,
          values
        );
        return res.rows;
      },
      getSubmissionMovements: async sid =>
        _submissionRows
          .filter(r => r.submission_id === sid)
          .map(r => ({
            ...r,
            item_name: _items[r.item_id]?.name,
            effective_price: r.unit_price ?? _items[r.item_id]?.estimated_value,
            log_message_id: r.log_message_id || null,
            log_channel_id: r.log_channel_id || null,
          })),
      deleteSubmission: async sid => {
        const before = _submissionRows.length;
        _submissionRows = _submissionRows.filter(r => r.submission_id !== sid);
        return before - _submissionRows.length;
      },
      attachSubmissionLogMessage: async () => 1,
    },
    memberRepo: {
      findByDiscordId: async id => {
        if (id === _members.bairrista.discord_id) return _members.bairrista;
        if (id === _members.oficial.discord_id) return _members.oficial;
        return null;
      },
      findById: async () => null,
    },
    bairristaStatsRepo: {
      getWeeklyMaterialStats: async () => ({ totalQty: 0, deliveries: 0, sales: 0 }),
      getRankingPosition: async () => ({ position: 5, total: 10 }),
    },
    deliveryRequestRepo: {
      create: async data => {
        const row = {
          id: data.id,
          requester_member_id: data.requesterMemberId,
          requester_discord_id: data.requesterDiscordId,
          approver_discord_id: data.approverDiscordId,
          status: 'pending',
          lines: data.lines,
          notes: data.notes,
          total_qty: data.totalQty,
          total_value: data.totalValue,
          created_by: data.createdBy,
          created_at: new Date().toISOString(),
        };
        _deliveryRequests.set(row.id, row);
        return row;
      },
      findPendingByIdForUpdate: async id => _deliveryRequests.get(id) || null,
      markDecision: async (id, patch) => {
        const row = _deliveryRequests.get(id);
        if (!row) return null;
        Object.assign(row, {
          status: patch.status,
          decision_by: patch.decisionBy,
          decision_reason: patch.decisionReason || '',
          movement_submission_id: patch.movementSubmissionId || null,
          decided_at: new Date().toISOString(),
        });
        return row;
      },
    },
  },
};

// Stubs periféricos
require.cache[resolved('audit/auditEngine.js')] = {
  exports: {
    logAudit: async () => {},
    sendAuditToChannel: async () => {},
  },
};
require.cache[resolved('lib/metrics.js')] = {
  exports: new Proxy({}, { get: () => ({ inc: () => {}, set: () => {} }) }),
};
require.cache[resolved('inventory/stockNotifier.js')] = {
  exports: { notifyMovement: async () => {}, setClient: () => {} },
};
require.cache[resolved('inventory/bairristaNotifier.js')] = {
  exports: {
    notifyBairristaMovement: async () => ({}),
    notifyBairristaBatch: async () => ({ messageId: 'msg-123', channelId: 'ch-456' }),
    editBairristaBatchAsCancelled: async () => true,
    setClient: () => {},
  },
};
require.cache[resolved('core/eventBus.js')] = {
  exports: { emitAsync: async () => {} },
};
require.cache[resolved('repositories/inventoryBalance.js')] = {
  exports: {
    recalculateBalance: async () => 0,
    getBalance: async () => 0,
    touchBalance: async () => 0,
  },
};

const {
  recordDeliveryBatch,
  createDeliveryRequest,
  decideDeliveryRequest,
  undoSubmission,
  UNDO_WINDOW_MS,
} = require('../src/inventory/inventoryEngine');

// ═══════════════════════════════════════════════════════════════════════════
// recordDeliveryBatch
// ═══════════════════════════════════════════════════════════════════════════

describe('recordDeliveryBatch — submissão atómica', () => {
  beforeEach(() => _reset());

  it('insere N movements com o mesmo submission_id', async () => {
    const r = await recordDeliveryBatch({
      discordId: _members.bairrista.discord_id,
      tipo: 'entrega',
      lines: [
        { itemId: 1, quantity: 5 },
        { itemId: 2, quantity: 10 },
      ],
      createdBy: _members.bairrista.discord_id,
    });
    assert.equal(r.movements.length, 2);
    const sids = new Set(r.movements.map(m => m.submission_id));
    assert.equal(sids.size, 1, 'todos partilham o mesmo submission_id');
    assert.equal(typeof r.submissionId, 'string');
    assert.match(r.submissionId, /^[0-9a-f-]{36}$/);
  });

  it('vazio atira erro', async () => {
    await assert.rejects(
      recordDeliveryBatch({
        discordId: _members.bairrista.discord_id,
        tipo: 'entrega',
        lines: [],
        createdBy: 'x',
      }),
      /Carrinho vazio/
    );
  });

  it('rollback se um INSERT falhar — nenhum movement persiste', async () => {
    _failOnItemId = 2; // simula falha no INSERT do item 2
    await assert.rejects(
      recordDeliveryBatch({
        discordId: _members.bairrista.discord_id,
        tipo: 'entrega',
        lines: [
          { itemId: 1, quantity: 5 },
          { itemId: 2, quantity: 10 },
          { itemId: 3, quantity: 3 },
        ],
        createdBy: 'x',
      }),
      /simulated INSERT failure/
    );
    assert.equal(_insertedMovements.length, 0, 'transacção deu rollback; nada persistiu');
    assert.equal(_submissionRows.length, 0);
  });

  it('oficial faz entrega_oficial em entregas, venda_bairrista em vendas', async () => {
    const r1 = await recordDeliveryBatch({
      discordId: _members.oficial.discord_id,
      tipo: 'entrega',
      lines: [{ itemId: 1, quantity: 5 }],
      createdBy: 'x',
    });
    assert.equal(r1.movementType, 'entrega_oficial');

    _reset();
    const r2 = await recordDeliveryBatch({
      discordId: _members.oficial.discord_id,
      tipo: 'venda',
      lines: [{ itemId: 1, quantity: 5 }],
      createdBy: 'x',
    });
    assert.equal(r2.movementType, 'venda_bairrista');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Custom price
// ═══════════════════════════════════════════════════════════════════════════

describe('recordDeliveryBatch — preço custom', () => {
  beforeEach(() => _reset());

  it('venda com unitPrice custom persiste em unit_price', async () => {
    const r = await recordDeliveryBatch({
      discordId: _members.bairrista.discord_id,
      tipo: 'venda',
      lines: [{ itemId: 1, quantity: 10, unitPrice: 15 }], // base=10, custom=15
      createdBy: 'x',
    });
    assert.equal(r.lines[0].unitPrice, 15);
    assert.equal(r.lines[0].effectivePrice, 15);
    assert.equal(r.movements[0].unit_price, 15);
  });

  it('venda com preço igual ao base → unit_price NULL', async () => {
    const r = await recordDeliveryBatch({
      discordId: _members.bairrista.discord_id,
      tipo: 'venda',
      lines: [{ itemId: 1, quantity: 10, unitPrice: 10 }], // === base
      createdBy: 'x',
    });
    assert.equal(r.lines[0].unitPrice, null, 'sem custom → NULL (evita row redundante)');
    assert.equal(r.lines[0].effectivePrice, 10);
  });

  it('entrega ignora unitPrice — sempre base', async () => {
    const r = await recordDeliveryBatch({
      discordId: _members.bairrista.discord_id,
      tipo: 'entrega',
      lines: [{ itemId: 1, quantity: 10, unitPrice: 999 }], // tentativa de custom
      createdBy: 'x',
    });
    assert.equal(r.lines[0].unitPrice, null);
    assert.equal(r.lines[0].effectivePrice, 10);
  });

  it('totalValue soma com preços custom', async () => {
    const r = await recordDeliveryBatch({
      discordId: _members.bairrista.discord_id,
      tipo: 'venda',
      lines: [
        { itemId: 1, quantity: 5, unitPrice: 15 }, // 5 × 15 = 75
        { itemId: 2, quantity: 3 }, // 3 × 20 = 60 (base)
      ],
      createdBy: 'x',
    });
    assert.equal(r.totalValue, 135);
    assert.equal(r.totalQty, 8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// undoSubmission
// ═══════════════════════════════════════════════════════════════════════════

describe('undoSubmission — janela + ownership', () => {
  beforeEach(() => _reset());

  it('desfaz dentro da janela, hard delete', async () => {
    const sub = await recordDeliveryBatch({
      discordId: _members.bairrista.discord_id,
      tipo: 'entrega',
      lines: [
        { itemId: 1, quantity: 5 },
        { itemId: 2, quantity: 10 },
      ],
      createdBy: _members.bairrista.discord_id,
    });

    const r = await undoSubmission({
      submissionId: sub.submissionId,
      requesterDiscordId: _members.bairrista.discord_id,
      client: null,
    });
    assert.equal(r.undone, true);
    assert.equal(r.deletedCount, 2);
    assert.equal(_submissionRows.length, 0);
  });

  it('rejeita se não é o autor', async () => {
    const sub = await recordDeliveryBatch({
      discordId: _members.bairrista.discord_id,
      tipo: 'entrega',
      lines: [{ itemId: 1, quantity: 5 }],
      createdBy: _members.bairrista.discord_id,
    });
    const r = await undoSubmission({
      submissionId: sub.submissionId,
      requesterDiscordId: _members.oficial.discord_id, // outro user
      client: null,
    });
    assert.equal(r.undone, false);
    assert.match(r.reason, /tuas próprias/);
    // Não apagou
    assert.equal(_submissionRows.length, 1);
  });

  it('rejeita se janela expirou (> 5min)', async () => {
    const sub = await recordDeliveryBatch({
      discordId: _members.bairrista.discord_id,
      tipo: 'entrega',
      lines: [{ itemId: 1, quantity: 5 }],
      createdBy: _members.bairrista.discord_id,
    });
    // Recua o created_at das rows 6min
    for (const row of _submissionRows) {
      row.created_at = new Date(Date.now() - 6 * 60_000).toISOString();
    }
    const r = await undoSubmission({
      submissionId: sub.submissionId,
      requesterDiscordId: _members.bairrista.discord_id,
      client: null,
    });
    assert.equal(r.undone, false);
    assert.match(r.reason, /5 min/);
    assert.equal(_submissionRows.length, 1);
  });

  it('rejeita se submission não existe', async () => {
    const r = await undoSubmission({
      submissionId: '00000000-0000-0000-0000-000000000000',
      requesterDiscordId: _members.bairrista.discord_id,
      client: null,
    });
    assert.equal(r.undone, false);
    assert.match(r.reason, /já não existe/);
  });

  it('UNDO_WINDOW_MS = 5 min', () => {
    assert.equal(UNDO_WINDOW_MS, 5 * 60_000);
  });
});

describe('delivery requests - confirmacao OG+', () => {
  beforeEach(() => _reset());

  it('criar pedido pendente nao insere movements', async () => {
    const r = await createDeliveryRequest({
      discordId: _members.bairrista.discord_id,
      approverDiscordId: _members.oficial.discord_id,
      lines: [{ itemId: 1, quantity: 7 }],
      createdBy: _members.bairrista.discord_id,
    });

    assert.equal(r.request.status, 'pending');
    assert.equal(r.totalQty, 7);
    assert.equal(_insertedMovements.length, 0);
    assert.equal(_submissionRows.length, 0);
  });

  it('aprovar pedido cria ledger para o bairrista', async () => {
    const pending = await createDeliveryRequest({
      discordId: _members.bairrista.discord_id,
      approverDiscordId: _members.oficial.discord_id,
      lines: [{ itemId: 1, quantity: 7 }],
      createdBy: _members.bairrista.discord_id,
    });

    const r = await decideDeliveryRequest({
      requestId: pending.request.id,
      decisionBy: _members.oficial.discord_id,
      approve: true,
    });

    assert.equal(r.ok, true);
    assert.equal(r.approved, true);
    assert.equal(r.request.status, 'approved');
    assert.equal(_insertedMovements.length, 1);
    assert.equal(_insertedMovements[0].movement_type, 'entrega_bairrista');
    assert.equal(_insertedMovements[0].member_id, _members.bairrista.id);
  });

  it('recusar pedido nao cria ledger', async () => {
    const pending = await createDeliveryRequest({
      discordId: _members.bairrista.discord_id,
      approverDiscordId: _members.oficial.discord_id,
      lines: [{ itemId: 1, quantity: 7 }],
      createdBy: _members.bairrista.discord_id,
    });

    const r = await decideDeliveryRequest({
      requestId: pending.request.id,
      decisionBy: _members.oficial.discord_id,
      approve: false,
    });

    assert.equal(r.ok, true);
    assert.equal(r.approved, false);
    assert.equal(r.request.status, 'rejected');
    assert.equal(_insertedMovements.length, 0);
  });

  it('nao decide pedido ja aprovado', async () => {
    const pending = await createDeliveryRequest({
      discordId: _members.bairrista.discord_id,
      approverDiscordId: _members.oficial.discord_id,
      lines: [{ itemId: 1, quantity: 7 }],
      createdBy: _members.bairrista.discord_id,
    });

    // Primeira aprovação funciona
    const r1 = await decideDeliveryRequest({
      requestId: pending.request.id,
      decisionBy: _members.oficial.discord_id,
      approve: true,
    });
    assert.equal(r1.ok, true);

    // Segunda tentativa falha porque já foi aprovado
    _insertedMovements.length = 0; // reset para verificar que não insere mais
    const r2 = await decideDeliveryRequest({
      requestId: pending.request.id,
      decisionBy: _members.oficial.discord_id,
      approve: true,
    });

    assert.equal(r2.ok, false);
    assert.match(r2.reason, /já foi aprovado/);
    assert.equal(_insertedMovements.length, 0);
  });
});
