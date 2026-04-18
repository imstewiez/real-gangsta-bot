'use strict';
/**
 * Helper central para criar canal de bairrista com fallback entre categorias.
 *
 * Discord tem limite hard de 50 canais por categoria. Quando
 * BAIRRISTA_TOPICOS_CATEGORY_ID atinge esse limite, novas criações falham
 * com CHANNEL_PARENT_MAX_CHANNELS. Este helper tenta:
 *
 *   1. BAIRRISTA_TOPICOS_CATEGORY_ID (principal)
 *   2. Cada ID em BAIRRISTA_TOPICOS_OVERFLOW_CATEGORY_IDS (em ordem)
 *
 * Se a primária falha com "category full", tenta a próxima. Se TODAS falham
 * com "category full", throws um erro claro para o operador criar mais uma
 * overflow category no Discord + adicionar ao env var.
 *
 * Outros erros (permissions, rate limit, etc.) não disparam fallback —
 * propagam imediatamente.
 *
 * Devolve: { channel, categoryId } — o canal criado + em que categoria acabou.
 */

const CONFIG = require('../config');
const { queueChannelOp } = require('../discordQueue');
const { log, warn } = require('../logger');

const FULL_CATEGORY_MARKERS = ['CHANNEL_PARENT_MAX_CHANNELS', 'Maximum number of channels in category'];

function _isCategoryFull(err) {
  const msg = String(err?.message || '');
  return FULL_CATEGORY_MARKERS.some(m => msg.includes(m));
}

function _candidateCategories() {
  const primary = CONFIG.BAIRRISTA_TOPICOS_CATEGORY_ID;
  const overflow = CONFIG.BAIRRISTA_TOPICOS_OVERFLOW_CATEGORY_IDS || [];
  return [primary, ...overflow].filter(Boolean);
}

/**
 * Cria canal de texto para um bairrista. Fallback automático entre categorias
 * primária + overflow se a primária estiver cheia.
 *
 * @param {Guild} guild
 * @param {object} createOpts — passa-se directo a guild.channels.create, EXCEPTO `parent`.
 * @returns {Promise<{channel: TextChannel, categoryId: string}>}
 */
async function createResidentChannel(guild, createOpts) {
  const categories = _candidateCategories();
  if (!categories.length) {
    throw new Error('Nenhuma categoria de tópicos configurada (BAIRRISTA_TOPICOS_CATEGORY_ID ausente).');
  }

  let lastErr = null;
  for (const categoryId of categories) {
    try {
      const channel = await queueChannelOp(() => guild.channels.create({ ...createOpts, parent: categoryId }));
      log(`[RESIDENT-CHANNEL] Canal '${channel.name}' criado em categoria ${categoryId}.`);
      return { channel, categoryId };
    } catch (e) {
      if (_isCategoryFull(e)) {
        warn(`[RESIDENT-CHANNEL] Categoria ${categoryId} cheia — a tentar próxima.`);
        lastErr = e;
        continue;
      }
      throw e; // erro não-capacity, propaga
    }
  }

  const overflowCount = (CONFIG.BAIRRISTA_TOPICOS_OVERFLOW_CATEGORY_IDS || []).length;
  throw new Error(
    `Todas as ${categories.length} categorias de tópicos estão cheias (1 principal + ${overflowCount} overflow). ` +
      `Cria uma nova categoria no Discord e adiciona ao env var BAIRRISTA_TOPICOS_OVERFLOW_CATEGORY_IDS (comma-separated). ` +
      `Erro Discord: ${lastErr?.message}`
  );
}

module.exports = { createResidentChannel };
