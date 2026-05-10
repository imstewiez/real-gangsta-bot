'use strict';
function assertJsonSchema(label, value, schema) {
  if (value === null || value === undefined) return;
  if (typeof value !== 'object') throw new Error(`${label}: esperava objeto, recebeu ${typeof value}`);
  for (const [k, type] of Object.entries(schema)) {
    if (!(k in value)) continue;
    const actual = Array.isArray(value[k]) ? 'array' : typeof value[k];
    if (actual !== type) throw new Error(`${label}.${k}: esperava ${type}, recebeu ${actual}`);
  }
}
function assertArray(label, value) {
  if (!Array.isArray(value)) throw new Error(`${label}: esperava array, recebeu ${typeof value}`);
}
module.exports = { assertJsonSchema, assertArray };
