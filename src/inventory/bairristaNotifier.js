'use strict';
/**
 * Notificador dedicado dos Bairristas — publica logs de entregas/vendas
 * num canal único e limpo (📦・log-bairristas).
 *
 * Separado do stockNotifier (que vai para stock-log na categoria COMANDO).
 * Este publica embeds mais ricos com totais actualizados e impacto no ranking.
 *
 * Canal: auto-descoberto ou auto-criado na categoria BAIRRISTAS (config).
 * Cliente Discord injectado via setClient(). Boot-safe.
 */

const { ChannelType } = require('discord.js');
const CONFIG = require('../config');
const { bold } = require('../discord/structureTemplate');
const { brandEmbed, rankBadge } = require('../shared/embedBuilders');
const { BAIRRISTAS, EMOJI } = require('../content');
const { weekBounds } = require('../util');
const { log, warn } = require('../logger');

let _client = null;
let _channelId = null;

function setClient(client) {
  _client = client;
}

const CHANNEL_DEF = { emoji: '📦', slug: 'log-bairristas' };

function expectedChannelName() {
  return `${CHANNEL_DEF.emoji}・${bold(CHANNEL_DEF.slug)}`;
}

async function _findOrCreateChannel() {
  if (!_client) return null;

  // Cache hit
  if (_channelId) {
    const ch = await _client.channels.fetch(_channelId).catch(() => null);
    if (ch) return ch;
    _channelId = null;
  }

  const guild = _client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) return null;

  // Match por nome EXACTO (expectedChannelName usa bold unicode via bold());
  // regex antiga /log.bairrista/i não apanhava os chars `𝗹𝗼𝗴-𝗯𝗮𝗶𝗿𝗿𝗶𝘀𝘁𝗮𝘀` →
  // busca falhava → auto-create criava duplicado em cada boot, a ocupar slots
  // da categoria de tópicos.
  //
  // Também: não criar automaticamente. Se canal não existe, skip silencioso.
  // As notificações individuais de entrega já vivem em material-entregue; este
  // canal só é útil se a chefia o criou manualmente e quer logs centralizados.
  const expected = expectedChannelName();
  const textChannels = Array.from(guild.channels.cache.values()).filter(c => c.type === ChannelType.GuildText);

  // Match exacto, ou match loose que apanha variants (com/sem bold, acentos, etc.)
  const normalized = s =>
    String(s || '')
      .normalize('NFKD')
      .replace(/[^a-z0-9-]/gi, '')
      .toLowerCase();

  const channel = textChannels.find(c => c.name === expected || normalized(c.name).includes('logbairristas'));

  if (channel) {
    _channelId = channel.id;
    return channel;
  }

  // Canal não existe. NÃO criar — evita duplicados que saturam a categoria de
  // tópicos. Chefia pode criar manualmente se quiser logs centralizados.
  return null;
}

/**
 * Publica log de entrega/venda de material no canal dos Bairristas.
 *
 * @param {object} opts
 * @param {string} opts.movementType - 'entrega_bairrista' | 'venda_bairrista'
 * @param {string} opts.itemName
 * @param {number} opts.quantity
 * @param {number} opts.itemPrice
 * @param {string} opts.memberName
 * @param {string} opts.memberDiscordId
 * @param {string} opts.notes
 * @param {object} opts.weekStats - { totalQty, deliveries, sales }
 * @param {object} opts.rankPosition - { position, total } or null
 */
async function notifyBairristaMovement(opts) {
  if (!_client) return;

  try {
    const channel = await _findOrCreateChannel();
    if (!channel) return;

    const isVenda = opts.movementType === 'venda_bairrista';
    const L = BAIRRISTAS.LOG;
    const title = isVenda ? L.VENDA_TITLE : L.ENTREGA_TITLE;
    const color = isVenda ? 0xf1c40f : 0x2ecc71;
    const movValue = opts.quantity * (opts.itemPrice || 0);

    const fields = [
      { name: L.MEMBER, value: `<@${opts.memberDiscordId}>`, inline: true },
      { name: L.ITEM, value: `**${opts.itemName}**`, inline: true },
      { name: L.QTY, value: `**${opts.quantity}**`, inline: true },
    ];

    if (movValue > 0) {
      fields.push({
        name: L.VALUE,
        value: `**${movValue.toLocaleString('pt-PT')}€**`,
        inline: true,
      });
    }

    if (opts.weekStats) {
      const ws = opts.weekStats;
      fields.push({
        name: L.WEEK_TOTAL,
        value: `**${(ws.totalQty || 0).toLocaleString('pt-PT')}** (${ws.deliveries || 0}e · ${ws.sales || 0}v)`,
        inline: true,
      });
    }

    if (opts.rankPosition) {
      fields.push({
        name: L.RANK_IMPACT,
        value: `${rankBadge(opts.rankPosition.position)}/${opts.rankPosition.total}`,
        inline: true,
      });
    }

    if (opts.notes) {
      fields.push({ name: L.NOTES, value: opts.notes.slice(0, 200), inline: false });
    }

    const embed = brandEmbed('MOVEMENT').setColor(color).setTitle(title).addFields(fields);

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (e) {
    warn(`[BAIRRISTA-LOG] notifyBairristaMovement falhou: ${e.message}`);
  }
}

/**
 * Publica resumo diário/semanal no canal dos Bairristas.
 */
async function publishSummary(embed) {
  if (!_client) return;
  try {
    const channel = await _findOrCreateChannel();
    if (!channel) return;
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (e) {
    warn(`[BAIRRISTA-LOG] publishSummary falhou: ${e.message}`);
  }
}

module.exports = {
  setClient,
  notifyBairristaMovement,
  publishSummary,
  _findOrCreateChannel,
  CHANNEL_DEF,
};
