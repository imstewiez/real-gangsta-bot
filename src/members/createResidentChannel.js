'use strict';
/**
 * Helper central para criar canal de bairrista com fallback + auto-create
 * de overflow category.
 *
 * Discord tem limite hard de 50 canais por categoria. Quando TODAS as
 * categorias conhecidas (primary + overflow-env + overflow-auto existentes
 * em DB) estão cheias, o bot cria automaticamente uma nova overflow category,
 * clona os permission overwrites da primary, persiste o ID em
 * managed_topic_categories, e retenta.
 *
 * Ordem de tentativa:
 *   1. BAIRRISTA_TOPICOS_CATEGORY_ID (primary do env)
 *   2. Cada ID em BAIRRISTA_TOPICOS_OVERFLOW_CATEGORY_IDS (env)
 *   3. Cada managed_topic_categories.role='overflow-auto' em DB
 *   4. Auto-create nova overflow, persiste, retenta
 *
 * Devolve: { channel, categoryId }.
 */

const { ChannelType } = require('discord.js');
const CONFIG = require('../config');
const { query } = require('../db');
const { queueChannelOp } = require('../discordQueue');
const { log, warn } = require('../logger');

const FULL_CATEGORY_MARKERS = ['CHANNEL_PARENT_MAX_CHANNELS', 'Maximum number of channels in category'];

function _isCategoryFull(err) {
  const msg = String(err?.message || '');
  return FULL_CATEGORY_MARKERS.some(m => msg.includes(m));
}

async function _allCandidateCategories() {
  const primary = CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID;
  const envOverflow = CONFIG.BAIRRISTA_TOPICOS_OVERFLOW_CATEGORY_IDS || [];
  let dbAuto = [];
  try {
    const r = await query(
      "SELECT category_id FROM managed_topic_categories WHERE role = 'overflow-auto' ORDER BY created_at ASC"
    );
    dbAuto = r.rows.map(row => row.category_id);
  } catch (e) {
    warn(`[RESIDENT-CHANNEL] Query managed_topic_categories falhou: ${e.message}`);
  }
  // Dedup preservando ordem.
  const seen = new Set();
  const list = [];
  for (const id of [primary, ...envOverflow, ...dbAuto]) {
    if (id && !seen.has(id)) {
      seen.add(id);
      list.push(id);
    }
  }
  return list;
}

async function _cloneOverwritesFromPrimary(guild) {
  const primary = CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID;
  if (!primary) return null;
  const cat = await guild.channels.fetch(primary).catch(() => null);
  if (!cat) return null;
  return cat.permissionOverwrites.cache.map(po => ({
    id: po.id,
    type: po.type, // 0=role, 1=member
    allow: po.allow.bitfield.toString(),
    deny: po.deny.bitfield.toString(),
  }));
}

async function _nextAutoOverflowName(guild) {
  // Usa o nome da primary como prefixo. Se primary é "Tópicos Bairristas",
  // nova overflow fica "Tópicos Bairristas #2" (e #3, #4 conforme).
  const primary = CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID;
  let baseName = 'Tópicos Bairristas';
  if (primary) {
    const cat = await guild.channels.fetch(primary).catch(() => null);
    if (cat?.name) baseName = cat.name.replace(/\s*#\d+$/, ''); // strip sufixo se já tiver
  }
  const r = await query("SELECT COUNT(*)::int AS n FROM managed_topic_categories WHERE role = 'overflow-auto'").catch(
    () => ({ rows: [{ n: 0 }] })
  );
  const nextIdx = (r.rows[0]?.n || 0) + 2; // #2 é o primeiro overflow (#1 é o primary)
  return `${baseName} #${nextIdx}`;
}

async function _autoCreateOverflowCategory(guild) {
  const name = await _nextAutoOverflowName(guild);
  const permissionOverwrites = (await _cloneOverwritesFromPrimary(guild)) || [];
  const cat = await queueChannelOp(() =>
    guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      permissionOverwrites,
      reason: 'Auto-created overflow — BAIRRISTA_TOPICOS primary cheia',
    })
  );
  await query(
    `INSERT INTO managed_topic_categories (category_id, role, notes)
     VALUES ($1, 'overflow-auto', $2)
     ON CONFLICT (category_id) DO NOTHING`,
    [cat.id, `Auto-created at ${new Date().toISOString()} — primary cheia`]
  );
  log(`[RESIDENT-CHANNEL] Auto-created overflow category '${name}' (${cat.id}).`);
  return cat.id;
}

/**
 * Cria canal de texto para um bairrista. Fallback entre categorias conhecidas;
 * auto-create de nova se todas cheias.
 *
 * @param {Guild} guild
 * @param {object} createOpts — opts para guild.channels.create, EXCEPTO `parent`.
 * @returns {Promise<{channel: TextChannel, categoryId: string}>}
 */
async function createResidentChannel(guild, createOpts) {
  const categories = await _allCandidateCategories();
  if (!categories.length) {
    throw new Error('Nenhuma categoria configurada (BAIRRISTA_TOPICOS_CATEGORY_ID ausente).');
  }

  // Tenta cada categoria conhecida.
  // let lastErr = null;
  for (const categoryId of categories) {
    try {
      const channel = await queueChannelOp(() => guild.channels.create({ ...createOpts, parent: categoryId }));
      return { channel, categoryId };
    } catch (e) {
      if (_isCategoryFull(e)) {
        // lastErr = e;
        continue;
      }
      throw e;
    }
  }

  // Todas cheias → auto-create nova e retenta.
  warn('[RESIDENT-CHANNEL] Todas as categorias conhecidas cheias — a auto-criar overflow.');
  const newCatId = await _autoCreateOverflowCategory(guild);
  const channel = await queueChannelOp(() => guild.channels.create({ ...createOpts, parent: newCatId }));
  return { channel, categoryId: newCatId };
}

/**
 * Exposto para /organize-topicos e cleanup lógica que precisa de mover canais
 * existentes (setParent) com o mesmo fallback + auto-create semantics.
 *
 * Tenta setParent em cada categoria conhecida; se todas cheias, auto-cria
 * overflow e move para lá.
 */
async function moveChannelToManagedCategory(guild, channel) {
  const categories = await _allCandidateCategories();
  // let lastErr = null;
  for (const categoryId of categories) {
    try {
      await queueChannelOp(() => channel.setParent(categoryId, { lockPermissions: false }));
      return { categoryId };
    } catch (e) {
      if (_isCategoryFull(e)) {
        // lastErr = e;
        continue;
      }
      throw e;
    }
  }
  const newCatId = await _autoCreateOverflowCategory(guild);
  await queueChannelOp(() => channel.setParent(newCatId, { lockPermissions: false }));
  return { categoryId: newCatId };
}

/**
 * Devolve todas as categorias sob gestão (para scans/organize):
 * primary + env-overflow + db-auto-overflow. Dedupadas e por ordem.
 */
async function getManagedCategoryIds() {
  return _allCandidateCategories();
}

module.exports = { createResidentChannel, moveChannelToManagedCategory, getManagedCategoryIds };
