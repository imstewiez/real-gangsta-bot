'use strict';
/**
 * Patrão di Zona panel — acções de botão do painel `patrao::*`.
 *
 *   - listar_bairristas — lista bairristas activos
 *   - ver_entregas      — top de entregas por bairrista
 *   - ver_vendas        — top de vendas por bairrista
 *   - ver_tops          — top semanal dos bairristas
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, rankingEmbed } = require('../shared/embedBuilders');
const { ERRORS } = require('../content');
const { isPatraoDiZona } = require('../permissions/permissionEngine');
const { DELIVERY_TYPES, SALE_TYPES } = require('../shared/movementTypes');
const { query } = require('../db');
const { weekBounds } = require('../util');
const { formatPtDateOnly } = require('../shared/formatPtDate');

async function listarBairristas(interaction) {
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('listar bairristas'),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const res = await query("SELECT * FROM members WHERE role = 'bairrista' AND status = 'ativo' ORDER BY display_name");
  const bairristas = res.rows;
  if (!bairristas.length) {
    return safeReply(interaction, { content: 'Sem bairristas registados.' }, { messageClass: 'BANAL' });
  }
  const lines = bairristas.map(m => `<@${m.discord_id}> — ${m.display_name} (desde ${formatPtDateOnly(m.joined_at)})`);
  const embed = brandEmbed().setTitle('Bairristas').setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

async function verEntregasOuVendas(interaction) {
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('ver dados'),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const id = interaction.customId;
  const types = id.includes('entregas') ? DELIVERY_TYPES : SALE_TYPES;
  const label = id.includes('entregas') ? 'Entregas' : 'Vendas';
  const res = await query(
    `
    SELECT m.display_name, m.discord_id, SUM(im.quantity) as total
    FROM inventory_movements im
    JOIN members m ON m.id = im.member_id
    WHERE im.movement_type = ANY($1)
    GROUP BY m.display_name, m.discord_id
    ORDER BY total DESC LIMIT 20
  `,
    [types]
  );
  if (!res.rows.length) {
    return safeReply(
      interaction,
      {
        content: `Sem ${label.toLowerCase()} registadas.`,
      },
      { messageClass: 'BANAL' }
    );
  }
  const lines = res.rows.map((r, i) => `**${i + 1}.** <@${r.discord_id}> — ${r.total} unidades`);
  const embed = brandEmbed().setTitle(`${label} por Bairrista`).setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

async function verTopsBairristas(interaction) {
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(
      interaction,
      {
        content: ERRORS.NO_PERMISSION('ver tops'),
        flags: MessageFlags.Ephemeral,
      },
      { messageClass: 'BANAL' }
    );
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { rankingRepo } = require('../repositories');
  const { start, end } = weekBounds();
  const weekStart = start.toISOString().split('T')[0];
  const rankings = await rankingRepo.getWeekRankingByRole(weekStart, 'bairrista', 10);
  const weekLabel = `${formatPtDateOnly(start)} a ${formatPtDateOnly(end)}`;
  const embed = rankingEmbed('Top Bairristas', rankings, weekLabel);
  return safeReply(interaction, { embeds: [embed] }, { messageClass: 'BANAL' });
}

module.exports = {
  listarBairristas,
  verEntregasOuVendas,
  verTopsBairristas,
};
