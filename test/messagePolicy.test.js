'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  MessageClass,
  TTL_MS,
  AUTO_DELETE,
  ttlForClass,
  autoDeletes,
  locksOnExpire,
  classFromLegacyOpts,
} = require('../src/shared/messagePolicy');
const { formatPtDate, formatPtDateOnly } = require('../src/shared/formatPtDate');

describe('messagePolicy', () => {
  it('todas as 7 classes estão definidas', () => {
    const keys = Object.keys(MessageClass).sort();
    assert.deepEqual(keys, ['BANAL', 'COCKPIT', 'ERROR', 'FLOW', 'PERSISTENT', 'RESULT', 'WARN']);
  });

  it('TTLs são coerentes com a hierarquia (BANAL < WARN < COCKPIT)', () => {
    assert.ok(TTL_MS.BANAL < TTL_MS.WARN);
    assert.ok(TTL_MS.WARN < TTL_MS.COCKPIT);
    assert.ok(TTL_MS.RESULT === TTL_MS.ERROR);
    assert.equal(TTL_MS.FLOW, null);
    assert.equal(TTL_MS.PERSISTENT, null);
  });

  it('autoDeletes distingue FLOW/PERSISTENT (false) das classes descartáveis', () => {
    assert.equal(autoDeletes('BANAL'), true);
    assert.equal(autoDeletes('COCKPIT'), true);
    assert.equal(autoDeletes('FLOW'), false);
    assert.equal(autoDeletes('PERSISTENT'), false);
  });

  it('locksOnExpire só é true para FLOW', () => {
    assert.equal(locksOnExpire('FLOW'), true);
    assert.equal(locksOnExpire('BANAL'), false);
    assert.equal(locksOnExpire('COCKPIT'), false);
  });

  it('ttlForClass default cai em BANAL', () => {
    assert.equal(ttlForClass('__UNKNOWN__'), TTL_MS.BANAL);
  });

  it('classFromLegacyOpts: dismissible=true → BANAL', () => {
    assert.equal(classFromLegacyOpts({ dismissible: true, payload: {} }), 'BANAL');
  });

  it('classFromLegacyOpts: dismissible=false → FLOW', () => {
    assert.equal(classFromLegacyOpts({ dismissible: false, payload: {} }), 'FLOW');
  });

  it('classFromLegacyOpts: componentes no payload → FLOW', () => {
    assert.equal(classFromLegacyOpts({ payload: { components: [{}] } }), 'FLOW');
  });

  it('classFromLegacyOpts: embeds sem dismissible → RESULT', () => {
    assert.equal(classFromLegacyOpts({ payload: { embeds: [{}] } }), 'RESULT');
  });

  it('classFromLegacyOpts: nada → BANAL', () => {
    assert.equal(classFromLegacyOpts({ payload: {} }), 'BANAL');
  });
});

describe('formatPtDate', () => {
  it('formata Date para dd/mm/yyyy - hh:mm', () => {
    const d = new Date(2026, 3, 16, 21, 35); // Abril (mês 3 = Abril 0-indexed)
    assert.equal(formatPtDate(d), '16/04/2026 - 21:35');
  });

  it('aceita ISO string', () => {
    const result = formatPtDate('2026-04-16T21:35:00');
    // O formato depende do fuso local; só verifica o formato geral.
    assert.match(result, /^\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}$/);
  });

  it('aceita epoch ms', () => {
    const result = formatPtDate(Date.now());
    assert.match(result, /^\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}$/);
  });

  it('input null/undefined → —', () => {
    assert.equal(formatPtDate(null), '—');
    assert.equal(formatPtDate(undefined), '—');
    assert.equal(formatPtDate(''), '—');
  });

  it('input inválido → —', () => {
    assert.equal(formatPtDate('nonsense'), '—');
  });

  it('formatPtDateOnly devolve só a data', () => {
    const d = new Date(2026, 3, 16, 21, 35);
    assert.equal(formatPtDateOnly(d), '16/04/2026');
  });

  it('padding de dia e mês', () => {
    const d = new Date(2026, 0, 3, 9, 5);
    assert.equal(formatPtDate(d), '03/01/2026 - 09:05');
  });
});
