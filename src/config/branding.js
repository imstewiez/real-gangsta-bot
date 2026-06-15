'use strict';

function normalizeName(value, fallback) {
  const clean = String(value || '').trim();
  if (!clean) return fallback;
  const normalized = clean.toLowerCase().replace(/\s+/g, '');
  if (normalized.includes('botdizona')) return fallback;
  if (normalized.includes(['red', 'wood'].join(''))) return fallback;
  if (normalized.includes('firma')) return fallback;
  return clean;
}

function normalizeLogoUrl(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  const lower = clean.toLowerCase();
  if (lower.includes(['red', 'wood'].join(''))) return '';
  if (lower.includes('botdizona')) return '';
  return clean;
}

const explicitLogoUrl = normalizeLogoUrl(process.env.BALLAS_GANG_LOGO_URL);

module.exports = {
  BOT_INTERNAL_NAME: normalizeName(process.env.BOT_INTERNAL_NAME, 'Ballas Gang'),
  BOT_DISPLAY_NAME: normalizeName(process.env.BOT_DISPLAY_NAME, 'Ballas Gang • Gestão'),
  BALLAS_GANG_LOGO_URL: explicitLogoUrl,
  BOT_LOGO_URL: explicitLogoUrl,
  WEB_APP_URL: process.env.WEB_APP_URL || 'https://www.ballasgang.eu',
  BOT_COLOR: parseInt(process.env.BOT_COLOR || '7B2CBF', 16),
};
