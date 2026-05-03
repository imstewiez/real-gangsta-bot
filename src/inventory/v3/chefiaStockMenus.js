'use strict';
/**
 * Builders de menus, modais e embeds para o Stock v3 no painel da chefia.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { getCatalog, getItemName } = require('./stockCatalog');
const {
  getAllBalances,
  getRecentMovements,
  getWeeklyReport,
  getMonthlyReport,
  getDailyAverage,
} = require('./stockManager');
const { getAllPricing } = require('./stockPricing');
const { applyLogo, brandEmbed, COLOR } = require('../../shared/embedBuilders');
const { EMOJI } = require('../../content');

function buildStockV3MainEmbed(balancesMap, pricingRows) {
  const embed = applyLogo(brandEmbed('STOCK V3').setColor(COLOR.INFO));
  embed.setTitle(`${EMOJI.STOCK} Stock v3 — Estado Actual`);
  embed.setDescription('Catálogo de 10 artigos controlado pela chefia.');

  const pricingMap = new Map(pricingRows.map(p => [p.item_key, Number(p.unit_cost)]));

  for (const item of getCatalog()) {
    const bal = balancesMap.get(item.key) || { balance: 0 };
    const unitCost = pricingMap.get(item.key) || 0;
    const totalValue = unitCost * bal.balance;
    const valueStr = totalValue > 0 ? ` · ${Math.round(totalValue).toLocaleString('pt-PT')}€` : '';
    embed.addFields({
      name: `${item.name}`,
      value: `Qtd: **${bal.balance}**${valueStr}`,
      inline: true,
    });
  }
  return embed;
}

function buildStockV3MainButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('stockv3::entrada').setLabel('⬆️ Entrada').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('stockv3::retirada').setLabel('⬇️ Retirada').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('stockv3::relatorio').setLabel('📊 Relatório').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('stockv3::precos').setLabel('⚙️ Preços de Custo').setStyle(ButtonStyle.Secondary)
  );
}

function buildItemSelectMenu(customId, placeholder) {
  const options = getCatalog().map(item =>
    new StringSelectMenuOptionBuilder()
      .setLabel(item.name)
      .setValue(item.key)
      .setDescription(item.isCrafted ? 'Craft (receita automática)' : 'Preço de custo manual')
  );
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options)
  );
}

function buildRetiradaTypeSelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('stockv3::select_retirada_tipo')
      .setPlaceholder('Tipo de retirada')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('💰 Venda')
          .setValue('venda')
          .setDescription('Vender artigo — calcula lucro'),
        new StringSelectMenuOptionBuilder()
          .setLabel('🎁 Entrega / Prémio')
          .setValue('entrega')
          .setDescription('Dar a membro — calcula prejuízo')
      )
  );
}

function buildEntryModal(itemKey) {
  const modal = new ModalBuilder()
    .setCustomId(`stockv3::modal_entrada::${itemKey}`)
    .setTitle(`Entrada — ${getItemName(itemKey)}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('qty')
        .setLabel('Quantidade')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Ex: 50')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('total_price')
        .setLabel('Preço Total (€)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Ex: 25000')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Motivo')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('compra / craft / recebimento')
    )
  );
  return modal;
}

function buildSaleModal(itemKey) {
  const modal = new ModalBuilder()
    .setCustomId(`stockv3::modal_venda::${itemKey}`)
    .setTitle(`Venda — ${getItemName(itemKey)}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('qty')
        .setLabel('Quantidade')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Ex: 10')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sale_price')
        .setLabel('Preço de Venda Unitário (€)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Ex: 5000')
    )
  );
  return modal;
}

function buildGiveawayModal(itemKey) {
  const modal = new ModalBuilder()
    .setCustomId(`stockv3::modal_entrega::${itemKey}`)
    .setTitle(`Entrega/Prémio — ${getItemName(itemKey)}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('qty')
        .setLabel('Quantidade')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Ex: 1')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('recipient')
        .setLabel('Membro destinatário (nome ou ID)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Opcional')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Motivo')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('entrega / prémio semanal')
    )
  );
  return modal;
}

function buildPricingModal(itemKey, currentPrice) {
  const modal = new ModalBuilder()
    .setCustomId(`stockv3::modal_preco::${itemKey}`)
    .setTitle(`Preço de Custo — ${getItemName(itemKey)}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('unit_cost')
        .setLabel('Preço de Custo Unitário (€)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(String(currentPrice || 0))
    )
  );
  return modal;
}

async function buildReportEmbeds() {
  const weekly = await getWeeklyReport();
  const monthly = await getMonthlyReport();
  const daily = await getDailyAverage(30);

  const fmt = n => Math.round(Number(n) || 0).toLocaleString('pt-PT') + '€';

  const wEmbed = new EmbedBuilder()
    .setTitle('📊 Semanal')
    .setColor(COLOR.INFO)
    .addFields(
      { name: 'Entradas', value: fmt(weekly.total_entradas), inline: true },
      { name: 'Vendas', value: fmt(weekly.total_vendas), inline: true },
      { name: 'Lucro Bruto', value: fmt(weekly.gross_profit), inline: true },
      { name: 'Lucro Líquido', value: fmt(weekly.net_profit), inline: true },
      { name: 'Prejuízos', value: fmt(weekly.total_loss), inline: true },
      { name: 'Saldo Stock', value: fmt(weekly.stock_value_change), inline: true }
    );

  const mEmbed = new EmbedBuilder()
    .setTitle('📊 Mensal')
    .setColor(COLOR.SUCCESS)
    .addFields(
      { name: 'Entradas', value: fmt(monthly.total_entradas), inline: true },
      { name: 'Vendas', value: fmt(monthly.total_vendas), inline: true },
      { name: 'Lucro Bruto', value: fmt(monthly.gross_profit), inline: true },
      { name: 'Lucro Líquido', value: fmt(monthly.net_profit), inline: true },
      { name: 'Prejuízos', value: fmt(monthly.total_loss), inline: true },
      { name: 'Saldo Stock', value: fmt(monthly.stock_value_change), inline: true }
    );

  const dEmbed = new EmbedBuilder()
    .setTitle('📈 Média Diária (últimos 30d)')
    .setColor(COLOR.WARNING)
    .addFields(
      { name: 'Dias com vendas', value: String(daily.days_with_sales), inline: true },
      { name: 'Vendas/dia', value: fmt(daily.avg_daily_sales), inline: true },
      { name: 'Lucro Bruto/dia', value: fmt(daily.avg_daily_gross), inline: true },
      { name: 'Lucro Líquido/dia', value: fmt(daily.avg_daily_net), inline: true }
    );

  return [wEmbed, mEmbed, dEmbed];
}

module.exports = {
  buildStockV3MainEmbed,
  buildStockV3MainButtons,
  buildItemSelectMenu,
  buildRetiradaTypeSelect,
  buildEntryModal,
  buildSaleModal,
  buildGiveawayModal,
  buildPricingModal,
  buildReportEmbeds,
};
