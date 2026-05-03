'use strict';
/**
 * Preçário interativo — preços personalizados por rank/tier do membro.
 *
 * Ao carregar num botão, o membro recebe uma mensagem efémera com:
 *   - Preços de VENDA (a firma compra-lhe)
 *   - Preços de COMPRA (ele compra à firma, sem material)
 *   - Preços de COMPRA c/ MATERIAL (ele entrega ingredientes, paga markup)
 *   - Fórmulas de craft (ingredientes)
 *
 * Tudo calculado em tempo real com base no rank/tier do membro.
 */

const { MessageFlags } = require('discord.js');
const { inventoryRepo } = require('../repositories');
const craftRecipeRepo = require('../repositories/craftRecipe');
const { getRankMultiplier } = require('../orders/orderPricingEngine');
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { safeReply } = require('../shared/interactionHelpers');
const { query } = require('../db');

// ── Nome → categoria de exibição (baseado no JSON original de preços) ───────
// Usado para separar armas orange/red e classificar prints/corpos correctamente.

const ARMAS_ORANGE_NAMES = new Set([
  'Taser',
  'SNS Pistol',
  'SNS Pistol MK2',
  'Pistol',
  'Pistol MK2',
  'Heavy Pistol',
  'Ceramic Pistol',
  'Vintage Pistol',
  'Mini SMG',
  'Pistol XM3',
  'Micro SMG',
  'Machine Pistol',
  'TEC Pistol',
  'AP Pistol',
  'Compact Rifle',
  'SMG',
  'SMG MK2',
  'Assault Shotgun',
  'Heavy Shotgun',
  'Gusenberg',
]);

const ARMAS_RED_NAMES = new Set([
  'Heavy',
  '.50',
  'Revolver',
  'Gadget Pistol',
  'P90',
  'PDW',
  'Assault Rifle',
  'Advanced Rifle',
  'Military',
  'Tactical Rifle',
  'Bullpup',
  'Bullpup MK2',
  'Carabina Especial',
  'Carabina Especial MK2',
]);

function classifyDisplayCategory(item) {
  const name = item.name || '';
  const cat = item.category || '';

  if (name.startsWith('Corpo')) return 'corpos';
  if (name.includes('Print')) return 'prints';
  if (cat === 'armas_brancas') return 'armas_brancas';
  if (cat === 'armas_fogo') {
    if (ARMAS_RED_NAMES.has(name)) return 'armas_red';
    if (ARMAS_ORANGE_NAMES.has(name)) return 'armas_orange';
    return 'armas_extra';
  }
  if (cat === 'municoes') return 'carregadores';
  if (cat === 'equipamento') return 'coletes';
  if (cat === 'acessorios') return 'acessorios';
  if (cat === 'droga') return 'drogas';
  if (cat === 'madeiras') return 'madeiras';
  if (cat === 'metais') return 'minerios';
  if (cat === 'reciclagem') return 'lixo';
  if (cat === 'componentes') {
    if (name.startsWith('Corpo')) return 'corpos';
    if (name.includes('Print')) return 'prints';
    return 'materias_primas';
  }
  if (cat === 'dinheiro') return 'dinheiro';
  return 'outros';
}

// ── Formatação ──────────────────────────────────────────────────────────────

function fmtPrice(n) {
  return (Number(n) || 0).toLocaleString('pt-PT') + '€';
}

function fmtPct(n) {
  const s = (n * 100).toFixed(0);
  return n >= 0 ? `+${s}%` : `${s}%`;
}

// ── Build embeds ────────────────────────────────────────────────────────────

const DISPLAY_CATEGORIES = [
  { key: 'lixo', label: '♻️ Lixo & Reciclagem', color: COLOR.MUTED },
  { key: 'madeiras', label: '🪵 Madeiras', color: COLOR.INFO },
  { key: 'materias_primas', label: '🔧 Matérias-Primas', color: COLOR.INFO },
  { key: 'minerios', label: '⛏️ Minérios', color: COLOR.INFO },
  { key: 'corpos', label: '🔩 Corpos de Arma', color: COLOR.WARNING_SOFT },
  { key: 'prints', label: '📜 Prints', color: COLOR.WARNING_SOFT },
  { key: 'armas_orange', label: '🔫 Armas Orange', color: COLOR.GOLD },
  { key: 'armas_red', label: '🔴 Armas Red', color: COLOR.DANGER },
  { key: 'armas_extra', label: '⭐ Armas Extra', color: COLOR.PURPLE },
  { key: 'armas_brancas', label: '🔪 Armas Brancas', color: COLOR.DARK },
  { key: 'carregadores', label: '🔋 Carregadores', color: COLOR.TEAL },
  { key: 'coletes', label: '🛡️ Coletes', color: COLOR.TEAL },
  { key: 'acessorios', label: '🎒 Acessórios', color: COLOR.TEAL },
  { key: 'drogas', label: '💊 Drogas', color: COLOR.PURPLE },
  { key: 'dinheiro', label: '💵 Dinheiro', color: COLOR.SUCCESS },
  { key: 'outros', label: '📦 Outros', color: COLOR.MUTED },
];

async function buildPriceEmbedsForMember(memberRole, memberTier) {
  const [items, recipes] = await Promise.all([
    inventoryRepo.getItems(true),
    craftRecipeRepo.getAllRecipesWithIngredients(),
  ]);

  const recipeMap = new Map();
  for (const r of recipes) recipeMap.set(r.item_id, r);

  const buyMult = getRankMultiplier(memberRole, 'buy', memberTier);
  const sellMult = getRankMultiplier(memberRole, 'sell', memberTier);

  // Agrupar items por categoria de exibição
  const byCat = new Map();
  for (const item of items) {
    const dc = classifyDisplayCategory(item);
    if (!byCat.has(dc)) byCat.set(dc, []);
    byCat.get(dc).push(item);
  }

  const embeds = [];

  // ── Embed de legenda ──────────────────────────────────────────────────────
  const legend = applyLogo(
    brandEmbed('MOVEMENT')
      .setColor(COLOR.INFO)
      .setTitle(`${EMOJI.CRAFT} O Teu Preçário`)
      .setDescription(
        `**Como ler:**\n` +
          `\`V\` = **Venda** à Firma (eles compram-te)\n` +
          `\`C\` = **Compra** à Firma (tu compras, sem material)\n` +
          `\`🛠️\` = **Compra c/ Material** (tu entregas ingredientes, pagas menos)\n\n` +
          `_Rank: ${memberRole} | Compra ${fmtPct(buyMult)} | Venda ${fmtPct(sellMult)}_`
      )
  );
  embeds.push(legend);

  for (const catDef of DISPLAY_CATEGORIES) {
    const catItems = byCat.get(catDef.key) || [];
    if (!catItems.length) continue;
    catItems.sort((a, b) => a.name.localeCompare(b.name));

    const embed = applyLogo(brandEmbed('MOVEMENT').setColor(catDef.color).setTitle(catDef.label));

    const lines = catItems.map(item => {
      const base = parseFloat(item.estimated_value) || 0;
      const sellPrice = base * (1 + sellMult);
      const buyPrice = base * (1 + buyMult);
      const recipe = recipeMap.get(item.id);

      let text = `**${item.name}**  `;
      text += `\`V ${fmtPrice(sellPrice)}\`  \`C ${fmtPrice(buyPrice)}\``;

      if (recipe) {
        const materialCost = recipe.ingredients.reduce((sum, ing) => {
          const unit = parseFloat(ing.unit_price) || parseFloat(ing.ingredient_price) || 0;
          return sum + unit * ing.quantity;
        }, 0);
        const buyWithMat = materialCost * (1 + buyMult);
        text += `  \`🛠️ ${fmtPrice(buyWithMat)}\``;
      }
      return text;
    });

    // Discord limita field value a 1024 chars. Agrupar linhas em fields.
    let chunk = [];
    let chunkLen = 0;
    for (const line of lines) {
      const lineLen = line.length + 1;
      if (chunkLen + lineLen > 950) {
        embed.addFields({ name: '\u200b', value: chunk.join('\n'), inline: false });
        chunk = [line];
        chunkLen = lineLen;
      } else {
        chunk.push(line);
        chunkLen += lineLen;
      }
    }
    if (chunk.length) {
      embed.addFields({ name: '\u200b', value: chunk.join('\n'), inline: false });
    }

    embeds.push(embed);
  }

  // ── Embed de Fórmulas de Craft ───────────────────────────────────────────
  const craftEmbed = applyLogo(
    brandEmbed('MOVEMENT')
      .setColor(COLOR.MUTED)
      .setTitle(`${EMOJI.CRAFT} Fórmulas de Craft`)
      .setDescription('Ingredientes necessários para craftar cada item.')
  );

  const byCraftCat = new Map();
  for (const r of recipes) {
    if (!byCraftCat.has(r.category)) byCraftCat.set(r.category, []);
    byCraftCat.get(r.category).push(r);
  }

  const CRAFT_LABELS = {
    craft_weapons: 'Armas',
    craft_carregadores: 'Carregadores',
    craft_prints: 'Prints',
    craft_corpos: 'Corpos de Arma',
  };

  for (const [cat, catRecipes] of byCraftCat) {
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
// Preçário da Chefia — análise de margem de lucro (compacto)
// ══════════════════════════════════════════════════════════════════════════════

const TIERS = ['young_blood', 'o_gunao', 'gangster_fodido'];
const TIER_LABELS = { young_blood: 'YB', o_gunao: 'OG', gangster_fodido: 'GF' };
const TIER_MULT_BUY = {
  young_blood: 0.1,
  o_gunao: 0.07,
  gangster_fodido: 0.03,
};

async function buildPriceEmbedsForChefia() {
  const [items, recipes] = await Promise.all([
    inventoryRepo.getItems(true),
    craftRecipeRepo.getAllRecipesWithIngredients(),
  ]);

  const recipeMap = new Map();
  for (const r of recipes) recipeMap.set(r.item_id, r);

  // Separar: com receita (craft) vs sem receita
  const withRecipe = [];
  const withoutRecipe = [];
  for (const item of items) {
    const recipe = recipeMap.get(item.id);
    if (recipe) withRecipe.push({ item, recipe });
    else withoutRecipe.push(item);
  }

  const embeds = [];

  // ── Embed de legenda ──────────────────────────────────────────────────────
  const legend = applyLogo(
    brandEmbed('MOVEMENT')
      .setColor(COLOR.INFO)
      .setTitle(`${EMOJI.CRAFT} Preçário da Chefia — Margens de Lucro`)
      .setDescription(
        '**Legenda:**\n' +
          '`Custo` = valor total dos materiais de craft\n' +
          '`YB/OG/GF` = preço que o bairrista paga (c/ material) por tier\n' +
          '`Margem` = lucro da firma sobre o custo de produção\n\n' +
          '_Ordenado por margem de lucro (maior primeiro)._'
      )
  );
  embeds.push(legend);

  // ── Itens com receita — ordenados por margem ──────────────────────────────
  if (withRecipe.length) {
    const sorted = withRecipe
      .map(({ item, recipe }) => {
        const materialCost = recipe.ingredients.reduce((sum, ing) => {
          const unit = parseFloat(ing.unit_price) || parseFloat(ing.ingredient_price) || 0;
          return sum + unit * ing.quantity;
        }, 0);
        const base = parseFloat(item.estimated_value) || 0;
        // Usar o preço mais alto (YB) para calcular margem máxima
        const sellPrice = materialCost * (1 + TIER_MULT_BUY.young_blood);
        const profit = sellPrice - materialCost;
        const marginPct = materialCost > 0 ? (profit / materialCost) * 100 : 0;
        return { item, materialCost, base, marginPct };
      })
      .sort((a, b) => b.marginPct - a.marginPct);

    // Agrupar em chunks de ~15 itens por embed para não ultrapassar 1024 chars/field
    const CHUNK_SIZE = 15;
    for (let i = 0; i < sorted.length; i += CHUNK_SIZE) {
      const chunk = sorted.slice(i, i + CHUNK_SIZE);
      const embed = applyLogo(
        brandEmbed('MOVEMENT')
          .setColor(i === 0 ? COLOR.GOLD : COLOR.MUTED)
          .setTitle(i === 0 ? '🔥 Itens Craft — Margens' : '🔥 Itens Craft — Continuação')
      );

      const lines = chunk.map(({ item, materialCost, marginPct }) => {
        const prices = TIERS.map(t => {
          const mult = TIER_MULT_BUY[t];
          return `${TIER_LABELS[t]} ${fmtPrice(materialCost * (1 + mult))}`;
        });
        return `\`${item.name.padEnd(22).slice(0, 22)}\` Custo ${fmtPrice(materialCost).padStart(8)} | ${prices.join(' | ')} | Margem ${marginPct.toFixed(0)}%`;
      });

      embed.addFields({
        name: `\u200b`,
        value: '```\n' + lines.join('\n') + '\n```',
        inline: false,
      });

      embeds.push(embed);
    }
  }

  // ── Itens sem receita — preços por tier ───────────────────────────────────
  if (withoutRecipe.length) {
    const byCat = new Map();
    for (const item of withoutRecipe) {
      const dc = classifyDisplayCategory(item);
      if (!byCat.has(dc)) byCat.set(dc, []);
      byCat.get(dc).push(item);
    }

    for (const catDef of DISPLAY_CATEGORIES) {
      const catItems = byCat.get(catDef.key) || [];
      if (!catItems.length) continue;
      catItems.sort((a, b) => a.name.localeCompare(b.name));

      const lines = catItems.map(item => {
        const base = parseFloat(item.estimated_value) || 0;
        const prices = TIERS.map(t => `${TIER_LABELS[t]} ${fmtPrice(base * (1 + TIER_MULT_BUY[t]))}`);
        return `\`${item.name.padEnd(22).slice(0, 22)}\` Base ${fmtPrice(base).padStart(8)} | ${prices.join(' | ')}`;
      });

      // Agrupar em chunks de ~20 itens por embed
      const CHUNK_SIZE = 20;
      for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
        const chunk = lines.slice(i, i + CHUNK_SIZE);
        const embed = applyLogo(
          brandEmbed('MOVEMENT')
            .setColor(catDef.color)
            .setTitle(`${catDef.label}${i > 0 ? ' (cont.)' : ''}`)
        );
        embed.addFields({
          name: '\u200b',
          value: '```\n' + chunk.join('\n') + '\n```',
          inline: false,
        });
        embeds.push(embed);
      }
    }
  }

  return embeds;
}

// ══════════════════════════════════════════════════════════════════════════════
// Handlers
// ══════════════════════════════════════════════════════════════════════════════

async function handlePrecariosButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const memberRes = await query('SELECT role, tier FROM members WHERE discord_id = $1', [interaction.user.id]);
    const memberRole = memberRes.rows[0]?.role || 'bairrista';
    const memberTier = memberRes.rows[0]?.tier || 'young_blood';

    const embeds = await buildPriceEmbedsForMember(memberRole, memberTier);

    if (!embeds.length) {
      return await interaction.editReply({ content: `${EMOJI.ERRO} Não há preços disponíveis de momento.` });
    }

    // Limitar a 10 embeds e respeitar o limite de 6000 chars total
    const toSend = [];
    let totalLen = 0;
    for (const embed of embeds.slice(0, 10)) {
      const json = embed.toJSON ? embed.toJSON() : embed.data;
      const len = JSON.stringify(json || {}).length;
      if (totalLen + len > 5900) break;
      totalLen += len;
      toSend.push(embed);
    }

    return await interaction.editReply({ embeds: toSend });
  } catch (e) {
    console.error('[PRECARIOS] Erro:', e);
    return await interaction
      .editReply({ content: `${EMOJI.ERRO} Erro ao gerar preçário: ${e.message}` })
      .catch(() => {});
  }
}

async function handlePrecariosChefiaButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const embeds = await buildPriceEmbedsForChefia();

    if (!embeds.length) {
      return await interaction.editReply({ content: `${EMOJI.ERRO} Não há preços disponíveis de momento.` });
    }

    // Limitar a 10 embeds e respeitar o limite de 6000 chars total
    const toSend = [];
    let totalLen = 0;
    for (const embed of embeds.slice(0, 10)) {
      const json = embed.toJSON ? embed.toJSON() : embed.data;
      const len = JSON.stringify(json || {}).length;
      if (totalLen + len > 5900) break;
      totalLen += len;
      toSend.push(embed);
    }

    return await interaction.editReply({ embeds: toSend });
  } catch (e) {
    console.error('[PRECARIOS-CHEFIA] Erro:', e);
    return await interaction
      .editReply({ content: `${EMOJI.ERRO} Erro ao gerar preçário: ${e.message}` })
      .catch(() => {});
  }
}

module.exports = {
  handlePrecariosButton,
  handlePrecariosChefiaButton,
  buildPriceEmbedsForMember,
  buildPriceEmbedsForChefia,
};
