'use strict';
const { brandEmbed, applyLogo } = require('../shared/embedBuilders');
const { PANELS, BUTTONS } = require('../content');
const { buttonFromDef, buttonRow } = require('../shared/ui/buttons');

// Centro de Comando — painel da chefia (hub de alto nível).
//
// Sub-passos de fluxos (adicionar participante, fornecer material, fechar
// sessão, preencher resultado) vivem AGORA dentro do painel da sessão,
// não aqui. Aqui ficam só acções de topo.
//
// Presença diária é 100% automática via availability_auto_publish job —
// sem botão redundante.
//
// Layout: 3 rows · 8 botões.
function buildChefiaPanel() {
  const embed = applyLogo(
    brandEmbed('MOVEMENT').setTitle(PANELS.CHEFIA.TITLE).setDescription(PANELS.CHEFIA.DESCRIPTION)
  );

  const B = BUTTONS.CHEFIA;
  const btn = buttonFromDef;

  // Row 1 — Saídas (só abrir uma nova ou consultar existentes)
  const row1 = buttonRow(btn('chefia::criar_saida', B.CRIAR_SAIDA), btn('chefia::ver_saidas', B.VER_SAIDAS));

  // Row 2 — Stock
  const row2 = buttonRow(
    btn('chefia::ver_stock', B.VER_STOCK),
    btn('chefia::ajustar_stock', B.AJUSTAR_STOCK),
    btn('chefia::gerir_materiais', B.GERIR_MATERIAIS)
  );

  // Row 3 — Gestão + Dados. Rádio tem painel próprio em RADIO_PANEL_CHANNEL_ID.
  const row3 = buttonRow(
    btn('chefia::listar_stickys', B.STICKYS),
    btn('chefia::ver_tops', B.TOPS),
    btn('chefia::ver_logs', B.LOGS)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildChefiaPanel };
