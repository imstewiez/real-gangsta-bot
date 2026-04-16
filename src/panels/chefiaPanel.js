'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { PANELS, BUTTONS } = require('../content');

// Centro de Comando — painel da chefia.
// 15 acções organizadas em 4 rows com hierarquia visual clara:
//   row 1 — Saídas (Nova, Fechar, Ver, Participantes)
//   row 2 — Material (da Saída, Fornecer, Stock, Ajustar, Gerir)
//   row 3 — Gestão (Presença, Rádio, Stickys)
//   row 4 — Dados (Topo, Stats, Logs)
// Cores: Success=acção primária, Danger=destrutiva, Primary=ver/aceder,
// Secondary=auxiliar.
function buildChefiaPanel() {
  const embed = applyLogo(brandEmbed('MOVEMENT')
    .setTitle(PANELS.CHEFIA.TITLE)
    .setDescription(PANELS.CHEFIA.DESCRIPTION));

  const B = BUTTONS.CHEFIA;
  const btn = (customId, def) =>
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(def.label)
      .setStyle(ButtonStyle[def.style])
      .setEmoji(def.emoji);

  // Row 1 — Saídas
  const row1 = new ActionRowBuilder().addComponents(
    btn('chefia::criar_saida', B.CRIAR_SAIDA),
    btn('chefia::fechar_saida', B.FECHAR_SAIDA),
    btn('chefia::ver_saidas', B.VER_SAIDAS),
    btn('chefia::adicionar_participante', B.PARTICIPANTES),
  );

  // Row 2 — Material
  const row2 = new ActionRowBuilder().addComponents(
    btn('chefia::registar_material_saida', B.MATERIAL_SAIDA),
    btn('chefia::fornecer_participante', B.FORNECER),
    btn('chefia::ver_stock', B.VER_STOCK),
    btn('chefia::ajustar_stock', B.AJUSTAR_STOCK),
    btn('chefia::gerir_materiais', B.GERIR_MATERIAIS),
  );

  // Row 3 — Gestão
  const row3 = new ActionRowBuilder().addComponents(
    btn('chefia::abrir_disponibilidade', B.DISPONIBILIDADE),
    btn('chefia::publicar_radio', B.RADIO),
    btn('chefia::listar_stickys', B.STICKYS),
  );

  // Row 4 — Dados
  const row4 = new ActionRowBuilder().addComponents(
    btn('chefia::ver_tops', B.TOPS),
    btn('chefia::stats_open', B.STATS),
    btn('chefia::ver_logs', B.LOGS),
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

module.exports = { buildChefiaPanel };
