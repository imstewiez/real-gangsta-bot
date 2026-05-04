'use strict';
/**
 * Preçário interativo — preços personalizados por rank/tier do membro.
 */

const { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { inventoryRepo } = require('../repositories');
const craftRecipeRepo = require('../repositories/craftRecipe');
const { getRankMultiplier, RANK_MULTIPLIERS } = require('../orders/orderPricingEngine');
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { safeReply } = require('../shared/interactionHelpers');
const { query } = require('../db');

// ── Abreviações de materiais para caber em linha única ─────────────────────
const MAT_ABBREV = {
  Aço: 'Aç',
  Peças: 'Pç',
  'Peças Estragadas': 'Pç Estrg',
  'Tábua Ébano': 'Ébano',
  'Tábua Carvalho': 'Carvalho',
  'Tábua Cerejeira': 'Cerejeira',
  'Tábua Pinho': 'Pinho',
  'Barra de Ouro': 'Ouro',
  'Barra de Prata': 'Prata',
  'Corpo Pistol XM3': 'Corpo XM3',
  'Corpo UZI': 'Corpo UZI',
  'Corpo TEC-9': 'Corpo TEC9',
  'Corpo TEC Pistol': 'Corpo TEC',
  'Corpo AP Pistol': 'Corpo AP',
  'Corpo Mini SMG': 'Corpo Mini',
  'Corpo Micro SMG': 'Corpo Micro',
  'Corpo Machine Pistol': 'Corpo Machine',
  'Corpo Compact Rifle': 'Corpo Compact',
  'Corpo Gusenberg': 'Corpo Gusenberg',
  'Corpo .50': 'Corpo .50',
  'Corpo P90': 'Corpo P90',
  'Corpo PDW': 'Corpo PDW',
  'Corpo Revolver': 'Corpo Revolver',
  'Corpo Gadget Pistol': 'Corpo Gadget',
  'Corpo Bullpup': 'Corpo Bullpup',
  'Corpo Carabina Especial': 'Corpo Carabina',
  'Print Laranja': 'Print Lrj',
  'Print Vermelha': 'Print Vrm',
  'Print Azul': 'Print Azl',
  'Print Amarela': 'Print Amr',
  'Molde de Arma': 'Molde',
  Pólvora: 'Pólv',
  'Plástico Reciclado': 'Plástico',
  'Plástico Velho': 'Plástico Vlh',
  'Lixo Eletrónico': 'Lixo Eletr',
  'Telemóvel Estragado': 'Telemóvel',
  'Rádio Estragado': 'Rádio',
  Sucata: 'Sucata',
  Borracha: 'Borracha',
  Papel: 'Papel',
  Cobre: 'Cobre',
  Carvão: 'Carvão',
  Ferro: 'Ferro',
};

function abbrevMat(name) {
  return MAT_ABBREV[name] || name;
}

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
  'Colete Leve',
  'Colete Pesado',
  // Carregadores específicos de arma
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

// Itens que o bairrista pode vender/entregar à firma
const SELLABLE_ITEM_NAMES = new Set([
  'Lixo Eletrónico',
  'Sucata',
  'Peças',
  'Peças Estragadas',
  'Plástico Reciclado',
  'Plástico Velho',
  'Telemóvel Estragado',
  'Rádio Estragado',
  'Tábua Cerejeira',
  'Tábua Pinho',
  'Tábua Ébano',
  'Tábua Carvalho',
  'Borracha',
  'Papel',
  'Molde de Arma',
  'Cobre',
  'Carvão',
  'Pólvora',
  'Ferro',
  'Corpo Pistol XM3',
  'Corpo UZI',
  'Corpo TEC-9',
  'Corpo TEC Pistol',
  'Corpo AP Pistol',
  'Print Laranja',
  'Print Azul',
  'Print Vermelha',
  'Print Amarela',
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
  return Math.round(Number(n) || 0).toLocaleString('pt-PT') + '€';
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

function padName(name, max = 18) {
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

const BUY_CATEGORIES = [
  { key: 'armas_brancas', label: '🔪 Armas Brancas', color: COLOR.DARK, cols: 'price' },
  { key: 'armas_orange', label: '🟠 Armas Orange', color: COLOR.GOLD, cols: 'craft' },
  { key: 'armas_red', label: '🔴 Armas Red', color: COLOR.DANGER, cols: 'craft' },
  { key: 'carregadores', label: '🔋 Carregadores', color: COLOR.TEAL, cols: 'craft' },
  { key: 'coletes', label: '🛡️ Coletes', color: COLOR.INFO, cols: 'colete' },
  { key: 'acessorios', label: '🔧 Acessórios', color: COLOR.INFO, cols: 'price' },
];

const SELL_CATEGORIES = [
  { key: 'lixo', label: '♻️ Lixo & Reciclagem', color: COLOR.MUTED },
  { key: 'madeiras', label: '🪵 Madeiras', color: COLOR.INFO },
  { key: 'materias_primas', label: '🔩 Matérias-Primas', color: COLOR.INFO },
  { key: 'minerios', label: '⛏️ Minérios', color: COLOR.INFO },
  { key: 'corpos', label: '🔫 Corpos de Arma', color: COLOR.WARNING_SOFT },
  { key: 'prints', label: '📜 Prints', color: COLOR.WARNING_SOFT },
];

// Ordem explícita
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
const ORDER_CARREGADORES = ['Carregador Orange', 'Carregador Red', 'Carregador Especial'];

// Ordem para fórmulas de craft
const CRAFT_ORDER = new Map([
  ['SNS Pistol', 1],
  ['Pistol XM3', 2],
  ['Mini SMG', 3],
  ['Micro SMG', 4],
  ['Machine Pistol', 5],
  ['TEC Pistol', 6],
  ['AP Pistol', 7],
  ['Compact Rifle', 8],
  ['Gusenberg', 9],
  ['.50', 10],
  ['Gadget Pistol', 11],
  ['Revolver', 12],
  ['P90', 13],
  ['PDW', 14],
  ['Bullpup', 15],
  ['Carabina Especial', 16],
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

// ── Helpers de tabela ───────────────────────────────────────────────────────

function buildTable(prefix, suffix, lines, maxLen = 1000) {
  const chunks = [];
  let current = [];
  let currentLen = prefix.length + suffix.length;
  for (const line of lines) {
    if (currentLen + line.length + 1 > maxLen) {
      chunks.push(current);
      current = [line];
      currentLen = prefix.length + suffix.length + line.length + 1;
    } else {
      current.push(line);
      currentLen += line.length + 1;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function buildPriceEmbedsForMember(memberRole, memberTier) {
  const [items, recipes] = await Promise.all([
    inventoryRepo.getItems(true),
    craftRecipeRepo.getAllRecipesWithIngredients(),
  ]);

  const recipeMap = new Map();
  for (const r of recipes) recipeMap.set(r.item_id, r);

  const buyMult = getRankMultiplier(memberRole, 'buy', memberTier);
  const sellMult = getRankMultiplier(memberRole, 'sell', memberTier);

  // Agrupar todos os items por categoria
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
          '💰 **Preço** — dinheiro sujo a pagar (já com markup do teu tier)\n' +
          '📦 **Materiais** — entregas fisicamente na firma (obrigatórios)\n\n' +
          `_Rank: ${memberRole} | Compra ${fmtPct(buyMult)}_`
      )
  );
  embeds.push(legend);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECÇÃO COMPRA (o que a firma VENDE → bairrista COMPRA)
  // ═══════════════════════════════════════════════════════════════════════════

  for (const catDef of BUY_CATEGORIES) {
    let catItems;

    if (catDef.key === 'carregadores') {
      // Agrupar os 3 tipos de carregadores numa só secção
      const orange = byCat.get('carregadores_orange') || [];
      const red = byCat.get('carregadores_red') || [];
      const special = byCat.get('carregadores_special') || [];
      catItems = [...orange, ...red, ...special];
      catItems = sortByExplicitOrder(catItems, ORDER_CARREGADORES);
    } else {
      catItems = byCat.get(catDef.key) || [];
    }

    if (!catItems.length) continue;

    // Filtrar armas
    if (catDef.key.startsWith('armas_')) {
      catItems = catItems.filter(item => BUY_WEAPON_NAMES.has(item.name));
      if (!catItems.length) continue;
      if (catDef.key === 'armas_brancas') catItems = sortByExplicitOrder(catItems, ORDER_ARMAS_BRANCAS);
      else if (catDef.key === 'armas_orange') catItems = sortByExplicitOrder(catItems, ORDER_ARMAS_ORANGE);
      else if (catDef.key === 'armas_red') catItems = sortByExplicitOrder(catItems, ORDER_ARMAS_RED);
    }

    // Filtrar acessórios
    if (catDef.key === 'acessorios') {
      catItems = catItems.filter(i => ALLOWED_ACESSORIOS.has(i.name));
      if (!catItems.length) continue;
      catItems.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Filtrar coletes (só Colete Padrão)
    if (catDef.key === 'coletes') {
      catItems = catItems.filter(i => i.name === 'Colete Padrão');
      if (!catItems.length) continue;
    }

    // ── Construir linhas da tabela conforme o tipo de colunas ───────────────
    const lines = catItems.map(item => {
      const name = padName(item.name, 18);

      if (catDef.cols === 'craft') {
        const base = parseFloat(item.estimated_value) || 0;
        const recipe = recipeMap.get(item.id);
        const price = base * (1 + buyMult);
        const mats = recipe
          ? recipe.ingredients.map(ing => `${ing.quantity}× ${abbrevMat(ing.ingredient_name)}`).join(', ')
          : '';
        return `${name}  ${fmtPriceCompact(price).padStart(6)}  ${mats}`;
      }

      if (catDef.cols === 'colete') {
        const limpo = 1600;
        const sujo = 1800;
        return `${name}  ${fmtPriceCompact(limpo).padStart(6)}  ${fmtPriceCompact(sujo).padStart(6)}`;
      }

      // cols === 'price'
      const base = parseFloat(item.estimated_value) || 0;
      const price = base * (1 + buyMult);
      return `${name}  ${fmtPriceCompact(price).padStart(6)}`;
    });

    // ── Header conforme tipo de colunas ─────────────────────────────────────
    let header, sep;
    if (catDef.cols === 'craft') {
      header = `${padName('Item', 18)}  ${'Preço'.padStart(6)}  Materiais`;
      sep = '─────────────────────────────────────────────────────';
    } else if (catDef.cols === 'colete') {
      header = `${padName('Item', 18)}  ${'Limpo'.padStart(6)}  ${'Sujo'.padStart(6)}`;
      sep = '──────────────────────────────────────────';
    } else {
      header = `${padName('Item', 18)}  ${'Preço'.padStart(6)}`;
      sep = '──────────────────────────────────';
    }

    const prefix = '```\n' + header + '\n' + sep + '\n';
    const suffix = '\n```';
    const chunks = buildTable(prefix, suffix, lines);

    for (const chunk of chunks) {
      const embed = applyLogo(brandEmbed('MOVEMENT').setColor(catDef.color).setTitle(catDef.label));
      embed.setDescription(prefix + chunk.join('\n') + suffix);
      embeds.push(embed);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECÇÃO VENDA (o que a firma COMPRA → bairrista VENDE)
  // ═══════════════════════════════════════════════════════════════════════════

  const sellItems = items.filter(item => SELLABLE_ITEM_NAMES.has(item.name));
  if (sellItems.length) {
    const sellByCat = new Map();
    for (const item of sellItems) {
      const dc = classifyDisplayCategory(item);
      if (!dc) continue;
      if (!sellByCat.has(dc)) sellByCat.set(dc, []);
      sellByCat.get(dc).push(item);
    }

    // Embed separador
    const sellHeader = applyLogo(
      brandEmbed('MOVEMENT')
        .setColor(COLOR.SUCCESS)
        .setTitle('💵 Preços de Venda')
        .setDescription('Preços que a **Firma paga** por cada material que entregas.')
    );
    embeds.push(sellHeader);

    for (const catDef of SELL_CATEGORIES) {
      const catItems = sellByCat.get(catDef.key) || [];
      if (!catItems.length) continue;
      catItems.sort((a, b) => a.name.localeCompare(b.name));

      const lines = catItems.map(item => {
        const base = parseFloat(item.estimated_value) || 0;
        const price = base * (1 + sellMult);
        const name = padName(item.name, 22);
        return `${name}  ${fmtPriceCompact(price).padStart(6)}`;
      });

      const header = `${padName('Item', 22)}  ${'Preço'.padStart(6)}`;
      const sep = '──────────────────────────────────';
      const prefix = '```\n' + header + '\n' + sep + '\n';
      const suffix = '\n```';
      const chunks = buildTable(prefix, suffix, lines);

      for (const chunk of chunks) {
        const embed = applyLogo(brandEmbed('MOVEMENT').setColor(catDef.color).setTitle(catDef.label));
        embed.setDescription(prefix + chunk.join('\n') + suffix);
        embeds.push(embed);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FÓRMULAS DE CRAFT
  // ═══════════════════════════════════════════════════════════════════════════

  const buyableItemIds = new Set();
  for (const item of items) {
    const dc = classifyDisplayCategory(item);
    if (
      !dc ||
      ![
        'armas_brancas',
        'armas_orange',
        'armas_red',
        'carregadores_orange',
        'carregadores_red',
        'carregadores_special',
        'coletes',
        'acessorios',
      ].includes(dc)
    )
      continue;
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
        const sellPrice = base * (1 + RANK_MULTIPLIERS.buy.young_blood);
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

      const lines = chunk.map(({ item, materialCost, base, marginPct }) => {
        const prices = TIERS.map(t => {
          const mult = RANK_MULTIPLIERS.buy[t];
          return `${TIER_LABELS[t]} ${fmtPrice(base * (1 + mult))}`;
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

    for (const catDef of BUY_CATEGORIES) {
      const catItems = byCat.get(catDef.key) || [];
      if (!catItems.length) continue;
      catItems.sort((a, b) => a.name.localeCompare(b.name));

      const lines = catItems.map(item => {
        const base = parseFloat(item.estimated_value) || 0;
        const prices = TIERS.map(t => `${TIER_LABELS[t]} ${fmtPrice(base * (1 + RANK_MULTIPLIERS.buy[t]))}`);
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
