'use strict';
/**
 * orderCartEmbedBuilder — evita overflow da descrição do embed do carrinho.
 *
 * Problema original: buildCartEmbed() punha tudo em setDescription(lines.join('\n'))
 * que facilmente excedia 4096 chars com carrinhos grandes.
 *
 * Solução: usar fields do Discord (limite 25 fields × 1024 chars cada) + múltiplos embeds.
 */

const { brandEmbed, COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { formatMoney } = require('../shared/formatMoney');
const { totals } = require('./orderCart');

// ── Agrupamento heurístico de materiais ────────────────────────────────────

const MATERIAL_TYPE_MAP = {
  'Barra de Ouro': 'metais',
  'Barra de Cobre': 'metais',
  'Print Laranja': 'prints',
  'Print Azul': 'prints',
  'Print Vermelha': 'prints',
  'Print Amarela': 'prints',
  'Tábua de Ébano': 'madeira',
  'Molde de Arma': 'moldes',
  'Dinheiro Sujo': 'dinheiro',
};

function _detectMaterialType(name) {
  if (MATERIAL_TYPE_MAP[name]) return MATERIAL_TYPE_MAP[name];
  if (name.startsWith('Corpo ')) return 'corpos';
  if (name.startsWith('Carregador')) return 'carregadores';
  return 'outros';
}

const TYPE_EMOJI = {
  metais: '🪙',
  prints: '📄',
  madeira: '🪵',
  moldes: '🧱',
  corpos: '🔩',
  carregadores: '🔋',
  dinheiro: '💵',
  outros: '📦',
};

const TYPE_LABEL = {
  metais: 'Metais',
  prints: 'Prints',
  madeira: 'Madeira',
  moldes: 'Moldes',
  corpos: 'Corpos',
  carregadores: 'Carregadores',
  dinheiro: 'Dinheiro',
  outros: 'Outros',
};

// ── Embed builders ─────────────────────────────────────────────────────────

/**
 * Constrói embed com uma field por linha do carrinho.
 * Nome da field = item; valor = quantidade + preço total.
 */
function buildCartLinesEmbed(cart, { memberName } = {}) {
  const { totalQty, totalPrice } = totals(cart);
  const embed = brandEmbed('HOUSE').setTitle(`${EMOJI.ENCOMENDA} Carrinho de Encomendas`).setColor(COLOR.PRIMARY);

  if (!cart.lines.length) {
    embed.setDescription('O carrinho está vazio.\n\nClica em **➕ Adicionar** para começar.');
    return embed;
  }

  // Descrição reservada para o header; fields para as linhas
  embed.setDescription(`**${cart.lines.length} artigo(s) · ${totalQty} unidades**`);

  for (let i = 0; i < cart.lines.length; i++) {
    const l = cart.lines[i];
    const name = `${i + 1}. ${l.itemName}`.slice(0, 256);
    const value = `**${l.quantity}×** · **${formatMoney(l.finalPrice)}**`.slice(0, 1024);
    embed.addFields({ name, value, inline: false });
  }

  // Footer com total global
  const footerText = `Total: ${formatMoney(totalPrice)}${memberName ? ` — ${memberName}` : ''}`;
  embed.setFooter({ text: footerText });

  return embed;
}

/**
 * Agrupa todos os materiais do carrinho por tipo e devolve embed.
 */
function buildMaterialsSummaryEmbed(cart) {
  const { materials } = totals(cart);
  const embed = brandEmbed('HOUSE').setTitle(`${EMOJI.CRAFT} Resumo de Materiais`).setColor(COLOR.INFO);

  if (!materials.length) {
    embed.setDescription('_Sem materiais associados._');
    return embed;
  }

  const byType = {};
  for (const m of materials) {
    const t = _detectMaterialType(m.name);
    if (!byType[t]) byType[t] = [];
    byType[t].push(m);
  }

  for (const [type, list] of Object.entries(byType)) {
    const lines = list.map(m => `  • ${m.name}: **${m.qty}×**`);
    const value = lines.join('\n').slice(0, 1024);
    embed.addFields({
      name: `${TYPE_EMOJI[type] || '📦'} ${TYPE_LABEL[type] || type}`,
      value,
      inline: false,
    });
  }

  return embed;
}

/**
 * Mostra o split entre dinheiro e materiais.
 */
function buildCostBreakdownEmbed(cart, { memberRole, memberTier } = {}) {
  const { totalQty, totalPrice, materials } = totals(cart);
  const embed = brandEmbed('HOUSE').setTitle(`${EMOJI.DINHEIRO} Desdobramento de Custos`).setColor(COLOR.GOLD);

  if (!cart.lines.length) {
    embed.setDescription('_Carrinho vazio._');
    return embed;
  }

  const moneyFields = [];
  for (const l of cart.lines) {
    const unit = l.quantity > 1 ? formatMoney(l.finalPrice / l.quantity) : formatMoney(l.unitPrice || 0);
    moneyFields.push(`• ${l.itemName} · ${l.quantity}× @ ${unit} = **${formatMoney(l.finalPrice)}**`);
  }

  embed.addFields({
    name: '💵 Valor em Dinheiro',
    value: moneyFields.join('\n').slice(0, 1024),
    inline: false,
  });

  if (materials.length) {
    const matLines = materials.map(m => `• ${m.name}: **${m.qty}×**`);
    embed.addFields({
      name: `${EMOJI.MATERIAL} Materiais a Entregar`,
      value: matLines.join('\n').slice(0, 1024),
      inline: false,
    });
  }

  embed.addFields(
    { name: 'Total Unidades', value: `**${totalQty}**`, inline: true },
    { name: 'Total a Pagar', value: `**${formatMoney(totalPrice)}**`, inline: true }
  );

  if (memberRole) {
    embed.addFields({ name: 'Rank', value: memberRole, inline: true });
  }

  return embed;
}

/**
 * Combina os 3 embeds do carrinho num payload pronto a enviar.
 * Mantém os componentes existentes do orderCart.
 */
function buildCartMessagePayload(cart, opts = {}) {
  const { memberName, includeMaterials = true, includeBreakdown = false } = opts;
  const embeds = [buildCartLinesEmbed(cart, { memberName })];

  if (includeMaterials) {
    const mats = buildMaterialsSummaryEmbed(cart);
    if (mats.data.fields?.length) embeds.push(mats);
  }

  if (includeBreakdown) {
    embeds.push(buildCostBreakdownEmbed(cart, opts));
  }

  return { embeds };
}

module.exports = {
  buildCartLinesEmbed,
  buildMaterialsSummaryEmbed,
  buildCostBreakdownEmbed,
  buildCartMessagePayload,
};
