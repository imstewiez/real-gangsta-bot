'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Rankings Utils', () => {
  it('should calculate week bounds correctly', () => {
    const { weekBounds } = require('../src/util');

    // Wednesday 2026-04-15
    const { start, end } = weekBounds(new Date('2026-04-15'));
    assert.equal(start.getDay(), 1); // Monday
    assert.equal(end.getDay(), 0); // Sunday
    assert.ok(start < end);
  });

  it('should handle Sunday correctly', () => {
    const { weekBounds } = require('../src/util');

    // Sunday 2026-04-19
    const { start, end } = weekBounds(new Date('2026-04-19'));
    assert.equal(start.getDay(), 1);
    assert.ok(start <= new Date('2026-04-19'));
    assert.ok(end >= new Date('2026-04-19'));
  });

  it('should truncate strings correctly', () => {
    const { truncate } = require('../src/util');

    assert.equal(truncate('hello', 10), 'hello');
    assert.equal(truncate('a very long string here', 10), 'a very...');
    assert.equal(truncate('', 10), '');
    assert.equal(truncate(null, 10), '');
  });

  it('should format person name', () => {
    const { formatPersonName } = require('../src/util');

    assert.equal(formatPersonName('  john doe  '), 'John Doe');
    assert.equal(formatPersonName('MARIA-ANA'), 'Maria-Ana');
    assert.equal(formatPersonName(''), '');
  });
});
