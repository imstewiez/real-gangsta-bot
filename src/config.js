'use strict';
const path = require('path');

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
  // Comando Total
  MANDA_CHUVA_ROLE_ID: optId('MANDA_CHUVA_ROLE_ID', '1490397675525242930'),
  KINGPIN_ROLE_ID: optId('KINGPIN_ROLE_ID', '1490397676204855308'),
  // Supervisão (oficiais seniores)
  OG_ROLE_ID: optId('OG_ROLE_ID', '1490397683070930945'),
  REAL_GANGSTER_ROLE_ID: optId('REAL_GANGSTER_ROLE_ID', '1491223266487173311'),
  // Chefe do Guetto
  PATRAO_DI_ZONA_ROLE_ID: optId('PATRAO_DI_ZONA_ROLE_ID', '1490397679753101312'),
  // Moradores — tier ordering: young_blood=1 → o_gunao=2 → gangster_fodido=3
  YOUNG_BLOOD_ROLE_ID: optId('YOUNG_BLOOD_ROLE_ID', '1491213753235275806'),
  O_GUNAO_ROLE_ID: optId('O_GUNAO_ROLE_ID', '1491213423613317220'),
  GANGSTER_FODIDO_ROLE_ID: optId('GANGSTER_FODIDO_ROLE_ID', '1491213170961022997'),
  // Role base obrigatória para qualquer morador (invariante)
  MORADORES_BASE_ROLE_ID: optId('MORADORES_BASE_ROLE_ID', '1490397684597653634'),
  // Roles flavor (não-core)
  TROPINHAS_DO_GUETTO_ROLE_ID: optId('TROPINHAS_DO_GUETTO_ROLE_ID', '1490397688800477215'),
  PATRULHA_PATA_ROLE_ID: optId('PATRULHA_PATA_ROLE_ID', '1490795383448928276'),
  // Bot / configurador
  BOT_ROLE_ID: optId('BOT_ROLE_ID', '1493165105242832919'),
  CONFIGURADOR_ROLE_ID: optId('CONFIGURADOR_ROLE_ID', '1490397674543906938'),

  // ── Aliases semânticos ────────────────────────────────────────────────────
  get COMMAND_ROLE_IDS() {
    return [this.MANDA_CHUVA_ROLE_ID, this.KINGPIN_ROLE_ID].filter(Boolean);
  },
  get SUPERVISOR_ROLE_IDS() {
    return [this.OG_ROLE_ID, this.REAL_GANGSTER_ROLE_ID].filter(Boolean);
  },
  get CHEFIA_ROLE_IDS() {
    // "Chefia" = Comando total apenas (Manda-Chuva, Kingpin)
    return this.COMMAND_ROLE_IDS;
  },
  get OFICIAL_ROLE_IDS() {
    // Oficiais = Supervisão (OG, Real Gangster)
    return this.SUPERVISOR_ROLE_IDS;
  },
  get CHEFE_MORADORES_ROLE_IDS() {
    return [this.PATRAO_DI_ZONA_ROLE_ID].filter(Boolean);
  },
  /** Tiers de morador (ordem: 1 → 3) */
  get MORADOR_TIER_ROLE_IDS() {
    return [this.YOUNG_BLOOD_ROLE_ID, this.O_GUNAO_ROLE_ID, this.GANGSTER_FODIDO_ROLE_ID].filter(Boolean);
  },
  /** Legado — alguns módulos ainda usam este nome */
  get MORADOR_ROLE_IDS() { return this.MORADOR_TIER_ROLE_IDS; },
  get ALL_MORADOR_TIER_IDS() { return this.MORADOR_TIER_ROLE_IDS; },

  // ── Promoção automática por material (valor em €) ─────────────────────────
  PROMO_YOUNG_BLOOD_TO_GUNAO: Number(process.env.PROMO_YOUNG_BLOOD_TO_GUNAO || 25000),
  PROMO_GUNAO_TO_GANGSTER_FODIDO: Number(process.env.PROMO_GUNAO_TO_GANGSTER_FODIDO || 50000),

  // ── Category IDs ──────────────────────────────────────────────────────────
  MORADOR_TOPICOS_CATEGORY_ID: optId('MORADOR_TOPICOS_CATEGORY_ID', '1491543491233448006'),
  MORADOR_ARQUIVO_CATEGORY_ID: optId('MORADOR_ARQUIVO_CATEGORY_ID'),

  // ── Channel IDs ───────────────────────────────────────────────────────────
  TAG_REQUEST_CHANNEL_ID: optId('TAG_REQUEST_CHANNEL_ID', '1490397785948688529'),
  AUDIT_LOG_CHANNEL_ID: optId('AUDIT_LOG_CHANNEL_ID'),
  PANEL_ENTRADA_CHANNEL_ID: optId('PANEL_ENTRADA_CHANNEL_ID'),
  WEEKLY_TOP_CHANNEL_ID: optId('WEEKLY_TOP_CHANNEL_ID'),
  DAILY_SUMMARY_CHANNEL_ID: optId('DAILY_SUMMARY_CHANNEL_ID'),
  CEMETERY_CHANNEL_ID: optId('CEMETERY_CHANNEL_ID'),
  STRUCTURE_SYNC_LOG_CHANNEL_ID: optId('STRUCTURE_SYNC_LOG_CHANNEL_ID'),
  PANEL_MORADORES_CHANNEL_ID: optId('PANEL_MORADORES_CHANNEL_ID'),
  PANEL_OFICIAIS_CHANNEL_ID: optId('PANEL_OFICIAIS_CHANNEL_ID'),
  PANEL_CHEFIA_CHANNEL_ID: optId('PANEL_CHEFIA_CHANNEL_ID'),
  PANEL_CHEFE_MORADORES_CHANNEL_ID: optId('PANEL_CHEFE_MORADORES_CHANNEL_ID'),

  // ── Comportamento ─────────────────────────────────────────────────────────
  ARCHIVE_ON_PROMOTION: optBool('ARCHIVE_ON_PROMOTION', true),
  DELETE_ON_PROMOTION: optBool('DELETE_ON_PROMOTION', false),
  ENABLE_BACKGROUND_JOBS: optBool('ENABLE_BACKGROUND_JOBS', false),
  ENFORCE_ROLE_INVARIANTS: optBool('ENFORCE_ROLE_INVARIANTS', true),
  PANEL_BOOTSTRAP_ON_READY: optBool('PANEL_BOOTSTRAP_ON_READY', true),
  AUTO_PUBLISH_WEEKLY_TOP: optBool('AUTO_PUBLISH_WEEKLY_TOP', true),

  // ── Branding ──────────────────────────────────────────────────────────────
  BOT_DISPLAY_NAME: process.env.BOT_DISPLAY_NAME || 'Real Gangsta',
  BOT_LOGO_URL: process.env.BOT_LOGO_URL || '',
  BOT_COLOR: parseInt(process.env.BOT_COLOR || 'E74C3C', 16),

  // ── Logging ───────────────────────────────────────────────────────────────
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  DEBUG_LOG_DIR: process.env.DEBUG_LOG_DIR || './logs',
  DEBUG_LOG_FILE: process.env.DEBUG_LOG_FILE || 'realgangsta-debug.log',

  // ── Google Sheets (opcional) ──────────────────────────────────────────────
  GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || '',

  // ── Paths ─────────────────────────────────────────────────────────────────
  STATE_FILE: process.env.STATE_FILE || './state.json',
};

// Resolve paths
CONFIG.DEBUG_LOG_DIR = path.resolve(process.cwd(), CONFIG.DEBUG_LOG_DIR);

// Helper — Sheets está activo apenas se tudo está configurado
CONFIG.isSheetsEnabled = function () {
  return Boolean(this.GOOGLE_SERVICE_ACCOUNT_JSON && this.SPREADSHEET_ID);
};

module.exports = CONFIG;
