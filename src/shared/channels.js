'use strict';
/**
 * Channel registry — resolve canais por família de notificação.
 *
 * As famílias consolidadas:
 *   ORG_LIFECYCLE    → entradas, saídas, promoções, tier changes
 *   INVENTORY_EVENTS → movimentos de stock + encomendas
 *   SAIDAS_EVENTS    → ciclo de vida de saídas (opened/closed/etc)
 *   CEMETERY         → kills
 *   RANKINGS         → tops semanais
 *
 * A resolução é robusta: primeiro tenta o ID no .env, depois fallback por
 * nome (spots/slug normalizados), e por último pelas heurísticas antigas
 * para compatibilidade.
 */

const CONFIG = require('../config');
const { warn } = require('../logger');
const { DISCOVERED } = require('../discord/structureTemplate');
const { TtlCache } = require('./ttlCache');

// Mapeamento família → variável ENV preferida → defaultId (pin direto)
// → slugs candidatos. Resolução: env → fallbackEnvs → defaultId → slug match.
const FAMILY_CONFIG = {
  ORG_LIFECYCLE: {
    envId: 'ORG_LIFECYCLE_CHANNEL_ID',
    fallbackEnvs: ['AUDIT_LOG_CHANNEL_ID'],
    defaultId: DISCOVERED.CH_LOGS_BOT,
    slugs: ['logs-bot', 'logs', 'audit-log', 'auditoria'],
  },
  INVENTORY_EVENTS: {
    envId: 'INVENTORY_EVENTS_CHANNEL_ID',
    fallbackEnvs: [],
    defaultId: DISCOVERED.CH_MATERIAL_ENTREG,
    slugs: ['material-entregue', 'stock-log', 'log-stock', 'inventario-log'],
  },
  SAIDAS_EVENTS: {
    envId: 'SAIDAS_EVENTS_CHANNEL_ID',
    fallbackEnvs: ['SAIDA_RESULTS_CHANNEL_ID'],
    defaultId: DISCOVERED.CH_SAIDAS_LOG,
    slugs: ['saidas-log', 'saida-log', 'resultados', 'op-log'],
  },
  CEMETERY: {
    envId: 'CEMETERY_CHANNEL_ID',
    fallbackEnvs: [],
    defaultId: DISCOVERED.CH_CEMITERIO,
    slugs: ['cemiterio', 'cemitério'],
  },
  RANKINGS: {
    envId: 'WEEKLY_TOP_CHANNEL_ID',
    fallbackEnvs: [],
    defaultId: DISCOVERED.CH_TOP_SEMANAL,
    slugs: ['top-semanal', 'tops-semanais', 'tops', 'ranking'],
  },
  ORDERS: {
    envId: 'ORDERS_CHANNEL_ID',
    fallbackEnvs: [],
    defaultId: DISCOVERED.CH_REG_ENCOMENDAS,
    slugs: ['registo-encomendas', 'encomendas', 'pedidos'],
  },
};

// Normaliza nome de canal para comparação: remove emojis, sub-bold unicode
// para ASCII, lowercase, underscore/hyphen intercambiáveis.
function _normalizeSlug(name) {
  if (!name) return '';
  const noBold = require('../discord/structureTemplate').unbold(name);
  return noBold
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function _resolveFromEnv(envKey) {
  const id = CONFIG[envKey] || process.env[envKey];
  return id && typeof id === 'string' ? id : null;
}

function _resolveFromGuild(client, slugs) {
  const guild = client?.guilds?.cache?.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) return null;
  const bySlug = new Map();
  for (const ch of guild.channels.cache.values()) {
    if (!ch.isTextBased?.()) continue;
    const slug = _normalizeSlug(ch.name);
    if (slug) bySlug.set(slug, ch);
  }
  for (const want of slugs) {
    const hit = bySlug.get(want);
    if (hit) return hit.id;
  }
  return null;
}

const _cache = new TtlCache();
const CACHE_TTL_MS = 5 * 60 * 1000;

function resolveChannelId(client, family) {
  const cfg = FAMILY_CONFIG[family];
  if (!cfg) {
    warn(`[CHANNELS] Família desconhecida: ${family}`);
    return null;
  }

  if (_cache.has(family)) return _cache.get(family);

  const envIds = [cfg.envId, ...(cfg.fallbackEnvs || [])];
  for (const key of envIds) {
    const id = _resolveFromEnv(key);
    if (id) {
      _cache.set(family, id, CACHE_TTL_MS);
      return id;
    }
  }

  if (cfg.defaultId) {
    _cache.set(family, cfg.defaultId, CACHE_TTL_MS);
    return cfg.defaultId;
  }

  const id = _resolveFromGuild(client, cfg.slugs || []);
  if (id) {
    _cache.set(family, id, CACHE_TTL_MS);
    return id;
  }

  return null;
}

async function resolveChannel(client, family) {
  const id = resolveChannelId(client, family);
  if (!id) return null;
  try {
    const ch = await client.channels.fetch(id).catch(() => null);
    if (!ch?.isTextBased?.()) return null;
    return ch;
  } catch (e) {
    warn(`[CHANNELS] ${family}: ${e.message}`);
    return null;
  }
}

function invalidateCache(family) {
  if (family) _cache.delete(family);
  else _cache.clear();
}

module.exports = {
  FAMILY_CONFIG,
  resolveChannelId,
  resolveChannel,
  invalidateCache,
};
