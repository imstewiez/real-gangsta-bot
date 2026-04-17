'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ButtonStyle } = require('discord.js');
const { buttonFromDef, button, buttonRow, buttonRows } = require('../src/shared/ui/buttons');

describe('shared/ui/buttons', () => {
  it('buttonFromDef constrói ButtonBuilder com style string', () => {
    const b = buttonFromDef('test::a', { label: 'Oi', style: 'Primary', emoji: '✅' });
    const json = b.toJSON();
    assert.equal(json.custom_id, 'test::a');
    assert.equal(json.label, 'Oi');
    assert.equal(json.style, ButtonStyle.Primary);
  });

  it('buttonFromDef com style numérico', () => {
    const b = buttonFromDef('test::b', { label: 'X', style: ButtonStyle.Danger });
    assert.equal(b.toJSON().style, ButtonStyle.Danger);
  });

  it('buttonFromDef cai para Secondary se style ausente', () => {
    const b = buttonFromDef('test::c', { label: 'Y' });
    assert.equal(b.toJSON().style, ButtonStyle.Secondary);
  });

  it('buttonFromDef rejeita def em falta', () => {
    assert.throws(() => buttonFromDef('test::d', null), /def em falta/);
  });

  it('button com URL usa link style', () => {
    const b = button({ label: 'Docs', style: 'Link', url: 'https://example.com' });
    const json = b.toJSON();
    assert.equal(json.url, 'https://example.com');
    assert.equal(json.style, ButtonStyle.Link);
  });

  it('button disabled=true passa ao JSON', () => {
    const b = button({ customId: 'test::d', label: 'Z', disabled: true });
    assert.equal(b.toJSON().disabled, true);
  });

  it('buttonRow rejeita mais de 5 botões', () => {
    const btns = Array.from({ length: 6 }, (_, i) => button({ customId: `t::${i}`, label: `${i}` }));
    assert.throws(() => buttonRow(...btns), /máximo 5/);
  });

  it('buttonRows auto-chunka em grupos de 5', () => {
    const btns = Array.from({ length: 12 }, (_, i) => button({ customId: `t::${i}`, label: `${i}` }));
    const rows = buttonRows(btns, 5);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].components.length, 5);
    assert.equal(rows[2].components.length, 2);
  });
});
