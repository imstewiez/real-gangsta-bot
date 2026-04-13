'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { truncate, formatPersonName, weekBounds, chunkStringByLimit, unique } = require('../src/util');

describe('util — truncate', () => {
  it('returns input when shorter than max', () => {
    assert.equal(truncate('hello', 10), 'hello');
  });
  it('truncates and ellipsises when exceeds max', () => {
    assert.equal(truncate('a very long string here', 10), 'a very...');
  });
  it('handles empty strings', () => {
    assert.equal(truncate('', 10), '');
    assert.equal(truncate(null, 10), '');
    assert.equal(truncate(undefined, 10), '');
  });
});

describe('util — formatPersonName', () => {
  it('trims and titlecases', () => {
    assert.equal(formatPersonName('  john doe  '), 'John Doe');
  });
  it('handles hyphens', () => {
    assert.equal(formatPersonName('MARIA-ANA'), 'Maria-Ana');
  });
  it('handles empty', () => {
    assert.equal(formatPersonName(''), '');
    assert.equal(formatPersonName(null), '');
  });
});

describe('util — weekBounds', () => {
  it('starts on Monday and ends on Sunday', () => {
    const { start, end } = weekBounds(new Date('2026-04-15')); // Wed
    assert.equal(start.getDay(), 1);
    assert.equal(end.getDay(), 0);
    assert.ok(start < end);
  });
  it('handles Sunday correctly', () => {
    const { start, end } = weekBounds(new Date('2026-04-19'));
    assert.equal(start.getDay(), 1);
    assert.ok(start <= new Date('2026-04-19T23:59:59'));
    assert.ok(end >= new Date('2026-04-19'));
  });
});

describe('util — unique / chunkStringByLimit', () => {
  it('unique strips falsy and duplicates', () => {
    assert.deepEqual(unique(['a', 'b', 'a', '', null, 'c']), ['a', 'b', 'c']);
  });
  it('chunkStringByLimit splits by total length', () => {
    const items = ['aaa', 'bbb', 'ccc', 'ddd'];
    const out = chunkStringByLimit(items, 7);
    // 'aaa\nbbb' = 7 ok, next 'ccc\nddd' = 7 ok
    assert.deepEqual(out, ['aaa\nbbb', 'ccc\nddd']);
  });
  it('chunkStringByLimit returns em-dash on empty', () => {
    assert.deepEqual(chunkStringByLimit([], 10), ['—']);
  });
});
