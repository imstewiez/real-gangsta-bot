'use strict';
const { optBool, optNum } = require('./_helpers');

// Stock notifier — publica embeds dos movimentos de inventário em canais
// dedicados da categoria indicada por STOCK_CHANNELS_CATEGORY_KEY (default:
// COMANDO — staff only, mantém OPERAÇÕES limpo para chefia).
// Chaves válidas: qualquer key de structureTemplate.CATEGORIES.
module.exports = {
  STOCK_NOTIFY_ENABLED: optBool('STOCK_NOTIFY_ENABLED', true),
  STOCK_AUTOCREATE: optBool('STOCK_AUTOCREATE', true),
  STOCK_CHANNELS_CATEGORY_KEY: process.env.STOCK_CHANNELS_CATEGORY_KEY || 'COMANDO',
  STOCK_SUMMARY_INTERVAL_HOURS: optNum('STOCK_SUMMARY_INTERVAL_HOURS', 4),
};
