'use strict';
/**
 * Preçário interativo — preços personalizados por rank do membro.
 *
 * Ao carregar num botão, o membro recebe uma mensagem efémera com:
 *   - Preços de VENDA (a firma compra-lhe)
 *   - Preços de COMPRA (ele compra à firma, sem material)
 *   - Preços de COMPRA c/ MATERIAL (ele entrega ingredientes, paga markup)
 *   - Fórmulas de craft (ingredientes)
 *
 * Tudo calculado em tempo real com base no rank do membro.
 */

const { MessageFlags } = require('discord.js');
const { inventoryRepo } = require('../repositories');
const craftRecipeRepo = require('../repositories/craftRecipe');
const { getRankMultiplier } = require('../orders/orderPricingEngine');
const { brandEmbed, applyLogo, COLOR, headerLine } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { safeReply } = require('../shared/interactionHelpers');
const { query } = require('../db');

// ══════════════════════════════════════════════════════════════════════════════
// Categorias e apresentação
// ══════════════════════════════════════════════════════════════════════════════

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

const CATEGORY_GROUPS = [
  {
    title: '📋 Matérias-Primas & Recursos',
    color: COLOR.INFO,
    cats: ['lixo', 'madeiras', 'materias_primas', 'minerios'],
  },
  {
    title: '📋 Componentes & Equipamento',
    color: COLOR.SUCCESS,
    cats: ['corpos', 'prints', 'carregadores', 'coletes', 'acessorios'],
  },
  { title: '📋 Armas', color: COLOR.DANGER, cats: ['armas_orange', 'armas_red', 'armas_extra', 'armas_brancas'] },
  { title: '📋 Drogas', color: COLOR.PURPLE, cats: ['drogas'] },
];

function fmtShortPrice(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M€';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'k€';
  return num + '€';
}

// ══════════════════════════════════════════════════════════════════════════════
// Build price line para um item
// ══════════════════════════════════════════════════════════════════════════════

function buildItemLine(item, { buyMult, sellMult, recipeMap }) {
  const base = parseFloat(item.estimated_value) || 0;
  const sellPrice = base * (1 + sellMult);
  const buyPrice = base * (1 + buyMult);

  const recipe = recipeMap.get(item.id);
  let line = '';

  if (recipe) {
    // Item craftável: mostra Venda, Compra sem material, Compra c/ material
    const materialCost = recipe.ingredients.reduce((sum, ing) => {
      const unit = parseFloat(ing.unit_price) || parseFloat(ing.ingredient_price) || 0;
      return sum + unit * ing.quantity;
    }, 0);
    const buyWithMat = materialCost * (1 + buyMult);

    line = `\`V:${fmtShortPrice(sellPrice)}\` \`C:${fmtShortPrice(buyPrice)}\` \`🛠️:${fmtShortPrice(buyWithMat)}\` **${item.name}**`;
  } else {
    // Item simples: Venda e Compra
    line = `\`V:${fmtShortPrice(sellPrice)}\` \`C:${fmtShortPrice(buyPrice)}\` **${item.name}**`;
  }

  return line;
}

// ══════════════════════════════════════════════════════════════════════════════
// Build embeds
// ══════════════════════════════════════════════════════════════════════════════

async function buildPriceEmbedsForMember(memberRole) {
  const [items, recipes] = await Promise.all([inventoryRepo.getItems(true), craftRecipeRepo.getAllRecipes()]);

  // Pré-carregar recipes com ingredientes
  const recipeMap = new Map();
  for (const r of recipes) {
    const full = await craftRecipeRepo.getRecipeWithIngredients(r.item_id);
    if (full) recipeMap.set(r.item_id, full);
  }

  const buyMult = getRankMultiplier(memberRole, 'buy');
  const sellMult = getRankMultiplier(memberRole, 'sell');
  const multCtx = { buyMult, sellMult, recipeMap };

  const embeds = [];

  // ── Preços por categoria ──────────────────────────────────────────────────
  for (const group of CATEGORY_GROUPS) {
    const embed = applyLogo(
      brandEmbed('MOVEMENT')
        .setColor(group.color)
        .setTitle(group.title)
        .setDescription(`Preços para o teu rank: **${memberRole}**` + headerLine('', 'Legenda'))
    );

    let hasAny = false;
    for (const catKey of group.cats) {
      const catItems = items.filter(i => i.category === catKey).sort((a, b) => a.name.localeCompare(b.name));
      if (!catItems.length) continue;
      hasAny = true;

      const catDef = PRICE_CATEGORIES.find(c => c.key === catKey);
      const lines = catItems.map(i => buildItemLine(i, multCtx));

      // Divide em chunks se necessário (max 1024 chars por field)
      let chunk = [];
      let chunkLen = 0;
      for (const line of lines) {
        if (chunkLen + line.length + 1 > 1024) {
          embed.addFields({ name: catDef?.label || catKey, value: chunk.join('\n'), inline: false });
          chunk = [line];
          chunkLen = line.length;
        } else {
          chunk.push(line);
          chunkLen += line.length + 1;
        }
      }
      if (chunk.length) {
        embed.addFields({ name: catDef?.label || catKey, value: chunk.join('\n'), inline: false });
      }
    }

    if (hasAny) {
      embed.setFooter({
        text: `V = Venda à Firma | C = Compra à Firma | 🛠️ = Compra c/ material entregue | Rank: ${memberRole} (Compra +${(buyMult * 100).toFixed(0)}%, Venda +${(sellMult * 100).toFixed(0)}%)`,
      });
      embeds.push(embed);
    }
  }

  // ── Embed de Fórmulas de Craft ────────────────────────────────────────────
  const craftEmbed = applyLogo(
    brandEmbed('MOVEMENT')
      .setColor(COLOR.MUTED)
      .setTitle(`${EMOJI.CRAFT} Fórmulas de Craft`)
      .setDescription('Ingredientes necessários para craftar cada item.')
  );

  const byCategory = new Map();
  for (const r of recipes) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }

  const CRAFT_LABELS = {
    craft_weapons: 'Armas',
    craft_carregadores: 'Carregadores',
    craft_prints: 'Prints',
    craft_corpos: 'Corpos de Arma',
  };

  for (const [cat, catRecipes] of byCategory) {
    const lines = [];
    for (const r of catRecipes.sort((a, b) => a.item_id - b.item_id)) {
      const recipe = recipeMap.get(r.item_id);
      if (!recipe) continue;
      const ingStr = recipe.ingredients.map(ing => `${ing.quantity}× ${ing.ingredient_name}`).join(', ');
      lines.push(`**${recipe.item_name}** — ${ingStr}`);
    }
    if (lines.length) {
      craftEmbed.addFields({
        name: CRAFT_LABELS[cat] || cat,
        value: lines.join('\n').slice(0, 1024),
        inline: false,
      });
    }
  }

  if (craftEmbed.data.fields?.length) {
    embeds.push(craftEmbed);
  }

  return embeds;
}

// ══════════════════════════════════════════════════════════════════════════════
// Handler
// ══════════════════════════════════════════════════════════════════════════════

async function handlePrecariosButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Resolve rank do membro
    const memberRes = await query('SELECT role FROM members WHERE discord_id = $1', [interaction.user.id]);
    const memberRole = memberRes.rows[0]?.role || 'bairrista';

    const embeds = await buildPriceEmbedsForMember(memberRole);

    if (!embeds.length) {
      return safeReply(
        interaction,
        { content: `${EMOJI.ERRO} Não há preços disponíveis de momento.`, flags: MessageFlags.Ephemeral },
        { messageClass: 'BANAL' }
      );
    }

    // Discord limita a 10 embeds por mensagem
    const toSend = embeds.slice(0, 10);

    return safeReply(interaction, { embeds: toSend, flags: MessageFlags.Ephemeral }, { messageClass: 'RESULT' });
  } catch (e) {
    return safeReply(
      interaction,
      { content: `${EMOJI.ERRO} Erro ao gerar preçário: ${e.message}`, flags: MessageFlags.Ephemeral },
      { messageClass: 'RESULT' }
    );
  }
}

module.exports = { handlePrecariosButton, buildPriceEmbedsForMember };
