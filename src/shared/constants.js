'use strict';
/**
 * Constants globais do projeto — tempos, limites, thresholds.
 *
 * Evita magic numbers espalhados pelo código.
 */

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;

// Timeouts e TTLs
const INTERACTION_TTL_MS = 15 * MS_PER_MINUTE; // Discord interaction token lifetime
const SESSION_TTL_MS = 15 * MS_PER_MINUTE; // Bairrista cart / item search
const UNDO_WINDOW_MS = 5 * MS_PER_MINUTE; // Desfazer entrega/venda
const RATE_LIMIT_WINDOW_MS = 10 * MS_PER_SECOND;

// Limites
const RATE_LIMIT_DEFAULT = 10;
const RATE_LIMIT_ADMIN = 30;
const MAX_CART_LINES = 25; // Discord select menu limit
const MAX_MODAL_FIELDS = 5; // Discord modal limit
const MAX_EMBED_FIELDS = 25;
const MAX_EMBED_DESCRIPTION = 4096;

// Sanidade
const SANITY_MAX_QTY = 10000; // Aviso se qty > isto
const SANITY_MAX_PRICE = 1_000_000; // Máximo preço custom em vendas

// Stock thresholds
const STOCK_CRITICAL_THRESHOLD = 4;
const STOCK_LOW_THRESHOLD = 10;
const STOCK_HIGH_THRESHOLD = 50;

module.exports = {
  MS_PER_SECOND,
  MS_PER_MINUTE,
  MS_PER_HOUR,
  MS_PER_DAY,
  MS_PER_WEEK,
  INTERACTION_TTL_MS,
  SESSION_TTL_MS,
  UNDO_WINDOW_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_DEFAULT,
  RATE_LIMIT_ADMIN,
  MAX_CART_LINES,
  MAX_MODAL_FIELDS,
  MAX_EMBED_FIELDS,
  MAX_EMBED_DESCRIPTION,
  SANITY_MAX_QTY,
  SANITY_MAX_PRICE,
  STOCK_CRITICAL_THRESHOLD,
  STOCK_LOW_THRESHOLD,
  STOCK_HIGH_THRESHOLD,
};
