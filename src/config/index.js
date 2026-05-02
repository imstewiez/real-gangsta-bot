'use strict';
/**
 * Config — composition root.
 *
 * API mantém a shape flat do CONFIG antigo para retro-compat com os 37
 * ficheiros que fazem `require('../config')`. Domínio-a-domínio está
 * repartido em ficheiros separados (roles.js, channels.js, etc.) para
 * reduzir complexidade e facilitar discovery.
 *
 * Validação exposta via `./validate`:
 *   const { validateConfig } = require('./config/validate');
 */

const discord = require('./discord');
const roles = require('./roles');
const channels = require('./channels');
const promotion = require('./promotion');
const behaviour = require('./behaviour');
const jobs = require('./jobs');
const panels = require('./panels');
const stock = require('./stock');
const radio = require('./radio');
const availability = require('./availability');
const branding = require('./branding');
const logging = require('./logging');
const sheets = require('./sheets');

const CONFIG = {
  ...discord,
  ...roles,
  ...channels,
  ...promotion,
  ...behaviour,
  ...jobs,
  ...panels,
  ...stock,
  ...radio,
  ...availability,
  ...branding,
  ...logging,
  GOOGLE_SERVICE_ACCOUNT_JSON: sheets.GOOGLE_SERVICE_ACCOUNT_JSON,
  SPREADSHEET_ID: sheets.SPREADSHEET_ID,
  SHEETS_SYNC_INTERVAL_MIN: sheets.SHEETS_SYNC_INTERVAL_MIN,
  isSheetsEnabled: sheets.isSheetsEnabled,
};

// ── Aliases semânticos (getters para avaliação lazy) ─────────────────────────
Object.defineProperties(CONFIG, {
  COMMAND_ROLE_IDS: {
    enumerable: true,
    get() {
      return [this.MANDA_CHUVA_ROLE_ID, this.KINGPIN_ROLE_ID].filter(Boolean);
    },
  },
  SUPERVISOR_ROLE_IDS: {
    enumerable: true,
    get() {
      return [this.OG_ROLE_ID, this.REAL_GANGSTER_ROLE_ID].filter(Boolean);
    },
  },
  CHEFIA_ROLE_IDS: {
    enumerable: true,
    get() {
      // "Chefia" = Comando total (Manda-Chuva, Kingpin)
      return this.COMMAND_ROLE_IDS;
    },
  },
  OFICIAL_ROLE_IDS: {
    enumerable: true,
    get() {
      // Oficiais = Supervisão (OG, Real Gangster)
      return this.SUPERVISOR_ROLE_IDS;
    },
  },
  PATRAO_DI_ZONA_ROLE_IDS: {
    enumerable: true,
    get() {
      return [this.PATRAO_DI_ZONA_ROLE_ID].filter(Boolean);
    },
  },
  BAIRRISTA_TIER_ROLE_IDS: {
    enumerable: true,
    get() {
      return [this.YOUNG_BLOOD_ROLE_ID, this.O_GUNAO_ROLE_ID, this.GANGSTER_FODIDO_ROLE_ID].filter(Boolean);
    },
  },
});

module.exports = CONFIG;
