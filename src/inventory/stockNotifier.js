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
 *   todos os movimentos → stock-log (canal único, badge distingue tipo)
 *
 * Resumo periódico + alertas → `resumo-stock`.
 */

const { ChannelType } = require('discord.js');
const CONFIG = require('../config');
const { CATEGORY_BY_KEY, bold } = require('../discord/structureTemplate');
const { brandEmbed, COLOR, setFooterText } = require('../shared/embedBuilders');
const { formatPtDate } = require('../shared/formatPtDate');
const { log, warn } = require('../logger');

let _client = null;
const _channelCache = new Map(); // logical key → channelId

function setClient(client) {
  _client = client;
}

// Mapping logical key → emoji + slug (igual a CHANNELS_TO_CREATE no template)
// Estrutura compactada — 2 canais:
//   stock_log → todos os movimentos (cor do embed distingue tipo)
//   resumo    → snapshots periódicos + alertas críticos
const STOCK_CHANNELS = {
  resumo: { emoji: '📊', slug: 'resumo-stock' },
  stock_log: { emoji: '📦', slug: 'stock-log' },
};

// Todos os movement types → stock_log (canal único, diferenciação via cor+label)
const MOVEMENT_TO_CHANNEL = {
  saldo_inicial: 'stock_log',
  entrega_bairrista: 'stock_log',
  venda_bairrista: 'stock_log',
  entrega_oficial: 'stock_log',
  devolucao_saida: 'stock_log',
  apreendido: 'stock_log',
  craftado: 'stock_log',
  fornecimento_org: 'stock_log',
  consumo_saida: 'stock_log',
  perda_saida: 'stock_log',
  ajuste_manual: 'stock_log',
};

// Classificação lógica para cor do embed (entradas verde / saídas laranja / ajustes roxo)
const MOVEMENT_KIND = {
  saldo_inicial: 'entradas',
  entrega_bairrista: 'entradas',
  venda_bairrista: 'entradas',
  entrega_oficial: 'entradas',
  devolucao_saida: 'entradas',
  apreendido: 'entradas',
  craftado: 'entradas',
  fornecimento_org: 'saidas',
  consumo_saida: 'saidas',
  perda_saida: 'saidas',
  ajuste_manual: 'ajustes',
};

const MOVEMENT_LABEL = {
  saldo_inicial: '📦 Saldo Inicial',
  entrega_bairrista: '📥 Entrega (Bairrista)',
  venda_bairrista: '💰 Venda (Bairrista)',
  entrega_oficial: '📥 Entrega (Oficial)',
  devolucao_saida: '↩️ Devolução de Saída',
  apreendido: '🪪 Apreendido',
  craftado: '🛠️ Craftado',
  fornecimento_org: '📤 Fornecimento (Org)',
  consumo_saida: '🔥 Consumo em Saída',
  perda_saida: '💥 Perda em Saída',
  ajuste_manual: '🔧 Ajuste Manual',
};

const MOVEMENT_COLOR = {
  entradas: COLOR.SUCCESS, // verde
  saidas: COLOR.WARNING, // laranja
  ajustes: COLOR.PURPLE, // roxo
};

function expectedChannelName(key) {
  const def = STOCK_CHANNELS[key];
  return `${def.emoji}・${bold(def.slug)}`;
}

async function findOrCreateChannel(channelKey) {
  if (_channelCache.has(channelKey)) {
    const cached = _channelCache.get(channelKey);
    const ch = await _client.channels.fetch(cached).catch(() => null);
    // Se moveu de categoria fora do nosso controlo, não revalida — aceita cache.
    if (ch) return ch;
    _channelCache.delete(channelKey);
  }

  const catKey = CONFIG.STOCK_CHANNELS_CATEGORY_KEY || 'COMANDO';
  const targetCat = CATEGORY_BY_KEY[catKey];
  if (!targetCat || !targetCat.id) {
    warn(`[STOCK-NOTIFY] CATEGORY_BY_KEY.${catKey} em falta — abortar.`);
    return null;
  }

  const guild = _client.guilds.cache.get(CONFIG.DISCORD_GUILD_ID);
  if (!guild) return null;

  const expectedName = expectedChannelName(channelKey);
  const slug = STOCK_CHANNELS[channelKey].slug;

  // Para stock_log aceita fallbacks dos canais antigos por ordem de
  // preferência (stock-log > entradas > ajustes > saídas). Reutiliza o que
  // o user já tem em vez de criar 5º canal. Para resumo, só resumo-stock.
  const slugFallbacks =
    channelKey === 'stock_log'
      ? ['stock-log', 'stock_log', 'stocklog', 'entradas-stock', 'ajustes-stock', 'saídas-stock', 'saidas-stock']
      : [slug];

  const textChannels = Array.from(guild.channels.cache.values()).filter(c => c.type === ChannelType.GuildText);

  // Tenta cada fallback por ordem; para cada, procura primeiro na categoria alvo, depois em qualquer outra.
  let channel = null;
  for (const s of slugFallbacks) {
    const re = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const inCat = textChannels.find(c => c.parentId === targetCat.id && re.test(c.name));
    if (inCat) {
      channel = inCat;
      break;
    }
    const anywhere = textChannels.find(c => re.test(c.name));
    if (anywhere) {
      channel = anywhere;
      log(
        `[STOCK-NOTIFY] Canal '${anywhere.name}' encontrado em categoria ${anywhere.parentId} (layout congelado — não movido).`
      );
      break;
    }
  }

  // 3) Não existe em lado nenhum — cria novo (se permitido).
  if (!channel && CONFIG.STOCK_AUTOCREATE) {
    try {
      channel = await guild.channels.create({
        name: expectedName,
        type: ChannelType.GuildText,
        parent: targetCat.id,
        reason: `Auto-criado pelo stockNotifier (${channelKey}) em ${catKey}`,
      });
      log(`[STOCK-NOTIFY] Canal '${expectedName}' criado em ${catKey}.`);
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
    const kind = MOVEMENT_KIND[movement.movementType] || 'ajustes';
    const color = MOVEMENT_COLOR[kind] || COLOR.MUTED;

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

    const embed = brandEmbed().setColor(color).setTitle(label).addFields(fields);
    if (movement.actorId) {
      setFooterText(embed, `Por ${movement.actorId}`);
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
      .setColor(COLOR.INFO)
      .setTitle(`📊 Resumo de Stock — ${formatPtDate(new Date())}`)
      .setDescription(`Total estimado: **${totalValue.toLocaleString('pt-PT')} €**`);

    for (const [category, items] of Object.entries(grouped)) {
      const lines = items
        .filter(i => parseInt(i.balance) !== 0)
        .map(i => `\`${String(i.balance).padStart(5)}\` ${i.unit.padEnd(8)} ${i.name}`)
        .slice(0, 15)
        .join('\n');
      if (lines)
        embed.addFields({ name: `**${category.toUpperCase()}**`, value: '```\n' + lines + '\n```', inline: false });
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
