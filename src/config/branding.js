'use strict';

const DEFAULT_LOGO_URL = 'https://www.ballasgang.eu/assets/ballas-logo.png';
const logoUrl = process.env.BALLAS_GANG_LOGO_URL || process.env.BOT_LOGO_URL || DEFAULT_LOGO_URL;

function normalizeName(value, fallback) {
  const clean = String(value || '').trim();
  if (!clean) return fallback;
  const normalized = clean.toLowerCase().replace(/\s+/g, '');
  if (normalized.includes('botdizona')) return fallback;
  if (normalized.includes(['red', 'wood'].join(''))) return fallback;
  if (normalized.includes('firma')) return fallback;
  return clean;
}

module.exports = {
  BOT_INTERNAL_NAME: normalizeName(process.env.BOT_INTERNAL_NAME, 'Ballas Gang'),
  BOT_DISPLAY_NAME: normalizeName(process.env.BOT_DISPLAY_NAME, 'Ballas Gang • Gestão'),
  BALLAS_GANG_LOGO_URL: logoUrl,
  BOT_LOGO_URL: logoUrl,
  WEB_APP_URL: process.env.WEB_APP_URL || 'https://ballasgang.eu',
  BOT_COLOR: parseInt(process.env.BOT_COLOR || '7B2CBF', 16),
};
