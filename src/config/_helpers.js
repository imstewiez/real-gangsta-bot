'use strict';
const path = require('path');

const envPath = process.env.ENV_FILE
  ? path.resolve(process.cwd(), process.env.ENV_FILE)
  : path.resolve(process.cwd(), '.env');
require('dotenv').config({ path: envPath });

let _guildDefaults = { roles: {}, categories: {}, channels: {} };
try {
  _guildDefaults = require('../../config/guild-defaults.json');
} catch {
  /* ficheiro opcional — sem ele, tudo vem do env */
}

function guildId(name, section = 'roles') {
  return process.env[name] || (_guildDefaults[section] && _guildDefaults[section][name]) || '';
}

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[CONFIG] Variável obrigatória em falta: ${name}`);
  return v;
}

function optId(name, fallback = '') {
  return process.env[name] || fallback;
}

function optBool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v.toLowerCase() === 'true';
}

function optNum(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function optList(name, fallback = '') {
  return (process.env[name] || fallback)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

module.exports = { guildId, req, optId, optBool, optNum, optList };
