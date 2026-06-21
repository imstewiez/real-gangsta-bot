'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readEnvExampleValue(contents, key) {
  const line = contents.split(/\r?\n/).find(entry => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : '';
}

test('guild defaults keep resident channel category aligned with env example', () => {
  const defaults = require('../config/guild-defaults.json');
  const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');

  const memberCategoryId = readEnvExampleValue(envExample, 'MEMBER_CHANNELS_CATEGORY_ID');
  const legacyCategoryId = readEnvExampleValue(envExample, 'BAIRRISTA_TOPICOS_CATEGORY_ID');

  assert.equal(defaults.categories.BAIRRISTA_TOPICOS_CATEGORY_ID, memberCategoryId);
  assert.equal(legacyCategoryId, memberCategoryId);
});
