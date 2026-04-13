'use strict';
const path = require('path');
const fs = require('fs');

const envPath = process.env.ENV_FILE
  ? path.resolve(process.cwd(), process.env.ENV_FILE)
  : path.resolve(process.cwd(), '.env');
require('dotenv').config({ path: envPath });

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

const CONFIG = {
  // ── Discord ───────────────────────────────────────────────────────────────
  DISCORD_BOT_TOKEN: req('DISCORD_BOT_TOKEN'),
  DISCORD_GUILD_ID: req('DISCORD_GUILD_ID'),

  // ── Database ──────────────────────────────────────────────────────────────
  DATABASE_URL: req('DATABASE_URL'),

  // ── Role IDs ──────────────────────────────────────────────────────────────
  CHEFIA_ROLE_ID: optId('CHEFIA_ROLE_ID'),
  CHEFE_MORADORES_ROLE_ID: optId('CHEFE_MORADORES_ROLE_ID'),
  OFICIAL_ROLE_ID: optId('OFICIAL_ROLE_ID'),
  MORADOR_ROLE_ID: optId('MORADOR_ROLE_ID'),

  // ── Category IDs ──────────────────────────────────────────────────────────
  MORADOR_TOPICOS_CATEGORY_ID: optId('MORADOR_TOPICOS_CATEGORY_ID'),
  MORADOR_ARQUIVO_CATEGORY_ID: optId('MORADOR_ARQUIVO_CATEGORY_ID'),

  // ── Channel IDs ───────────────────────────────────────────────────────────
  AUDIT_LOG_CHANNEL_ID: optId('AUDIT_LOG_CHANNEL_ID'),
  WEEKLY_TOP_CHANNEL_ID: optId('WEEKLY_TOP_CHANNEL_ID'),
  DAILY_SUMMARY_CHANNEL_ID: optId('DAILY_SUMMARY_CHANNEL_ID'),
  PANEL_MORADORES_CHANNEL_ID: optId('PANEL_MORADORES_CHANNEL_ID'),
  PANEL_OFICIAIS_CHANNEL_ID: optId('PANEL_OFICIAIS_CHANNEL_ID'),
  PANEL_CHEFIA_CHANNEL_ID: optId('PANEL_CHEFIA_CHANNEL_ID'),
  PANEL_CHEFE_MORADORES_CHANNEL_ID: optId('PANEL_CHEFE_MORADORES_CHANNEL_ID'),

  // ── Comportamento ─────────────────────────────────────────────────────────
  ARCHIVE_ON_PROMOTION: optBool('ARCHIVE_ON_PROMOTION', true),
  DELETE_ON_PROMOTION: optBool('DELETE_ON_PROMOTION', false),
  ENABLE_BACKGROUND_JOBS: optBool('ENABLE_BACKGROUND_JOBS', false),
  PANEL_BOOTSTRAP_ON_READY: optBool('PANEL_BOOTSTRAP_ON_READY', true),

  // ── Branding ──────────────────────────────────────────────────────────────
  BOT_DISPLAY_NAME: process.env.BOT_DISPLAY_NAME || 'Real Gangsta',
  BOT_LOGO_URL: process.env.BOT_LOGO_URL || '',
  BOT_COLOR: parseInt(process.env.BOT_COLOR || 'E74C3C', 16),

  // ── Logging ───────────────────────────────────────────────────────────────
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  DEBUG_LOG_DIR: process.env.DEBUG_LOG_DIR || './logs',
  DEBUG_LOG_FILE: process.env.DEBUG_LOG_FILE || 'realgangsta-debug.log',

  // ── Paths ─────────────────────────────────────────────────────────────────
  STATE_FILE: process.env.STATE_FILE || './state.json',
};

// Resolve paths
CONFIG.DEBUG_LOG_DIR = path.resolve(process.cwd(), CONFIG.DEBUG_LOG_DIR);

module.exports = CONFIG;
