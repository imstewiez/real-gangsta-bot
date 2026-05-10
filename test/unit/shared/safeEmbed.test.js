'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { SafeEmbedBuilder, replySafe, LIMITS } = require('../../../src/shared/safeEmbed');

describe('SafeEmbedBuilder', () => {
  it('trunca título a 256 caracteres', () => {
    const embed = new SafeEmbedBuilder().setTitle('x'.repeat(300));
    assert.ok(embed.data.title.length <= LIMITS.TITLE);
    assert.ok(embed.data.title.endsWith('…'));
  });

  it('trunca descrição a 4096 caracteres', () => {
    const embed = new SafeEmbedBuilder().setDescription('y'.repeat(5000));
    assert.ok(embed.data.description.length <= LIMITS.DESCRIPTION);
    assert.ok(embed.data.description.endsWith('…'));
  });

  it('trunca nome e valor de field', () => {
    const embed = new SafeEmbedBuilder().addFields({
      name: 'n'.repeat(300),
      value: 'v'.repeat(1500),
    });
    const field = embed.data.fields[0];
    assert.ok(field.name.length <= LIMITS.FIELD_NAME);
    assert.ok(field.value.length <= LIMITS.FIELD_VALUE);
  });

  it('trunca footer text a 2048 caracteres', () => {
    const embed = new SafeEmbedBuilder().setFooter({ text: 'f'.repeat(2500) });
    assert.ok(embed.data.footer.text.length <= LIMITS.FOOTER_TEXT);
    assert.ok(embed.data.footer.text.endsWith('…'));
  });

  it('addFieldsSafe ignora entradas inválidas', () => {
    const embed = new SafeEmbedBuilder().addFieldsSafe([
      { name: 'ok', value: 'value' },
      null,
      undefined,
      'bad',
      { value: 'missing name' },
    ]);
    assert.equal(embed.data.fields.length, 2);
    assert.equal(embed.data.fields[0].name, 'ok');
    assert.equal(embed.data.fields[1].name, '\u200b');
  });

  it('avisa e corta descrição quando JSON total excede 6000', () => {
    const embed = new SafeEmbedBuilder().setDescription('d'.repeat(1000));
    const hugeValue = 'v'.repeat(1024);
    // 5 fields de 1024 chars ≈ 5120 + 1000 desc ≈ 6120 — cortar desc resolve
    const fields = Array.from({ length: 5 }, (_, i) => ({ name: `Field ${i}`, value: hugeValue }));
    embed.addFields(fields);
    const json = embed.toJSON();
    const size = JSON.stringify(json).length;
    assert.ok(size <= LIMITS.TOTAL_EMBED, `size ${size} > ${LIMITS.TOTAL_EMBED}`);
    assert.ok(embed.data.description.length < 1000);
  });
});

describe('replySafe', () => {
  it('envia payload normal quando <= 10 embeds', async () => {
    let called = false;
    const interaction = {
      replied: false,
      deferred: false,
      reply: async (p) => { called = true; return p; },
      deleteReply: async () => {},
    };
    const payload = { embeds: [new SafeEmbedBuilder().setTitle('T')] };
    await replySafe(interaction, payload);
    assert.equal(called, true);
  });

  it('divide embeds em chunks de 10 e usa followUp', async () => {
    const embeds = Array.from({ length: 25 }, (_, i) => new SafeEmbedBuilder().setTitle(`E${i}`));
    const calls = [];
    const interaction = {
      replied: false,
      deferred: false,
      reply: async (p) => { calls.push({ method: 'reply', embedCount: p.embeds.length }); return p; },
      followUp: async (p) => { calls.push({ method: 'followUp', embedCount: p.embeds.length }); return p; },
      deleteReply: async () => {},
    };
    await replySafe(interaction, { embeds });
    assert.equal(calls.length, 3);
    assert.equal(calls[0].embedCount, 10);
    assert.equal(calls[1].embedCount, 10);
    assert.equal(calls[2].embedCount, 5);
  });

  it('usa editReply quando deferred', async () => {
    const calls = [];
    const interaction = {
      replied: false,
      deferred: true,
      editReply: async (p) => { calls.push({ method: 'editReply', embedCount: p.embeds.length }); return p; },
      followUp: async (p) => { calls.push({ method: 'followUp', embedCount: p.embeds.length }); return p; },
      deleteReply: async () => {},
    };
    const embeds = Array.from({ length: 12 }, () => new SafeEmbedBuilder().setTitle('X'));
    await replySafe(interaction, { embeds });
    assert.equal(calls[0].method, 'editReply');
    assert.equal(calls[0].embedCount, 10);
    assert.equal(calls[1].method, 'followUp');
    assert.equal(calls[1].embedCount, 2);
  });
});
