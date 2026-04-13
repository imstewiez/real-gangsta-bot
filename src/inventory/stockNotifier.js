'use strict';
/**
 * Stock notifier — publica embeds de movimentos de inventário nos canais
 * dedicados da categoria INVENTÁRIO.
 *
 * Auto-discover: procura canais por nome dentro da categoria INVENTARIO.
 * Se algum não existir e `STOCK_AUTOCREATE=true` (default), cria-o com
 * o nome canónico (usando o mesmo helper `bold` do template).
 *
 * Cliente Discord é injectado uma vez no `ClientReady` via setClient(client).
 * Antes disso, todas as chamadas são no-op silenciosas (boot-safe).
 *
 * Mapping movement_type → canal:
 *   saldo_inicial, entrega_morador, venda_morador, entrega_oficial,
 *   devolucao_operacao, apreendido, craftado    → entradas-stock
 *   fornecimento_org, consumo_operacao, perda_operacao  → saídas-stock
 *   ajuste_manual                                → ajustes-stock
 *
 * Resumo periódico no `resumo-stock` é publicado pelo job stock_summary.
 */

const { ChannelType, EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { CATEGORY_BY_KEY, bold } = require('../discord/structureTemplate');
const { brandEmbed } = require('../shared/embedBuilders');
const { log, warn } = require('../logger');

let _client = null;
const _channelCache = new Map(); // logical key → channelId

function setClient(client) { _client = client; }

// Mapping logical key → emoji + slug (igual a CHANNELS_TO_CREATE no template)
const STOCK_CHANNELS = {
  resumo:   { emoji: '📊', slug: 'resumo-stock' },
  entradas: { emoji: '📥', slug: 'entradas-stock' },
  saidas:   { emoji: '📤', slug: 'saídas-stock' },
  ajustes:  { emoji: '🧾', slug: 'ajustes-stock' },
};

// Movement type → canal lógico
const MOVEMENT_TO_CHANNEL = {
  saldo_inicial:       'entradas',
  entrega_morador:     'entradas',
  venda_morador:       'entradas',
  entrega_oficial:     'entradas',
  devolucao_operacao:  'entradas',
  apreendido:          'entradas',
  craftado:            'entradas',
  fornecimento_org:    'saidas',
  consumo_operacao:    'saidas',
  perda_operacao:      'saidas',
  ajuste_manual:       'ajustes',
};

const MOVEMENT_LABEL = {
  saldo_inicial:       '📦 Saldo Inicial',
  entrega_morador:     '📥 Entrega (Morador)',
  venda_morador:       '💰 Venda (Morador)',
  entrega_oficial:     '📥 Entrega (Oficial)',
  devolucao_operacao:  '↩️ Devolução de Operação',
  apreendido:          '🪪 Apreendido',
  craftado:            '🛠️ Craftado',
  fornecimento_org:    '📤 Fornecimento (Org)',
  consumo_operacao:    '🔥 Consumo de Operação',
  perda_operacao:      '💥 Perda em Operação',
  ajuste_manual:       '🔧 Ajuste Manual',
};

const MOVEMENT_COLOR = {
  entradas: 0x2ECC71,  // verde
  saidas:   0xE67E22,  // laranja
  ajustes:  0x9B59B6,  // roxo
};

function expectedChannelName(key) {
  const def = STOCK_CHANNELS[key];
  return `${def.emoji}・${bold(def.slug)}`;
}

async function findOrCreateChannel(channelKey) {
  if (_channelCache.has(channelKey)) {
    const cached = _channelCache.get(channelKey);
    // Validar que o canal ainda existe
    const ch = await _client.channels.fetch(cached).catch(() => null);
    if (ch) return ch;
    _channelCache.delete(channelKey);
  }

  const inventarioCat = CATEGORY_BY_KEY.INVENTARIO;
  if (!inventarioCat || !inventarioCat.id) {
    warn('[STOCK-NOTIFY] CATEGORY_BY_KEY.INVENTARIO em falta — abortar.');
    return null;
  }

  const guild = _client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) return null;

  const expectedName = expectedChannelName(channelKey);
  const slug = STOCK_CHANNELS[channelKey].slug;

  // Procura por nome exacto OU pelo slug (Discord pode ter sanitizado).
  let channel = guild.channels.cache.find(c =>
    c.parentId === inventarioCat.id &&
    (c.name === expectedName || c.name.toLowerCase().includes(slug.toLowerCase()))
  );

  if (!channel && CONFIG.STOCK_AUTOCREATE) {
    try {
      channel = await guild.channels.create({
        name: expectedName,
        type: ChannelType.GuildText,
        parent: inventarioCat.id,
        reason: `Auto-criado pelo stockNotifier (${channelKey})`,
      });
      log(`[STOCK-NOTIFY] Canal '${expectedName}' criado em INVENTÁRIO.`);
    } catch (e) {
      warn(`[STOCK-NOTIFY] Falha a criar '${expectedName}': ${e.message}`);
      return null;
    }
  }

  if (channel) _channelCache.set(channelKey, channel.id);
  return channel;
}

/**
 * Publica embed dum movimento individual no canal correspondente.
 * Fire-and-forget; falhas são log, não interrompem fluxo do caller.
 *
 * @param {object} movement {
 *   movementType, itemName, quantity, memberName?, memberDiscordId?,
 *   actorId, context?, balanceAfter?, operationId?
 * }
 */
async function notifyMovement(movement) {
  if (!CONFIG.STOCK_NOTIFY_ENABLED) return;
  if (!_client) return; // boot-safe

  const channelKey = MOVEMENT_TO_CHANNEL[movement.movementType];
  if (!channelKey) return;

  try {
    const channel = await findOrCreateChannel(channelKey);
    if (!channel) return;

    const label = MOVEMENT_LABEL[movement.movementType] || movement.movementType;
    const color = MOVEMENT_COLOR[channelKey] || 0x95A5A6;

    const fields = [
      { name: 'Item', value: `**${movement.itemName || '—'}**`, inline: true },
      { name: 'Quantidade', value: `\`${movement.quantity}\``, inline: true },
    ];
    if (movement.balanceAfter !== undefined && movement.balanceAfter !== null) {
      fields.push({ name: 'Balance', value: `\`${movement.balanceAfter}\``, inline: true });
    }
    if (movement.memberDiscordId) {
      fields.push({ name: 'Membro', value: `<@${movement.memberDiscordId}>`, inline: true });
    } else if (movement.memberName) {
      fields.push({ name: 'Membro', value: movement.memberName, inline: true });
    }
    if (movement.operationId) {
      fields.push({ name: 'Operação', value: `#${movement.operationId}`, inline: true });
    }
    if (movement.context) {
      fields.push({ name: 'Contexto', value: movement.context.slice(0, 200), inline: false });
    }

    const embed = brandEmbed()
      .setColor(color)
      .setTitle(label)
      .addFields(fields);
    if (movement.actorId) {
      embed.setFooter({ text: `Por ${movement.actorId}` });
    }

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (e) {
    warn(`[STOCK-NOTIFY] notifyMovement falhou: ${e.message}`);
  }
}

/**
 * Snapshot completo do stock — publicado no canal `resumo-stock`.
 * Usado pelo job periódico stock_summary.
 */
async function publishStockSummary() {
  if (!CONFIG.STOCK_NOTIFY_ENABLED) return { skipped: true };
  if (!_client) return { skipped: true, reason: 'no_client' };

  try {
    const channel = await findOrCreateChannel('resumo');
    if (!channel) return { skipped: true, reason: 'no_channel' };

    const { inventoryRepo } = require('../repositories');
    const stock = await inventoryRepo.getStock();

    const grouped = {};
    let totalValue = 0;
    for (const it of stock) {
      if (!grouped[it.category]) grouped[it.category] = [];
      grouped[it.category].push(it);
      const balance = parseInt(it.balance) || 0;
      const val = parseFloat(it.estimated_value) || 0;
      totalValue += balance * val;
    }

    const embed = brandEmbed()
      .setColor(0x3498DB)
      .setTitle(`📊 Resumo de Stock — ${new Date().toLocaleString('pt-PT')}`)
      .setDescription(`Total estimado: **${totalValue.toLocaleString('pt-PT')} €**`);

    for (const [category, items] of Object.entries(grouped)) {
      const lines = items
        .filter(i => parseInt(i.balance) !== 0)
        .map(i => `\`${String(i.balance).padStart(5)}\` ${i.unit.padEnd(8)} ${i.name}`)
        .slice(0, 15)
        .join('\n');
      if (lines) embed.addFields({ name: `**${category.toUpperCase()}**`, value: '```\n' + lines + '\n```', inline: false });
    }

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return { posted: true, items: stock.length, totalValue };
  } catch (e) {
    warn(`[STOCK-NOTIFY] publishStockSummary falhou: ${e.message}`);
    return { skipped: true, reason: e.message };
  }
}

module.exports = {
  setClient,
  notifyMovement,
  publishStockSummary,
  findOrCreateChannel,
  STOCK_CHANNELS,
  MOVEMENT_TO_CHANNEL,
};
