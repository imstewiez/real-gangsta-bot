'use strict';
/**
 * Publica e mantém o embed de preços e fórmulas no canal designado.
 *
 * Padrão find-or-create: tenta editar mensagem existente; se não encontrar,
 * envia nova e guarda o ID na tabela price_list_messages.
 */

const { EmbedBuilder } = require('discord.js');
const { query } = require('../db');
const { inventoryRepo } = require('../repositories');
const craftRecipeRepo = require('../repositories/craftRecipe');
const { getRankMultiplier } = require('../orders/orderPricingEngine');
const { applyLogo } = require('../shared/embedBuilders');
const { warn } = require('../logger');

const CHANNEL_ID = process.env.PRICE_LIST_CHANNEL_ID || '1493279424840339627';

// ── Categorias e ordem de apresentação ─────────────────────────────────────
const PRICE_CATEGORIES = [
  { key: 'lixo', label: '♻️ Lixo & Reciclagem', emoji: '♻️' },
  { key: 'madeiras', label: '🪵 Madeiras', emoji: '🪵' },
  { key: 'materias_primas', label: '🔧 Matérias-Primas', emoji: '🔧' },
  { key: 'minerios', label: '⛏️ Minérios', emoji: '⛏️' },
  { key: 'corpos', label: '🔩 Corpos de Arma', emoji: '🔩' },
  { key: 'prints', label: '📜 Prints', emoji: '📜' },
  { key: 'armas_orange', label: '🔫 Armas Orange', emoji: '🔫' },
  { key: 'armas_red', label: '🔴 Armas Red', emoji: '🔴' },
  { key: 'armas_extra', label: '⭐ Armas Extra', emoji: '⭐' },
  { key: 'armas_brancas', label: '🔪 Armas Brancas', emoji: '🔪' },
  { key: 'carregadores', label: '🔋 Carregadores', emoji: '🔋' },
  { key: 'coletes', label: '🛡️ Coletes', emoji: '🛡️' },
  { key: 'acessorios', label: '🎒 Acessórios', emoji: '🎒' },
  { key: 'drogas', label: '💊 Drogas', emoji: '💊' },
];

const CRAFT_CATEGORIES = [
  { key: 'craft_weapons', label: '🛠️ Craft: Armas', subLabel: 'orange' },
  { key: 'craft_carregadores', label: '🛠️ Craft: Carregadores', subLabel: null },
  { key: 'craft_prints', label: '🛠️ Craft: Prints', subLabel: null },
  { key: 'craft_corpos', label: '🛠️ Craft: Corpos', subLabel: null },
];

function fmtPrice(n) {
  return (Number(n) || 0).toLocaleString('pt-PT') + '€';
}

function buildMultiplierFooter() {
  const buy = [
    `YB +${(getRankMultiplier('bairrista', 'buy', 'young_blood') * 100).toFixed(0)}%`,
    `OG +${(getRankMultiplier('bairrista', 'buy', 'o_gunao') * 100).toFixed(0)}%`,
    `GF +${(getRankMultiplier('bairrista', 'buy', 'gangster_fodido') * 100).toFixed(0)}%`,
    `Patrão/Oficial/Chefia 0%`,
  ].join(' | ');
  const sell = [
    `YB ${(getRankMultiplier('bairrista', 'sell', 'young_blood') * 100).toFixed(0)}%`,
    `OG ${(getRankMultiplier('bairrista', 'sell', 'o_gunao') * 100).toFixed(0)}%`,
    `GF +${(getRankMultiplier('bairrista', 'sell', 'gangster_fodido') * 100).toFixed(0)}%`,
    `Patrão/Oficial/Chefia 0%`,
  ].join(' | ');
  return `💰 Compras: ${buy}\n💵 Vendas: ${sell}`;
}

async function buildPriceEmbeds() {
  const items = await inventoryRepo.getItems(true);
  const recipes = await craftRecipeRepo.getAllRecipes();

  // Map recipes by item_id for quick lookup
  const recipeMap = new Map();
  for (const r of recipes) {
    recipeMap.set(r.item_id, r);
  }

  const embeds = [];

  // ── Embed 1: Matérias-Primas, Minérios, Madeiras, Lixo ──────────────────
  const embed1 = applyLogo(new EmbedBuilder().setTitle('📋 Preçario — Matérias-Primas & Recursos').setColor(0x3498db));

  for (const cat of ['materias_primas', 'minerios', 'madeiras', 'lixo']) {
    const catItems = items.filter(i => i.category === cat).sort((a, b) => a.name.localeCompare(b.name));
    if (!catItems.length) continue;
    const lines = catItems.map(i => `\`${fmtPrice(i.estimated_value).padStart(8)}\` ${i.name}`);
    const catDef = PRICE_CATEGORIES.find(c => c.key === cat);
    embed1.addFields({ name: catDef?.label || cat, value: lines.join('\n'), inline: true });
  }
  embed1.setFooter({ text: buildMultiplierFooter() });
  embeds.push(embed1);

  // ── Embed 2: Corpos, Prints, Carregadores, Coletes, Acessórios ─────────
  const embed2 = applyLogo(new EmbedBuilder().setTitle('📋 Preçario — Componentes & Equipamento').setColor(0x2ecc71));

  for (const cat of ['corpos', 'prints', 'carregadores', 'coletes', 'acessorios']) {
    const catItems = items.filter(i => i.category === cat).sort((a, b) => a.name.localeCompare(b.name));
    if (!catItems.length) continue;
    const lines = catItems.map(i => `\`${fmtPrice(i.estimated_value).padStart(8)}\` ${i.name}`);
    const catDef = PRICE_CATEGORIES.find(c => c.key === cat);
    embed2.addFields({ name: catDef?.label || cat, value: lines.join('\n'), inline: true });
  }
  embeds.push(embed2);

  // ── Embed 3: Armas (Orange, Red, Extra, Brancas) ───────────────────────
  const embed3 = applyLogo(new EmbedBuilder().setTitle('📋 Preçario — Armas').setColor(0xe74c3c));

  for (const cat of ['armas_orange', 'armas_red', 'armas_extra', 'armas_brancas']) {
    const catItems = items.filter(i => i.category === cat).sort((a, b) => a.name.localeCompare(b.name));
    if (!catItems.length) continue;
    const lines = catItems.map(i => {
      const hasRecipe = recipeMap.has(i.id) ? ' 🛠️' : '';
      return `\`${fmtPrice(i.estimated_value).padStart(10)}\` ${i.name}${hasRecipe}`;
    });
    const catDef = PRICE_CATEGORIES.find(c => c.key === cat);
    embed3.addFields({ name: catDef?.label || cat, value: lines.join('\n'), inline: true });
  }
  embeds.push(embed3);

  // ── Embed 4: Drogas ────────────────────────────────────────────────────
  const embedDrugs = applyLogo(new EmbedBuilder().setTitle('📋 Preçario — Drogas').setColor(0x9b59b6));
  const drugItems = items.filter(i => i.category === 'drogas').sort((a, b) => a.name.localeCompare(b.name));
  if (drugItems.length) {
    const lines = drugItems.map(i => `\`${fmtPrice(i.estimated_value).padStart(6)}\` ${i.name}`);
    embedDrugs.setDescription(lines.join('\n'));
    embeds.push(embedDrugs);
  }

  // ── Embeds de Craft ────────────────────────────────────────────────────
  // Group recipes by category
  const byCategory = new Map();
  for (const r of recipes) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }

  for (const catDef of CRAFT_CATEGORIES) {
    const catRecipes = byCategory.get(catDef.key) || [];
    if (!catRecipes.length) continue;

    // For craft_weapons, group by tier
    if (catDef.key === 'craft_weapons') {
      for (const tier of ['orange', 'red']) {
        const tierRecipes = catRecipes.filter(r => r.tier === tier).sort((a, b) => a.item_id - b.item_id);
        if (!tierRecipes.length) continue;

        const embed = applyLogo(
          new EmbedBuilder()
            .setTitle(`${catDef.label} (${tier.toUpperCase()})`)
            .setColor(tier === 'orange' ? 0xf39c12 : 0xe74c3c)
        );

        for (const r of tierRecipes) {
          const recipe = await craftRecipeRepo.getRecipeWithIngredients(r.item_id);
          if (!recipe) continue;
          const ingLines = recipe.ingredients.map(ing => `• ${ing.ingredient_name}: ${ing.quantity}x`);
          embed.addFields({
            name: recipe.item_name,
            value: ingLines.join('\n'),
            inline: true,
          });
        }
        embeds.push(embed);
      }
    } else {
      const embed = applyLogo(new EmbedBuilder().setTitle(catDef.label).setColor(0x95a5a6));

      for (const r of catRecipes.sort((a, b) => a.item_id - b.item_id)) {
        const recipe = await craftRecipeRepo.getRecipeWithIngredients(r.item_id);
        if (!recipe) continue;
        const ingLines = recipe.ingredients.map(ing => `• ${ing.ingredient_name}: ${ing.quantity}x`);
        embed.addFields({
          name: recipe.item_name,
          value: ingLines.join('\n'),
          inline: true,
        });
      }
      embeds.push(embed);
    }
  }

  return embeds;
}

async function getStoredMessage(channelId) {
  const res = await query('SELECT message_id FROM price_list_messages WHERE channel_id = $1', [channelId]);
  return res.rows[0]?.message_id || null;
}

async function setStoredMessage(channelId, messageId) {
  await query(
    `INSERT INTO price_list_messages (channel_id, message_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (channel_id) DO UPDATE SET message_id = $2, updated_at = NOW()`,
    [channelId, messageId]
  );
}

async function publishPriceListEmbed(client, channelId = CHANNEL_ID) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    warn(`[PRICE_LIST] Canal ${channelId} não encontrado.`);
    return { success: false, reason: 'channel_not_found' };
  }

  const embeds = await buildPriceEmbeds();
  const storedMessageId = await getStoredMessage(channelId);

  // Try to edit existing message
  if (storedMessageId) {
    try {
      const message = await channel.messages.fetch(storedMessageId);
      await message.edit({ embeds });
      return { success: true, action: 'edited', messageId: storedMessageId };
    } catch (err) {
      warn(`[PRICE_LIST] Não foi possível editar mensagem ${storedMessageId}: ${err.message}`);
    }
  }

  // Send new message
  try {
    const message = await channel.send({ embeds });
    await setStoredMessage(channelId, message.id);
    return { success: true, action: 'sent', messageId: message.id };
  } catch (err) {
    warn(`[PRICE_LIST] Erro ao enviar mensagem: ${err.message}`);
    return { success: false, reason: 'send_failed', error: err.message };
  }
}

module.exports = {
  buildPriceEmbeds,
  publishPriceListEmbed,
  CHANNEL_ID,
};
