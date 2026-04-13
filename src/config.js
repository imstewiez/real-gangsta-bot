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
  DATABASE_URL: process.env.DATABASE_URL || '',

  // ── Role IDs — Hierarquia completa ────────────────────────────────────────
  // Chefia
  MANDA_CHUVA_ROLE_ID: optId('MANDA_CHUVA_ROLE_ID'),
  KINGPIN_ROLE_ID: optId('KINGPIN_ROLE_ID'),
  // Oficiais
  OG_ROLE_ID: optId('OG_ROLE_ID'),
  REAL_GANGSTER_ROLE_ID: optId('REAL_GANGSTER_ROLE_ID'),
  // Chefe de Moradores
  PATRAO_DI_ZONA_ROLE_ID: optId('PATRAO_DI_ZONA_ROLE_ID'),
  // Moradores (3 níveis)
  GANGSTER_FODIDO_ROLE_ID: optId('GANGSTER_FODIDO_ROLE_ID'),
  O_GUNAO_ROLE_ID: optId('O_GUNAO_ROLE_ID'),
  YOUNG_BLOOD_ROLE_ID: optId('YOUNG_BLOOD_ROLE_ID'),

  // ── Aliases para o permission engine (agrupados) ──────────────────────────
  get CHEFIA_ROLE_IDS() {
    return [this.MANDA_CHUVA_ROLE_ID, this.KINGPIN_ROLE_ID].filter(Boolean);
  },
  get OFICIAL_ROLE_IDS() {
    return [this.OG_ROLE_ID, this.REAL_GANGSTER_ROLE_ID].filter(Boolean);
  },
  get CHEFE_MORADORES_ROLE_IDS() {
    return [this.PATRAO_DI_ZONA_ROLE_ID].filter(Boolean);
  },
  get MORADOR_ROLE_IDS() {
    return [this.GANGSTER_FODIDO_ROLE_ID, this.O_GUNAO_ROLE_ID, this.YOUNG_BLOOD_ROLE_ID].filter(Boolean);
  },
  get ALL_MORADOR_TIER_IDS() {
    return [this.YOUNG_BLOOD_ROLE_ID, this.O_GUNAO_ROLE_ID, this.GANGSTER_FODIDO_ROLE_ID].filter(Boolean);
  },

  // ── Promoção automática por material (valor em €) ─────────────────────────
  PROMO_YOUNG_BLOOD_TO_GUNAO: Number(process.env.PROMO_YOUNG_BLOOD_TO_GUNAO || 25000),
  PROMO_GUNAO_TO_GANGSTER_FODIDO: Number(process.env.PROMO_GUNAO_TO_GANGSTER_FODIDO || 50000),

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

  // ── Google Sheets ──────────────────────────────────────────────────────────
  GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || '',

  // ── Paths ─────────────────────────────────────────────────────────────────
  STATE_FILE: process.env.STATE_FILE || './state.json',
};

// Resolve paths
CONFIG.DEBUG_LOG_DIR = path.resolve(process.cwd(), CONFIG.DEBUG_LOG_DIR);

module.exports = CONFIG;
