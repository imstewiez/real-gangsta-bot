'use strict';
/**
 * Preçário interativo — preços personalizados por rank/tier do membro.
 */

const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { inventoryRepo } = require('../repositories');
const craftRecipeRepo = require('../repositories/craftRecipe');
const { getRankMultiplier } = require('../orders/orderPricingEngine');
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { safeReply } = require('../shared/interactionHelpers');
const { query } = require('../db');

// ── Nome → categoria de exibição ────────────────────────────────────────────

const ARMAS_ORANGE_NAMES = new Set([
  'SNS Pistol',
  'Pistol XM3',
  'Mini SMG',
  'Micro SMG',
  'Machine Pistol',
  'TEC Pistol',
  'AP Pistol',
  'Compact Rifle',
  'Gusenberg',
]);

const ARMAS_RED_NAMES = new Set(['.50', 'P90', 'PDW', 'Revolver', 'Gadget Pistol', 'Bullpup', 'Carabina Especial']);

const EXCLUDED_NAMES = new Set([
  'Lançador da Âncora',
  'Colete Tático',
  // Carregadores específicos de arma — não vendemos separadamente
  'Micro Carregador',
  'TEC-9 Carregador',
  'TecPistol Carregador',
  'HeavyPistol Carregador',
  'APPistol Carregador',
  'Pistol50 Carregador',
  'AssaultSMG Carregador',
  'AssaultRifle Carregador',
  'PDW Carregador',
  'Bullpup Carregador',
  'CompactRifle Carregador',
  'SpecialCarbine Carregador',
  'Tactical Carregador',
  'BattleRifle Carregador',
  'MilitaryRifle Carregador',
]);

// Apenas estas armas aparecem no preçário de compra
const BUY_WEAPON_NAMES = new Set([
  // Brancas
  'Canivete',
  'Taco de Baseball',
  'Taco de 8Ball',
  // Orange
  'SNS Pistol',
  'Pistol XM3',
  'Mini SMG',
  'Micro SMG',
  'Machine Pistol',
  'TEC Pistol',
  'AP Pistol',
  'Compact Rifle',
  'Gusenberg',
  // Red
  '.50',
  'P90',
  'PDW',
  'Revolver',
  'Gadget Pistol',
  'Bullpup',
  'Carabina Especial',
]);

function classifyDisplayCategory(item) {
  const name = item.name || '';
  const cat = item.category || '';

  if (EXCLUDED_NAMES.has(name)) return null;
  if (name.startsWith('Corpo')) return 'corpos';
  if (name.includes('Print')) return 'prints';

  if (cat === 'armas_brancas') return 'armas_brancas';
  if (cat === 'armas_fogo') {
    if (ARMAS_RED_NAMES.has(name)) return 'armas_red';
    if (ARMAS_ORANGE_NAMES.has(name)) return 'armas_orange';
    return 'armas_extra';
  }

  // Carregadores genéricos
  if (name === 'Carregador Orange') return 'carregadores_orange';
  if (name === 'Carregador Red') return 'carregadores_red';
  if (name === 'Carregador Especial') return 'carregadores_special';

  if (cat === 'municoes') return null;
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
  if (num >= 1_000_000) {
    const v = num / 1_000_000;
    return Number.isInteger(v) ? v.toFixed(0) + 'M' : v.toFixed(1).replace('.', ',') + 'M';
  }
  if (num >= 1_000) {
    const v = num / 1_000;
    return Number.isInteger(v) ? v.toFixed(0) + 'k' : v.toFixed(1).replace('.', ',') + 'k';
  }
  return num.toString();
}

function fmtPct(n) {
  const s = (n * 100).toFixed(0);
  return n >= 0 ? `+${s}%` : `${s}%`;
}

function padName(name, max = 22) {
  const s = String(name);
  return s.length > max ? s.slice(0, max - 1) + '…' : s.padEnd(max);
}

// ── Paginação ───────────────────────────────────────────────────────────────

const MAX_EMBED_CHARS = 5800;
const MAX_EMBEDS_PER_MSG = 10;

function embedJsonLength(embed) {
  const json = embed.toJSON ? embed.toJSON() : embed.data;
  return JSON.stringify(json || {}).length;
}

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
      const clone = e.toJSON ? EmbedBuilder.from(e.toJSON()) : EmbedBuilder.from(e.data);
      return clone;
    });
    const last = pageEmbeds[pageEmbeds.length - 1];
    if (last) last.setFooter({ text: `Página ${pageIndex + 1}/${pages.length}` });
    return { embeds: pageEmbeds, components: pages.length > 1 ? buildComponents() : [] };
  }

  const msg = await interaction.editReply(buildReply());

  if (pages.length <= 1) {
    setTimeout(() => interaction.deleteReply().catch(() => {}), 300_000);
    return msg;
  }

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 300_000,
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
  { key: 'armas_brancas', label: '🔪 Armas Brancas', color: COLOR.DARK },
  { key: 'armas_orange', label: '🟠 Armas Orange', color: COLOR.GOLD },
  { key: 'carregadores_orange', label: '🟠 Carregadores', color: 0xff8c00 },
  { key: 'armas_red', label: '🔴 Armas Red', color: COLOR.DANGER },
  { key: 'carregadores_red', label: '🔴 Carregadores', color: 0xdc143c },
  { key: 'carregadores_special', label: '⭐ Carregadores', color: 0x9370db },
  { key: 'coletes', label: '🛡️ Coletes', color: COLOR.TEAL },
  { key: 'acessorios', label: '🔧 Acessórios', color: COLOR.INFO },
  // Chefia only
  { key: 'lixo', label: '♻️ Lixo & Reciclagem', color: COLOR.MUTED },
  { key: 'madeiras', label: '🪵 Madeiras', color: COLOR.INFO },
  { key: 'materias_primas', label: '🔩 Matérias-Primas', color: COLOR.INFO },
  { key: 'minerios', label: '⛏️ Minérios', color: COLOR.INFO },
  { key: 'corpos', label: '🔫 Corpos de Arma', color: COLOR.WARNING_SOFT },
  { key: 'prints', label: '📜 Prints', color: COLOR.WARNING_SOFT },
  { key: 'drogas', label: '💊 Drogas', color: COLOR.PURPLE },
  { key: 'dinheiro', label: '💵 Dinheiro', color: COLOR.SUCCESS },
  { key: 'outros', label: '📦 Outros', color: COLOR.MUTED },
];

// Categorias disponíveis para compra
const BUY_CATEGORIES = new Set([
  'armas_brancas',
  'armas_orange',
  'armas_red',
  'carregadores_orange',
  'carregadores_red',
  'carregadores_special',
  'coletes',
  'acessorios',
]);

// Ordem explícita dentro de cada categoria de arma
const ORDER_ARMAS_BRANCAS = ['Canivete', 'Taco de Baseball', 'Taco de 8Ball'];
const ORDER_ARMAS_ORANGE = [
  'SNS Pistol',
  'Pistol XM3',
  'Mini SMG',
  'Micro SMG',
  'Machine Pistol',
  'TEC Pistol',
  'AP Pistol',
  'Compact Rifle',
  'Gusenberg',
];
const ORDER_ARMAS_RED = ['.50', 'Gadget Pistol', 'Revolver', 'P90', 'PDW', 'Bullpup', 'Carabina Especial'];

// Ordem para fórmulas de craft (mesma ordem das armas + carregadores)
const CRAFT_ORDER = new Map([
  // Armas Orange
  ['SNS Pistol', 1],
  ['Pistol XM3', 2],
  ['Mini SMG', 3],
  ['Micro SMG', 4],
  ['Machine Pistol', 5],
  ['TEC Pistol', 6],
  ['AP Pistol', 7],
  ['Compact Rifle', 8],
  ['Gusenberg', 9],
  // Armas Red
  ['.50', 10],
  ['Gadget Pistol', 11],
  ['Revolver', 12],
  ['P90', 13],
  ['PDW', 14],
  ['Bullpup', 15],
  ['Carabina Especial', 16],
  // Carregadores
  ['Carregador Orange', 17],
  ['Carregador Red', 18],
  ['Carregador Especial', 19],
]);

function sortByExplicitOrder(items, orderArray) {
  const orderMap = new Map(orderArray.map((name, i) => [name, i]));
  return items.slice().sort((a, b) => {
    const ia = orderMap.get(a.name) ?? Infinity;
    const ib = orderMap.get(b.name) ?? Infinity;
    return ia - ib;
  });
}

// Acessórios permitidos (filtrar duplicados e itens irrelevantes)
const ALLOWED_ACESSORIOS = new Set([
  'Silenciador',
  'Mira',
  'Grip',
  'Lanterna',
  'Muzzle',
  'Barrel',
  'Extensivo',
  'Mag Expandido',
]);

async function buildPriceEmbedsForMember(memberRole, memberTier) {
  const [items, recipes] = await Promise.all([
    inventoryRepo.getItems(true),
    craftRecipeRepo.getAllRecipesWithIngredients(),
  ]);

  const recipeMap = new Map();
  for (const r of recipes) recipeMap.set(r.item_id, r);

  const buyMult = getRankMultiplier(memberRole, 'buy', memberTier);
  const sellMult = getRankMultiplier(memberRole, 'sell', memberTier);

  const byCat = new Map();
  for (const item of items) {
    const dc = classifyDisplayCategory(item);
    if (dc === null) continue;
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
          '💰 **Compra** à Firma (tu compras, sem material)\n\n' +
          `_Rank: ${memberRole} | Compra ${fmtPct(buyMult)} | Venda ${fmtPct(sellMult)}_`
      )
  );
  embeds.push(legend);

  for (const catDef of DISPLAY_CATEGORIES) {
    if (!BUY_CATEGORIES.has(catDef.key)) continue;

    let catItems = byCat.get(catDef.key) || [];
    if (!catItems.length) continue;

    // Filtrar armas: só as explicitamente permitidas
    if (catDef.key.startsWith('armas_')) {
      catItems = catItems.filter(item => BUY_WEAPON_NAMES.has(item.name));
      if (!catItems.length) continue;
    }

    // Ordenação customizada por categoria
    if (catDef.key === 'armas_brancas') {
      catItems = sortByExplicitOrder(catItems, ORDER_ARMAS_BRANCAS);
    } else if (catDef.key === 'armas_orange') {
      catItems = sortByExplicitOrder(catItems, ORDER_ARMAS_ORANGE);
    } else if (catDef.key === 'armas_red') {
      catItems = sortByExplicitOrder(catItems, ORDER_ARMAS_RED);
    } else if (catDef.key === 'acessorios') {
      catItems = catItems.filter(i => ALLOWED_ACESSORIOS.has(i.name));
      if (!catItems.length) continue;
      catItems.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      catItems.sort((a, b) => a.name.localeCompare(b.name));
    }

    const lines = catItems.map(item => {
      const base = parseFloat(item.estimated_value) || 0;
      const sellPrice = base * (1 + sellMult);
      const buyPrice = base * (1 + buyMult);

      const name = padName(item.name, 22);
      const baseStr = fmtPriceCompact(base).padStart(6);
      const sellStr = fmtPriceCompact(sellPrice).padStart(6);
      const buyStr = fmtPriceCompact(buyPrice).padStart(6);

      return `${name}  ${baseStr}  ${sellStr}  ${buyStr}`;
    });

    const header = `${padName('Item', 22)}  ${'Base'.padStart(6)}  ${'Vende'.padStart(6)}  ${'Compra'.padStart(6)}`;
    const sep = '────────────────────────────────────────────────────';
    const prefix = '```\n' + header + '\n' + sep + '\n';
    const suffix = '\n```';

    const chunks = [];
    let current = [];
    let currentLen = prefix.length + suffix.length;
    for (const line of lines) {
      if (currentLen + line.length + 1 > 1000) {
        chunks.push(current);
        current = [line];
        currentLen = prefix.length + suffix.length + line.length + 1;
      } else {
        current.push(line);
        currentLen += line.length + 1;
      }
    }
    if (current.length) chunks.push(current);

    const embed = applyLogo(brandEmbed('MOVEMENT').setColor(catDef.color).setTitle(catDef.label));
    for (const chunk of chunks) {
      embed.addFields({ name: '\u200b', value: prefix + chunk.join('\n') + suffix, inline: false });
    }
    embeds.push(embed);
  }

  // ── Fórmulas de Craft ────────────────────────────────────────────────────
  const buyableItemIds = new Set();
  for (const item of items) {
    const dc = classifyDisplayCategory(item);
    if (!dc || !BUY_CATEGORIES.has(dc)) continue;
    if (dc.startsWith('armas_') && !BUY_WEAPON_NAMES.has(item.name)) continue;
    buyableItemIds.add(item.id);
  }

  const relevantRecipes = recipes.filter(r => buyableItemIds.has(r.item_id));
  if (relevantRecipes.length) {
    const byCraftCat = new Map();
    for (const r of relevantRecipes) {
      const normCat = normalizeCraftCategory(r.category);
      if (!byCraftCat.has(normCat)) byCraftCat.set(normCat, []);
      byCraftCat.get(normCat).push(r);
    }

    const CRAFT_META = {
      craft_weapons: { label: '🔫 Armas', color: COLOR.GOLD, emoji: '🔫' },
      craft_carregadores: { label: '🔋 Carregadores', color: COLOR.TEAL, emoji: '🔋' },
      craft_prints: { label: '📜 Prints', color: COLOR.WARNING_SOFT, emoji: '📜' },
      craft_corpos: { label: '🔩 Corpos de Arma', color: COLOR.INFO, emoji: '🔩' },
    };

    // Embed de cabeçalho das fórmulas
    const craftHeader = applyLogo(
      brandEmbed('MOVEMENT')
        .setColor(COLOR.MUTED)
        .setTitle(`${EMOJI.CRAFT} Fórmulas de Craft`)
        .setDescription('Ingredientes necessários para craftar cada item.')
    );
    embeds.push(craftHeader);

    for (const [cat, catRecipes] of byCraftCat) {
      const meta = CRAFT_META[cat] || { label: cat, color: COLOR.MUTED, emoji: '🛠️' };
      const catEmbed = applyLogo(brandEmbed('MOVEMENT').setColor(meta.color).setTitle(meta.label));

      const lines = [];
      for (const r of catRecipes.sort((a, b) => {
        const oa = CRAFT_ORDER.get(a.item_name) ?? Infinity;
        const ob = CRAFT_ORDER.get(b.item_name) ?? Infinity;
        return oa - ob;
      })) {
        const recipe = recipeMap.get(r.item_id);
        if (!recipe) continue;
        const ingStr = recipe.ingredients.map(ing => `  • ${ing.quantity}× ${ing.ingredient_name}`).join('\n');
        lines.push(`**${meta.emoji} ${recipe.item_name}**\n${ingStr}`);
      }

      if (lines.length) {
        // Chunking para não ultrapassar 1024 chars por field
        let current = [];
        let currentLen = 0;
        const chunks = [];
        for (const line of lines) {
          if (currentLen + line.length + 1 > 1000) {
            chunks.push(current);
            current = [line];
            currentLen = line.length + 1;
          } else {
            current.push(line);
            currentLen += line.length + 1;
          }
        }
        if (current.length) chunks.push(current);

        for (const chunk of chunks) {
          catEmbed.addFields({
            name: '\u200b',
            value: chunk.join('\n\n').slice(0, 1024),
            inline: false,
          });
        }
        embeds.push(catEmbed);
      }
    }
  }

  return embeds;
}

function normalizeCraftCategory(cat) {
  if (!cat) return 'outros';
  if (cat.startsWith('craft_')) return cat;
  // Normalizar categorias legacy (ex: armas_fogo → craft_weapons)
  const map = {
    armas_fogo: 'craft_weapons',
    armas_brancas: 'craft_weapons',
    municoes: 'craft_carregadores',
    componentes: 'craft_corpos',
  };
  return map[cat] || `craft_${cat}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Preçário da Chefia
// ══════════════════════════════════════════════════════════════════════════════

const TIERS = ['young_blood', 'o_gunao', 'gangster_fodido'];
const TIER_LABELS = { young_blood: 'YB', o_gunao: 'OG', gangster_fodido: 'GF' };
const TIER_MULT_BUY = { young_blood: 0.1, o_gunao: 0.07, gangster_fodido: 0.03 };

async function buildPriceEmbedsForChefia() {
  const [items, recipes] = await Promise.all([
    inventoryRepo.getItems(true),
    craftRecipeRepo.getAllRecipesWithIngredients(),
  ]);

  const recipeMap = new Map();
  for (const r of recipes) recipeMap.set(r.item_id, r);

  const withRecipe = [];
  const withoutRecipe = [];
  for (const item of items) {
    const dc = classifyDisplayCategory(item);
    if (dc === null) continue;
    const recipe = recipeMap.get(item.id);
    if (recipe) withRecipe.push({ item, recipe });
    else withoutRecipe.push(item);
  }

  const embeds = [];

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

  if (withRecipe.length) {
    const sorted = withRecipe
      .map(({ item, recipe }) => {
        const materialCost = recipe.ingredients.reduce((sum, ing) => {
          const unit = parseFloat(ing.unit_price) || parseFloat(ing.ingredient_price) || 0;
          return sum + unit * ing.quantity;
        }, 0);
        const base = parseFloat(item.estimated_value) || 0;
        const sellPrice = materialCost * (1 + TIER_MULT_BUY.young_blood);
        const profit = sellPrice - materialCost;
        const marginPct = materialCost > 0 ? (profit / materialCost) * 100 : 0;
        return { item, materialCost, base, marginPct };
      })
      .sort((a, b) => b.marginPct - a.marginPct);

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

      embed.addFields({ name: `\u200b`, value: '```\n' + lines.join('\n') + '\n```', inline: false });
      embeds.push(embed);
    }
  }

  if (withoutRecipe.length) {
    const byCat = new Map();
    for (const item of withoutRecipe) {
      const dc = classifyDisplayCategory(item);
      if (dc === null) continue;
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

      const CHUNK_SIZE = 20;
      for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
        const chunk = lines.slice(i, i + CHUNK_SIZE);
        const embed = applyLogo(
          brandEmbed('MOVEMENT')
            .setColor(catDef.color)
            .setTitle(`${catDef.label}${i > 0 ? ' (cont.)' : ''}`)
        );
        embed.addFields({ name: '\u200b', value: '```\n' + chunk.join('\n') + '\n```', inline: false });
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
