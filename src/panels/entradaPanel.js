'use strict';
const { EmbedBuilder } = require('discord.js');
const { COLOR } = require('../shared/embedBuilders');
const { EMOJI } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { getEntradaMetrics } = require('../repositories/panelRepo');
const { warn } = require('../logger');

// ═══════════════════════════════════════════════════════════════════════════════
// Painel de Entrada — Onboarding
// ═══════════════════════════════════════════════════════════════════════════════

async function buildEntradaPanel() {
  let m;
  try {
    m = await getEntradaMetrics();
  } catch (e) {
    warn(`[ENTRADA] getEntradaMetrics falhou: ${e.message}`);
    m = { membros_activos: 0, novos_semana: 0 };
  }

  const safe = m || { membros_activos: 0, novos_semana: 0 };

  const title = `${EMOJI.SANGUE} O Portão`;
  const description =
    'Bem-vindo à Ballas Gang. Aqui começa o teu percurso — lê as regras, pede a tua tag e mostra o que vales.';

  try {
    const embed = new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle(title)
      .setDescription(description)
      .addFields(
        {
          name: `${EMOJI.PARTICIPANTE} Membros Activos`,
          value: `**${safe.membros_activos ?? 0}** na Ballas Gang`,
          inline: true,
        },
        {
          name: `${EMOJI.SANGUE} Novos esta Semana`,
          value: `**${safe.novos_semana ?? 0}** entradas`,
          inline: true,
        }
      )
      .setFooter({ text: '— Ballas Gang' });

    const btn1 = button({
      customId: 'onboard::pedir_tag',
      label: 'Dar a Cara',
      style: 'Success',
      emoji: EMOJI.TAG,
    });
    const btn2 = button({
      customId: 'onboard::meu_pedido',
      label: 'Ver Regras',
      style: 'Primary',
      emoji: EMOJI.LEIS,
    });

    return { embeds: [embed], components: [buttonRow(btn1, btn2)] };
  } catch (e) {
    warn(`[ENTRADA] build embed falhou: ${e.message}`);
    // Fallback ultra-simples
    const fallback = new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('O Portão')
      .setDescription('Bem-vindo à Ballas Gang.');
    return { embeds: [fallback] };
  }
}

module.exports = { buildEntradaPanel };
