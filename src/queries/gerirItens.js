'use strict';
const { MessageFlags } = require('discord.js');
const { itemAdminService } = require('../services');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  if (!(await requirePermission(interaction, { minRole: 'OG' }))) return;
  const sub = interaction.options.getSubcommand();
  const userTag = interaction.user.tag;

  if (sub === 'listar') {
    const items = await itemAdminService.listItems({});
    const lines = items.map(
      i =>
        `\`#${i.id}\` **${i.name}** | ${i.category} | ${i.active ? '🟢' : '🔴'} ${i.orderable ? '📦' : ''} ${i.counts_for_stock ? '📊' : ''} ${i.counts_for_rankings ? '🏆' : ''} | ${Math.round(Number(i.estimated_value)).toLocaleString('pt-PT')}€`
    );
    const embed = brandEmbed('SHORT')
      .setTitle('📦 Catálogo de Itens')
      .setDescription(lines.join('\n') || 'Nenhum item.');
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (sub === 'criar') {
    const item = await itemAdminService.createItem(
      {
        name: interaction.options.getString('nome'),
        category: interaction.options.getString('categoria'),
        unit: interaction.options.getString('unidade'),
        estimatedValue: interaction.options.getNumber('preco_estimado'),
        orderable: interaction.options.getBoolean('encomendavel') ?? true,
        countsForStock: interaction.options.getBoolean('conta_stock') ?? true,
        countsForRankings: interaction.options.getBoolean('conta_rankings') ?? true,
        purchasePrice: interaction.options.getNumber('preco_compra'),
        targetStock: interaction.options.getNumber('stock_alvo'),
      },
      userTag
    );
    return safeReply(interaction, {
      content: `✅ Item **${item.name}** criado com ID \`#${item.id}\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'editar') {
    const id = interaction.options.getInteger('id');
    const fields = {};
    const est = interaction.options.getNumber('preco_estimado');
    if (est !== null) fields.estimated_value = est;
    const ord = interaction.options.getBoolean('encomendavel');
    if (ord !== null) fields.orderable = ord;
    const stk = interaction.options.getBoolean('conta_stock');
    if (stk !== null) fields.counts_for_stock = stk;
    const rn = interaction.options.getBoolean('conta_rankings');
    if (rn !== null) fields.counts_for_rankings = rn;
    const pc = interaction.options.getNumber('preco_compra');
    if (pc !== null) fields.purchase_price = pc;
    const ts = interaction.options.getNumber('stock_alvo');
    if (ts !== null) fields.target_stock = ts;
    const item = await itemAdminService.updateItem(id, fields, userTag);
    return safeReply(interaction, { content: `✅ Item **${item.name}** actualizado.`, flags: MessageFlags.Ephemeral });
  }

  if (sub === 'historico') {
    const id = interaction.options.getInteger('id');
    const history = await itemAdminService.getItemHistory(id);
    const lines = history.map(
      h =>
        `• \`${h.changed_at.toISOString().slice(0, 10)}\` **${h.field_changed}**: ${h.old_value} → ${h.new_value} (${h.changed_by})`
    );
    const embed = brandEmbed('SHORT')
      .setTitle(`📈 Histórico — Item #${id}`)
      .setDescription(lines.join('\n') || 'Sem histórico.');
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

module.exports = { handle };
