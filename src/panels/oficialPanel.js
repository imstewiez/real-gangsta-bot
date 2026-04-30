'use strict';
const { brandEmbed, applyLogo, COLOR } = require('../shared/embedBuilders');
const { PANELS, BUTTONS, EMOJI } = require('../content');
const { buttonFromDef, button, buttonRow } = require('../shared/ui/buttons');

// ══════════════════════════════════════════════════════════════════════════════
// Painel do Oficial — Secretaria (RENOVADO v9)
// ══════════════════════════════════════════════════════════════════════════════
// Row 1: Saídas e operações (core)
// Row 2: Material e cockpit pessoal
// Row 3: Estatísticas e dados

function buildOficialPanel() {
  const embed = applyLogo(
    brandEmbed('SHORT')
      .setColor(COLOR.INFO)
      .setTitle(`${EMOJI.VITORIA} A Secretaria | Firma RedWood`)
      .setDescription(
        '**Aqui abre-se a rua, aqui fecha-se a conta.**\n' +
        'Oficial é quem põe o nome em cima — saídas, registos, linha do bairro. Se decides, responsabilizas-te.\n\n' +
        `${EMOJI.SAIDA} **Sessões** — abrir, consultar, fechar saídas.\n` +
        `${EMOJI.TOPO} **Estatísticas** — kills, spots, rankings da firma.\n` +
        `${EMOJI.ENTREGA} **Material** — registar entregas ou vendas.\n` +
        `${EMOJI.FIRMA} **O teu Movimento** — o teu peso no bairro.\n\n` +
        '_Puxar a rua é peso. Leva-o com mão firme._'
      )
  );

  // Row 1 — Saídas e operações (core do Oficial)
  const row1 = buttonRow(
    button({ customId: 'chefia::criar_saida', label: 'Nova Sessão', style: 'Success', emoji: EMOJI.SAIDA }),
    button({ customId: 'oficial::ver_saidas', label: 'Ver Saídas', style: 'Primary', emoji: EMOJI.SAIDA }),
    button({ customId: 'chefia::stats_open', label: 'Estatísticas', style: 'Primary', emoji: EMOJI.TOPO })
  );

  // Row 2 — Material + cockpit pessoal (Oficiais também são Bairristas)
  const row2 = buttonRow(
    button({
      customId: 'bairrista::registar_material',
      label: 'Registar Material',
      style: 'Secondary',
      emoji: EMOJI.ENTREGA,
    }),
    button({ customId: 'bairrista::movimento', label: 'O meu Movimento', style: 'Secondary', emoji: EMOJI.FIRMA }),
    button({ customId: 'bairrista::ranking', label: 'Ranking', style: 'Secondary', emoji: EMOJI.MEDAL_1 })
  );

  // Row 3 — Dados e gestão
  const row3 = buttonRow(
    button({ customId: 'bairrista::encomendar', label: 'Encomendar', style: 'Secondary', emoji: EMOJI.ENCOMENDA }),
    button({ customId: 'bairrista::historico', label: 'Histórico', style: 'Secondary', emoji: EMOJI.AUDIT }),
    button({ customId: 'bairrista::progresso', label: 'Progresso', style: 'Secondary', emoji: EMOJI.TOPO })
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildOficialPanel };
