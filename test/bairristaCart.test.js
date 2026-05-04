'use strict';
/**
 * Unit tests para bairristaCart (state module):
 *
 *   - createCart / getCart / clearCart
 *   - addLine com merge automático (mesmo item + mesmo preço)
 *   - addLine sem merge se preço diferente (venda com custom)
 *   - removeLine boundary checks
 *   - totals (qty + value)
 *   - buildCartEmbed: vazio vs com linhas, notes, extraNote
 *   - buildCartComponents: submit disabled quando vazio, repeat button conditional
 *   - buildSubmissionFeedback: undo button com submissionId
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_BOT_TOKEN ||= 'test-token';
process.env.DISCORD_GUILD_ID ||= 'test-guild';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test_db';

const bairristaCart = require('../src/inventory/bairristaCart');

// Reset entre testes — importa que o sessionStore seja limpo
function _reset(discordId) {
  bairristaCart.clearCart(discordId);
}

// ═══════════════════════════════════════════════════════════════════════════
// State lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe('bairristaCart — state', () => {
  beforeEach(() => _reset('U001'));

  it('createCart inicia vazio e persiste', () => {
    const c = bairristaCart.createCart('U001', 'entrega');
    assert.equal(c.tipo, 'entrega');
    assert.deepEqual(c.lines, []);
    assert.equal(c.globalNotes, '');

    const got = bairristaCart.getCart('U001');
    assert.equal(got.tipo, 'entrega');
  });

  it('getCart em user sem cart → null', () => {
    assert.equal(bairristaCart.getCart('never'), null);
  });

  it('clearCart remove do store', () => {
    bairristaCart.createCart('U001', 'venda');
    bairristaCart.clearCart('U001');
    assert.equal(bairristaCart.getCart('U001'), null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// addLine / merge logic
// ═══════════════════════════════════════════════════════════════════════════

describe('bairristaCart — addLine merge', () => {
  beforeEach(() => _reset('U001'));

  it('linhas diferentes não são fundidas', () => {
    const c = bairristaCart.createCart('U001', 'entrega');
    bairristaCart.addLine(c, { itemId: 1, itemName: 'Pregos', category: 'metais', quantity: 5, basePrice: 10 });
    bairristaCart.addLine(c, { itemId: 2, itemName: 'Tábuas', category: 'madeiras', quantity: 3, basePrice: 20 });
    assert.equal(c.lines.length, 2);
  });

  it('mesmo itemId + mesmo preço (null) → merge por soma', () => {
    const c = bairristaCart.createCart('U001', 'entrega');
    bairristaCart.addLine(c, { itemId: 1, itemName: 'Pregos', category: 'metais', quantity: 5, basePrice: 10 });
    bairristaCart.addLine(c, { itemId: 1, itemName: 'Pregos', category: 'metais', quantity: 3, basePrice: 10 });
    assert.equal(c.lines.length, 1);
    assert.equal(c.lines[0].quantity, 8);
  });

  it('mesmo itemId mas preço custom diferente → NÃO funde', () => {
    const c = bairristaCart.createCart('U001', 'venda');
    bairristaCart.addLine(c, {
      itemId: 1,
      itemName: 'Pregos',
      category: 'metais',
      quantity: 5,
      unitPrice: 15,
      basePrice: 10,
    });
    bairristaCart.addLine(c, {
      itemId: 1,
      itemName: 'Pregos',
      category: 'metais',
      quantity: 3,
      unitPrice: 20,
      basePrice: 10,
    });
    assert.equal(c.lines.length, 2, 'preços diferentes → linhas separadas');
  });

  it('mesmo itemId: um com custom, outro sem → não funde', () => {
    const c = bairristaCart.createCart('U001', 'venda');
    bairristaCart.addLine(c, {
      itemId: 1,
      itemName: 'Pregos',
      category: 'metais',
      quantity: 5,
      unitPrice: 15,
      basePrice: 10,
    });
    bairristaCart.addLine(c, {
      itemId: 1,
      itemName: 'Pregos',
      category: 'metais',
      quantity: 3,
      unitPrice: null,
      basePrice: 10,
    });
    assert.equal(c.lines.length, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// removeLine
// ═══════════════════════════════════════════════════════════════════════════

describe('bairristaCart — removeLine', () => {
  beforeEach(() => _reset('U001'));

  it('remove por índice válido', () => {
    const c = bairristaCart.createCart('U001', 'entrega');
    bairristaCart.addLine(c, { itemId: 1, itemName: 'A', category: 'x', quantity: 1, basePrice: 1 });
    bairristaCart.addLine(c, { itemId: 2, itemName: 'B', category: 'x', quantity: 1, basePrice: 1 });
    const ok = bairristaCart.removeLine(c, 0);
    assert.equal(ok, true);
    assert.equal(c.lines.length, 1);
    assert.equal(c.lines[0].itemId, 2);
  });

  it('índice inválido → false, lista intacta', () => {
    const c = bairristaCart.createCart('U001', 'entrega');
    bairristaCart.addLine(c, { itemId: 1, itemName: 'A', category: 'x', quantity: 1, basePrice: 1 });
    assert.equal(bairristaCart.removeLine(c, -1), false);
    assert.equal(bairristaCart.removeLine(c, 99), false);
    assert.equal(c.lines.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// totals
// ═══════════════════════════════════════════════════════════════════════════

describe('bairristaCart — totals', () => {
  it('soma qty + value com preços mistos', () => {
    const c = bairristaCart.createCart('U001', 'venda');
    bairristaCart.addLine(c, { itemId: 1, itemName: 'A', category: 'x', quantity: 5, unitPrice: 15, basePrice: 10 });
    bairristaCart.addLine(c, { itemId: 2, itemName: 'B', category: 'x', quantity: 3, unitPrice: null, basePrice: 20 });
    const t = bairristaCart.totals(c);
    assert.equal(t.totalQty, 8);
    assert.equal(t.totalValue, 5 * 15 + 3 * 20); // 75 + 60 = 135
    bairristaCart.clearCart('U001');
  });

  it('carrinho vazio → 0/0', () => {
    const c = bairristaCart.createCart('U999', 'entrega');
    const t = bairristaCart.totals(c);
    assert.equal(t.totalQty, 0);
    assert.equal(t.totalValue, 0);
    bairristaCart.clearCart('U999');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildCartEmbed
// ═══════════════════════════════════════════════════════════════════════════

describe('bairristaCart — buildCartEmbed', () => {
  it('embed vazio mostra "carrinho vazio"', () => {
    const c = bairristaCart.createCart('U1', 'entrega');
    const embed = bairristaCart.buildCartEmbed(c);
    assert.match(embed.data.description, /Carrinho vazio/);
    bairristaCart.clearCart('U1');
  });

  it('embed com linhas mostra total + items', () => {
    const c = bairristaCart.createCart('U2', 'entrega');
    bairristaCart.addLine(c, { itemId: 1, itemName: 'Pregos', category: 'metais', quantity: 5, basePrice: 10 });
    const embed = bairristaCart.buildCartEmbed(c);
    assert.match(embed.data.description, /Pregos/);
    assert.match(embed.data.description, /5×/);
    assert.match(embed.data.description, /Total/);
    bairristaCart.clearCart('U2');
  });

  it('flag ⚡ em linha de venda com preço custom', () => {
    const c = bairristaCart.createCart('U3', 'venda');
    bairristaCart.addLine(c, {
      itemId: 1,
      itemName: 'Pregos',
      category: 'metais',
      quantity: 5,
      unitPrice: 15,
      basePrice: 10,
    });
    const embed = bairristaCart.buildCartEmbed(c);
    assert.match(embed.data.description, /⚡/);
    bairristaCart.clearCart('U3');
  });

  it('notas globais aparecem no embed', () => {
    const c = bairristaCart.createCart('U4', 'entrega');
    bairristaCart.addLine(c, { itemId: 1, itemName: 'A', category: 'x', quantity: 1, basePrice: 1 });
    bairristaCart.setNotes(c, 'Entrega noturna');
    const embed = bairristaCart.buildCartEmbed(c);
    assert.match(embed.data.description, /Entrega noturna/);
    bairristaCart.clearCart('U4');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildCartComponents — submit disabled, repeat conditional
// ═══════════════════════════════════════════════════════════════════════════

describe('bairristaCart — buildCartComponents', () => {
  it('submit disabled quando carrinho vazio', () => {
    const c = bairristaCart.createCart('U5', 'entrega');
    const rows = bairristaCart.buildCartComponents(c, { canRepeat: false });
    // Row 2 é Submit/Cancel
    const submitBtn = rows[1].components.find(btn => btn.data.custom_id.startsWith('invcart::submit'));
    assert.equal(submitBtn.data.disabled, true);
    bairristaCart.clearCart('U5');
  });

  it('submit habilitado quando há linhas', () => {
    const c = bairristaCart.createCart('U6', 'entrega');
    bairristaCart.addLine(c, { itemId: 1, itemName: 'A', category: 'x', quantity: 1, basePrice: 1 });
    const rows = bairristaCart.buildCartComponents(c, { canRepeat: false });
    const submitBtn = rows[1].components.find(btn => btn.data.custom_id.startsWith('invcart::submit'));
    assert.equal(submitBtn.data.disabled, false);
    bairristaCart.clearCart('U6');
  });

  it('repeat button só aparece se canRepeat=true', () => {
    const c = bairristaCart.createCart('U7', 'entrega');
    const noRepeat = bairristaCart.buildCartComponents(c, { canRepeat: false });
    const hasRepeat1 = noRepeat[0].components.some(btn => btn.data.custom_id?.startsWith('invcart::repeat'));
    assert.equal(hasRepeat1, false);

    const withRepeat = bairristaCart.buildCartComponents(c, { canRepeat: true });
    const hasRepeat2 = withRepeat[0].components.some(btn => btn.data.custom_id?.startsWith('invcart::repeat'));
    assert.equal(hasRepeat2, true);
    bairristaCart.clearCart('U7');
  });

  it('select de remove aparece só com linhas', () => {
    const c = bairristaCart.createCart('U8', 'entrega');
    const empty = bairristaCart.buildCartComponents(c, {});
    assert.equal(empty.length, 2, 'vazio: Add row + Submit row');

    bairristaCart.addLine(c, { itemId: 1, itemName: 'A', category: 'x', quantity: 1, basePrice: 1 });
    const withLines = bairristaCart.buildCartComponents(c, {});
    assert.equal(withLines.length, 3, 'com linhas: Add + Submit + line_action select');
    bairristaCart.clearCart('U8');
  });

  it('componentes de decisão de entrega serializam sem emojis inválidos', () => {
    const decisionRows = bairristaCart.buildDeliveryDecisionComponents('12345678-aaaa-bbbb-cccc-ddddeeeeffff');

    assert.doesNotThrow(() => decisionRows.map(row => row.toJSON()));
  });

  it('embed de pedido de entrega não tem mojibake no texto visível', () => {
    const embed = bairristaCart.buildDeliveryRequestEmbed({
      requestId: '12345678-aaaa-bbbb-cccc-ddddeeeeffff',
      memberName: 'Alice',
      memberDiscordId: '111',
      lines: [{ itemName: 'Ferro', quantity: 2 }],
      totalQty: 2,
      totalValue: 50,
      notes: 'Tudo ok',
    });
    const visible = JSON.stringify(embed.toJSON());

    assert.match(visible, /confirmação/);
    assert.match(visible, /50€/);
    assert.doesNotMatch(visible, /Ã|Â|â/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildSubmissionFeedback — undo button
// ═══════════════════════════════════════════════════════════════════════════

describe('bairristaCart — buildSubmissionFeedback', () => {
  it('embed + undo button com o submission id', () => {
    const sid = '12345678-aaaa-bbbb-cccc-ddddeeeeffff';
    const { embed, components } = bairristaCart.buildSubmissionFeedback({
      submissionId: sid,
      tipo: 'venda',
      totalQty: 10,
      totalValue: 500,
      lineCount: 2,
    });
    assert.match(embed.data.title, /Venda/);
    assert.match(embed.data.description, /2/); // lineCount
    assert.match(embed.data.description, /10/); // qty
    const undoBtn = components[0].components.find(c => c.data.custom_id?.includes('invcart::undo'));
    assert.ok(undoBtn, 'tem botão undo');
    assert.equal(undoBtn.data.custom_id, `invcart::undo::${sid}`);
  });
});
