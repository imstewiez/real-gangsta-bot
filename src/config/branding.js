'use strict';

// Branding central da Ballas Gang.
// BALLAS_GANG_LOGO_URL tem prioridade; BOT_LOGO_URL fica como alias compatível.
const logoUrl = process.env.BALLAS_GANG_LOGO_URL || process.env.BOT_LOGO_URL || '';

module.exports = {
  BOT_INTERNAL_NAME: process.env.BOT_INTERNAL_NAME || 'Ballas Gang',
  BOT_DISPLAY_NAME: process.env.BOT_DISPLAY_NAME || 'Ballas Gang • Gestão',
  BALLAS_GANG_LOGO_URL: logoUrl,
  BOT_LOGO_URL: logoUrl,
  WEB_APP_URL: process.env.WEB_APP_URL || 'https://ballasgang.eu',
  BOT_COLOR: parseInt(process.env.BOT_COLOR || '7B2CBF', 16),
};
