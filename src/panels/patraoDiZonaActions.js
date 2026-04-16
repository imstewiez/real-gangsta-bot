'use strict';
/**
 * Patrão di Zona panel — acções de botão do painel `chefe_mor::*`.
 *
 *   - listar_moradores  — lista Bairristas activos
 *   - ver_entregas      — top de entregas por Bairrista
 *   - ver_vendas        — top de vendas por Bairrista
 *   - ver_tops          — top semanal dos Bairristas
 */

const { MessageFlags } = require('discord.js');
const { safeReply } = require('../shared/interactionHelpers');
const { brandEmbed, rankingEmbed } = require('../shared/embedBuilders');
const { ERRORS } = require('../content');
const { isPatraoDiZona } = require('../permissions/permissionEngine');
const { query } = require('../db');
const { weekBounds } = require('../util');

async function listarBairristas(interaction) {
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('listar bairristas'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const res = await query(
    `SELECT * FROM members WHERE role IN ('bairrista', 'morador') AND status = 'ativo' ORDER BY display_name`
  );
  const bairristas = res.rows;
  if (!bairristas.length) {
    return safeReply(interaction, { content: 'Sem bairristas registados.' }, { dismissible: true });
  }
  const lines = bairristas.map(m =>
    `<@${m.discord_id}> — ${m.display_name} (desde ${m.joined_at?.toISOString?.()?.split('T')[0] || '-'})`
  );
  const embed = brandEmbed().setTitle('Bairristas').setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

async function verEntregasOuVendas(interaction) {
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('ver dados'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const id = interaction.customId;
  const types = id.includes('entregas')
    ? ['entrega_bairrista', 'entrega_morador']
    : ['venda_bairrista', 'venda_morador'];
  const label = id.includes('entregas') ? 'Entregas' : 'Vendas';
  const res = await query(`
    SELECT m.display_name, m.discord_id, SUM(im.quantity) as total
    FROM inventory_movements im
    JOIN members m ON m.id = im.member_id
    WHERE im.movement_type = ANY($1)
    GROUP BY m.display_name, m.discord_id
    ORDER BY total DESC LIMIT 20
  `, [types]);
  if (!res.rows.length) {
    return safeReply(interaction, {
      content: `Sem ${label.toLowerCase()} registadas.`,
    }, { dismissible: true });
  }
  const lines = res.rows.map((r, i) => `**${i + 1}.** <@${r.discord_id}> — ${r.total} unidades`);
  const embed = brandEmbed().setTitle(`${label} por Bairrista`).setDescription(lines.join('\n'));
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

async function verTopsBairristas(interaction) {
  if (!isPatraoDiZona(interaction.member)) {
    return safeReply(interaction, {
      content: ERRORS.NO_PERMISSION('ver tops'),
      flags: MessageFlags.Ephemeral,
    }, { dismissible: true });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { rankingRepo } = require('../repositories');
  const { start, end } = weekBounds();
  const weekStart = start.toISOString().split('T')[0];
  // Primeiro tenta role novo; fallback para legacy.
  let rankings = await rankingRepo.getWeekRankingByRole(weekStart, 'bairrista', 10);
  if (!rankings.length) rankings = await rankingRepo.getWeekRankingByRole(weekStart, 'morador', 10);
  const weekLabel = `${start.toISOString().split('T')[0]} a ${end.toISOString().split('T')[0]}`;
  const embed = rankingEmbed('Top Bairristas', rankings, weekLabel);
  return safeReply(interaction, { embeds: [embed] }, { dismissible: true });
}

module.exports = {
  listarBairristas,
  verEntregasOuVendas,
  verTopsBairristas,
};
