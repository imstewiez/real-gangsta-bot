'use strict';
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadMigrations } = require('../src/dbMigrate');

describe('migrations', () => {
  const migrations = loadMigrations();

  it('loads all migration files', () => {
    assert.ok(migrations.length >= 26, `Expected >=26 migrations, got ${migrations.length}`);
  });

  it('IDs are unique', () => {
    const ids = migrations.map(m => m.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, `Duplicate IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  });

  it('IDs are sequential (no gaps)', () => {
    const ids = migrations.map(m => m.id).sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i++) {
      assert.equal(ids[i], i + 1, `Expected ID ${i + 1}, got ${ids[i]} — gap or misnumber`);
    }
  });

  it('names are unique', () => {
    const names = migrations.map(m => m.name);
    const unique = new Set(names);
    assert.equal(names.length, unique.size, 'Duplicate migration names');
  });

  it('all files have valid SQL content', () => {
    for (const m of migrations) {
      assert.ok(m.sql.length > 10, `Migration ${m.id} (${m.name}) has no SQL content`);
      assert.ok(!m.sql.includes('undefined'), `Migration ${m.id} has 'undefined' in SQL`);
    }
  });

  it('files are sorted by ID prefix', () => {
    const files = migrations.map(m => m.file);
    const sorted = [...files].sort();
    assert.deepEqual(files, sorted, 'Migration files not sorted by prefix');
  });

  it('Docker image includes migrations directory', () => {
    const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /COPY\s+migrations\/\s+\.\/migrations\//);
  });
});
