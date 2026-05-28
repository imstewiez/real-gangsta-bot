'use strict';

// BOT_INTERNAL_NAME — nome técnico (logs, metrics, health, version).
// BOT_DISPLAY_NAME  — assinatura in-character em embeds e user-facing.
module.exports = {
  BOT_INTERNAL_NAME: process.env.BOT_INTERNAL_NAME || 'Bot di Zona',
  BOT_DISPLAY_NAME: process.env.BOT_DISPLAY_NAME || 'Ballas Gang',
  BOT_LOGO_URL: process.env.BOT_LOGO_URL || '',
  BOT_COLOR: parseInt(process.env.BOT_COLOR || 'E74C3C', 16),
};
