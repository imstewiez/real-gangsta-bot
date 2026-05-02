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
const {
  brandEmbed,
  rankBadge,
  COLOR,
  headerLine,
  dataGrid,
  statusPill,
  metricCard,
  setFooterText,
} = require('../shared/embedBuilders');
const { BAIRRISTAS, EMOJI } = require('../content');
// const { weekBounds } = require('../util');
const { warn } = require('../logger');

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
    const color = isVenda ? COLOR.GOLD : COLOR.SUCCESS;
    const movValue = opts.quantity * (opts.itemPrice || 0);

    const desc = [
      headerLine(isVenda ? EMOJI.LUCRO : EMOJI.MATERIAL, isVenda ? 'MATERIAL' : 'MATERIAL'),
      `**${opts.itemName}** · **${opts.quantity.toLocaleString('pt-PT')}x**`,
    ];
    if (movValue > 0) desc.push(`💰 Valor: **${movValue.toLocaleString('pt-PT')}€**`);

    const fields = dataGrid([
      { icon: '👤', label: 'Membro', value: `<@${opts.memberDiscordId}>`, inline: true },
      { icon: '📝', label: 'Registou', value: `<@${opts.createdBy || opts.memberDiscordId}>`, inline: true },
      { icon: '💰', label: 'Valor', value: `${movValue.toLocaleString('pt-PT')}€`, inline: true },
    ]);

    if (opts.weekStats) {
      const ws = opts.weekStats;
      fields.push(metricCard('Semana', `${(ws.totalQty || 0).toLocaleString('pt-PT')} un`, { icon: '📊' }));
    }
    if (opts.rankPosition) {
      fields.push({
        name: '🏆 Ranking',
        value: `${rankBadge(opts.rankPosition.position)}/${opts.rankPosition.total}`,
        inline: true,
      });
    }

    desc.push('', headerLine(EMOJI.OK, 'ESTADO'));
    desc.push(statusPill('+  APROVADO', 'diff'));

    if (opts.notes) {
      desc.push('', `📝 Notas: _${opts.notes.slice(0, 200)}_`);
    }

    const embed = brandEmbed('MOVEMENT')
      .setColor(color)
      .setTitle(title)
      .setDescription(desc.join('\n'))
      .addFields(fields);

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (e) {
    warn(`[BAIRRISTA-LOG] notifyBairristaMovement falhou: ${e.message}`);
  }
}

/**
 * Publica log agregado de uma submission multi-item no canal dos Bairristas.
 *
 * Um só embed para a submission inteira (em vez de N embeds como o
 * antigo notifyBairristaMovement). Devolve { messageId, channelId } para
 * permitir edit/delete pelo undo.
 *
 * @param {object} opts
 * @returns {Promise<{ messageId: string|null, channelId: string|null }>}
 */
async function notifyBairristaBatch(opts) {
  if (!_client) return { messageId: null, channelId: null };

  try {
    const channel = await _findOrCreateChannel();
    if (!channel) return { messageId: null, channelId: null };

    const isVenda = opts.tipo === 'venda';
    const L = BAIRRISTAS.LOG;
    const baseTitle = isVenda ? L.VENDA_TITLE : L.ENTREGA_TITLE;
    const title = opts.lines.length > 1 ? `${baseTitle} · ${opts.lines.length} itens` : baseTitle;
    const color = isVenda ? COLOR.GOLD : COLOR.SUCCESS;

    const desc = [headerLine(isVenda ? EMOJI.LUCRO : EMOJI.MATERIAL, isVenda ? 'ITENS' : 'ITENS')];
    const itemLines = opts.lines.slice(0, 20).map(l => {
      const valTag = l.lineValue > 0 ? ` · **${l.lineValue.toLocaleString('pt-PT')}€**` : '';
      const priceTag = isVenda && l.unitPrice !== null && l.unitPrice !== undefined ? ` ⚡@${l.unitPrice}€` : '';
      return `**${l.quantity}×** ${l.itemName}${priceTag}${valTag}`;
    });
    if (opts.lines.length > 20) itemLines.push(`… +${opts.lines.length - 20} itens`);
    desc.push(...itemLines);
    desc.push('', `📊 **Total:** ${opts.totalQty.toLocaleString('pt-PT')} unidades`);
    if (opts.totalValue > 0) desc.push(`💰 **Valor:** ${opts.totalValue.toLocaleString('pt-PT')}€`);

    const fields = dataGrid([
      { icon: '👤', label: 'Membro', value: `<@${opts.memberDiscordId}>`, inline: true },
      { icon: '📝', label: 'Registou', value: `<@${opts.createdBy || opts.memberDiscordId}>`, inline: true },
    ]);

    if (opts.weekStats) {
      const ws = opts.weekStats;
      fields.push(metricCard('Semana', `${(ws.totalQty || 0).toLocaleString('pt-PT')} un`, { icon: '📊' }));
    }
    if (opts.rankPosition) {
      fields.push({
        name: '🏆 Ranking',
        value: `${rankBadge(opts.rankPosition.position)}/${opts.rankPosition.total}`,
        inline: true,
      });
    }

    desc.push('', headerLine(EMOJI.OK, 'ESTADO'));
    desc.push(statusPill('+  APROVADO', 'diff'));

    if (opts.notes) {
      desc.push('', `📝 Notas: _${opts.notes.slice(0, 200)}_`);
    }

    const embed = brandEmbed('MOVEMENT')
      .setColor(color)
      .setTitle(title)
      .setDescription(desc.join('\n'))
      .addFields(fields);
    if (opts.submissionId) {
      setFooterText(embed, `submission ${opts.submissionId.slice(0, 8)}`);
    }

    const msg = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(e => {
      warn(`[BAIRRISTA-LOG] send batch falhou: ${e.message}`);
      return null;
    });
    return { messageId: msg?.id || null, channelId: channel.id };
  } catch (e) {
    warn(`[BAIRRISTA-LOG] notifyBairristaBatch falhou: ${e.message}`);
    return { messageId: null, channelId: null };
  }
}

/**
 * Edita a mensagem de uma submission cancelada — prefixa título com
 * "❌ Cancelada" e muda cor para cinza. Não apaga — preserva histórico
 * visual no canal.
 */
async function editBairristaBatchAsCancelled(client, channelId, messageId) {
  if (!client || !channelId || !messageId) return false;
  try {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch?.isTextBased?.()) return false;
    const msg = await ch.messages.fetch(messageId).catch(() => null);
    if (!msg) return false;
    const original = msg.embeds?.[0];
    if (!original) return false;

    const updated = brandEmbed('MOVEMENT')
      .setColor(COLOR.MUTED)
      .setTitle(`${EMOJI.ERRO} Cancelada — ${original.title || 'submission'}`)
      .setDescription('_Esta submission foi desfeita pelo autor dentro da janela de 5 min._')
      .addFields(original.fields || []);
    if (original.footer?.text) setFooterText(updated, original.footer.text);

    await msg.edit({ embeds: [updated] }).catch(() => {});
    return true;
  } catch (e) {
    warn(`[BAIRRISTA-LOG] editBairristaBatchAsCancelled falhou: ${e.message}`);
    return false;
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
  notifyBairristaBatch,
  editBairristaBatchAsCancelled,
  publishSummary,
  _findOrCreateChannel,
  CHANNEL_DEF,
};
