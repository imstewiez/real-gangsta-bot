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

  // Agrupar items por categoria de exibição
  const byCat = new Map();
  for (const item of items) {
    const dc = classifyDisplayCategory(item);
    if (!byCat.has(dc)) byCat.set(dc, []);
    byCat.get(dc).push(item);
  }

  const embeds = [];

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

      let text = `**${item.name}**\n`;
      text += `\`Base ${fmtPrice(base)}\`  \`V ${fmtPrice(sellPrice)}\`  \`C ${fmtPrice(buyPrice)}\``;

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
        embed.addFields({ name: '\u200b', value: chunk.join('\n\n'), inline: false });
        chunk = [line];
        chunkLen = lineLen;
      } else {
        chunk.push(line);
        chunkLen += lineLen;
      }
    }
    if (chunk.length) {
      embed.addFields({ name: '\u200b', value: chunk.join('\n\n'), inline: false });
    }

    embed.setFooter({
      text: `V=Venda à Firma | C=Compra à Firma | 🛠️=Compra c/ material | Rank: ${memberRole} (Compra +${(buyMult * 100).toFixed(0)}%, Venda +${(sellMult * 100).toFixed(0)}%)`,
    });
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
// Handler
// ══════════════════════════════════════════════════════════════════════════════

async function handlePrecariosButton(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
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
