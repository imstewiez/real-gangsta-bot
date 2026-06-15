'use strict';
/**
 * Config — composition root minimalista.
 *
 * A shape flat é mantida para compatibilidade, mas o runtime do bot deixou de
 * carregar domínios antigos como stock, materiais, saídas, rádio e Sheets.
 */

const discord = require('./discord');
const roles = require('./roles');
const channels = require('./channels');
const promotion = require('./promotion');
const behaviour = require('./behaviour');
const jobs = require('./jobs');
const panels = require('./panels');
const branding = require('./branding');
const logging = require('./logging');

const CONFIG = {
  ...discord,
  ...roles,
  ...channels,
  ...promotion,
  ...behaviour,
  ...jobs,
  ...panels,
  ...branding,
  ...logging,

  // Compatibilidade: features antigas ficam desligadas no bot Discord.
  GOOGLE_SERVICE_ACCOUNT_JSON: '',
  SPREADSHEET_ID: '',
  SHEETS_SYNC_INTERVAL_MIN: 0,
  isSheetsEnabled: () => false,
};

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
  MANAGEMENT_ROLE_IDS: {
    enumerable: true,
    get() {
      return [...this.COMMAND_ROLE_IDS, ...this.SUPERVISOR_ROLE_IDS, this.PATRAO_DI_ZONA_ROLE_ID].filter(Boolean);
    },
  },
  CHEFIA_ROLE_IDS: {
    enumerable: true,
    get() {
      return this.COMMAND_ROLE_IDS;
    },
  },
  OFICIAL_ROLE_IDS: {
    enumerable: true,
    get() {
      return [...this.COMMAND_ROLE_IDS, ...this.SUPERVISOR_ROLE_IDS];
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
  MEMBER_TIER_ROLE_IDS: {
    enumerable: true,
    get() {
      return this.BAIRRISTA_TIER_ROLE_IDS;
    },
  },
});

module.exports = CONFIG;
