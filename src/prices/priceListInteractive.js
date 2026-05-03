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

const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
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

function fmtPriceCompact(n) {
  const num = Number(n) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function fmtPct(n) {
  const s = (n * 100).toFixed(0);
  return n >= 0 ? `+${s}%` : `${s}%`;
}

function padName(name, max = 18) {
  const s = String(name);
  return s.length > max ? s.slice(0, max - 1) + '…' : s.padEnd(max);
}

// ── Paginação ───────────────────────────────────────────────────────────────

const MAX_EMBED_CHARS = 5800; // margem para JSON overhead
const MAX_EMBEDS_PER_MSG = 10;

function embedJsonLength(embed) {
  const json = embed.toJSON ? embed.toJSON() : embed.data;
  return JSON.stringify(json || {}).length;
}

/**
 * Divide uma lista de embeds em páginas que respeitem os limites do Discord.
 * Cada página é um array de embeds.
 */
function chunkEmbedsIntoPages(embeds) {
  const pages = [];
  let currentPage = [];
  let currentLen = 0;

  for (const embed of embeds) {
    const len = embedJsonLength(embed);
    if (currentPage.length >= MAX_EMBEDS_PER_MSG || currentLen + len > MAX_EMBED_CHARS) {
      if (currentPage.length) pages.push(currentPage);
      currentPage = [embed];
      currentLen = len;
    } else {
      currentPage.push(embed);
      currentLen += len;
    }
  }
  if (currentPage.length) pages.push(currentPage);
  return pages;
}

async function sendPaginatedEmbeds(interaction, embeds, titlePrefix) {
  const pages = chunkEmbedsIntoPages(embeds);
  if (!pages.length) {
    return interaction.editReply({ content: `${EMOJI.ERRO} Não há preços disponíveis de momento.` });
  }

  let pageIndex = 0;

  function buildComponents() {
    const prev = new ButtonBuilder()
      .setCustomId('precarios_prev')
      .setLabel('◀ Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === 0);
    const next = new ButtonBuilder()
      .setCustomId('precarios_next')
      .setLabel('Próxima ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === pages.length - 1);
    const close = new ButtonBuilder().setCustomId('precarios_close').setLabel('❌ Fechar').setStyle(ButtonStyle.Danger);
    return [new ActionRowBuilder().addComponents(prev, next, close)];
  }

  function buildReply() {
    const pageEmbeds = pages[pageIndex].map(e => {
      // Clonar o embed para não mutar o original
      const clone = e.toJSON ? EmbedBuilder.from(e.toJSON()) : EmbedBuilder.from(e.data);
      return clone;
    });
    // Adicionar footer ao último embed da página
    const last = pageEmbeds[pageEmbeds.length - 1];
    if (last) {
      last.setFooter({ text: `Página ${pageIndex + 1}/${pages.length}` });
    }
    return { embeds: pageEmbeds, components: pages.length > 1 ? buildComponents() : [] };
  }

  const msg = await interaction.editReply(buildReply());

  // Se só há uma página, não precisamos de collector
  if (pages.length <= 1) {
    // Apagar após 5 minutos mesmo sem paginação
    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 300_000);
    return msg;
  }

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 300_000, // 5 minutos
  });

  collector.on('collect', async i => {
    try {
      if (i.customId === 'precarios_prev' && pageIndex > 0) pageIndex--;
      else if (i.customId === 'precarios_next' && pageIndex < pages.length - 1) pageIndex++;
      else if (i.customId === 'precarios_close') {
        collector.stop();
        return i.update({ content: 'Preçário fechado.', embeds: [], components: [] });
      }
      await i.update(buildReply());
    } catch (err) {
      console.error('[PRECARIOS] Erro na paginação:', err);
      await i
        .reply({ content: `${EMOJI.ERRO} Erro ao mudar de página.`, flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  });

  collector.on('end', async (_collected, reason) => {
    try {
      if (reason === 'time') {
        await interaction.editReply({ content: '⏱️ Preçário fechado (timeout 5min).', embeds: [], components: [] });
      } else {
        await interaction.editReply({ components: [] });
      }
    } catch {
      /* mensagem pode já ter sido apagada */
    }
  });

  return msg;
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
        '**Como ler:**\n' +
          '💵 **Vende** à Firma (eles compram-te)\n' +
          '💰 **Compra** à Firma (tu compras, sem material)\n' +
          '🛠️ **Compra c/ Material** (entregas ingredientes, pagas menos)\n\n' +
          `_Rank: ${memberRole} | Compra ${fmtPct(buyMult)} | Venda ${fmtPct(sellMult)}_`
      )
  );
  embeds.push(legend);

  for (const catDef of DISPLAY_CATEGORIES) {
    const catItems = byCat.get(catDef.key) || [];
    if (!catItems.length) continue;
    catItems.sort((a, b) => a.name.localeCompare(b.name));

    const lines = catItems.map(item => {
      const base = parseFloat(item.estimated_value) || 0;
      const sellPrice = base * (1 + sellMult);
      const buyPrice = base * (1 + buyMult);
      const recipe = recipeMap.get(item.id);

      const name = padName(item.name, 18);
      const baseStr = fmtPriceCompact(base).padStart(6);
      const sellStr = fmtPriceCompact(sellPrice).padStart(6);
      const buyStr = fmtPriceCompact(buyPrice).padStart(6);

      if (recipe) {
        const materialCost = recipe.ingredients.reduce((sum, ing) => {
          const unit = parseFloat(ing.unit_price) || parseFloat(ing.ingredient_price) || 0;
          return sum + unit * ing.quantity;
        }, 0);
        const buyWithMat = materialCost * (1 + buyMult);
        const matStr = fmtPriceCompact(buyWithMat).padStart(6);
        return `${name}  ${baseStr}  ${sellStr}  ${buyStr}  ${matStr}`;
      }
      return `${name}  ${baseStr}  ${sellStr}  ${buyStr}       —`;
    });

    const header = `${padName('Item', 18)}   Base  Vende Compra  c/Mat`;
    const sep = '─────────────────────────────────────────────';
    const table = '```\n' + header + '\n' + sep + '\n' + lines.join('\n') + '\n```';

    const embed = applyLogo(brandEmbed('MOVEMENT').setColor(catDef.color).setTitle(catDef.label));
    embed.addFields({ name: '\u200b', value: table, inline: false });

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
          '_Ordenado por margem de lucro (maior primeiro)._' +
          '\n\n*Usa os botões ◀ ▶ para navegar entre páginas.*'
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
    return sendPaginatedEmbeds(interaction, embeds, 'Preçário');
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
    return sendPaginatedEmbeds(interaction, embeds, 'Preçário Chefia');
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
