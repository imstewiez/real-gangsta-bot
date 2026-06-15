'use strict';

const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { EMOJI, BUTTONS } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');
const { getEntradaMetrics } = require('../repositories/panelRepo');
const { warn } = require('../logger');

async function buildEntradaPanel() {
  let metrics;
  try {
    metrics = await getEntradaMetrics();
  } catch (e) {
    warn(`[ENTRADA] getEntradaMetrics falhou: ${e.message}`);
    metrics = { membros_activos: 0, novos_semana: 0 };
  }

  const safe = metrics || { membros_activos: 0, novos_semana: 0 };

  const embed = new EmbedBuilder()
    .setColor(0x7b2cbf)
    .setTitle(`${EMOJI.TAG} Pedidos de Acesso`)
    .setDescription('Escolhe o tipo de pedido que queres abrir. A equipa responsável analisa e responde assim que possível.')
    .addFields(
      {
        name: `${EMOJI.PARTICIPANTE} Membros activos`,
        value: `**${safe.membros_activos ?? 0}** membros registados`,
        inline: true,
      },
      {
        name: `${EMOJI.ENTRADA} Novos esta semana`,
        value: `**${safe.novos_semana ?? 0}** pedidos aprovados`,
        inline: true,
      }
    )
    .setFooter({ text: '— Ballas Gang', iconURL: CONFIG.BOT_LOGO_URL || undefined });

  if (CONFIG.BOT_LOGO_URL) embed.setThumbnail(CONFIG.BOT_LOGO_URL);

  const bBairrista = BUTTONS.ENTRADA.PEDIR_BAIRRISTA;
  const bTropinha = BUTTONS.ENTRADA.PEDIR_TROPINHA;
  const bPedido = BUTTONS.ENTRADA.MEU_PEDIDO;

  const btnBairrista = button({
    customId: 'onboard::pedir_bairrista',
    label: bBairrista.label,
    style: bBairrista.style,
    emoji: bBairrista.emoji,
  });
  const btnTropinha = button({
    customId: 'onboard::pedir_tropinha',
    label: bTropinha.label,
    style: bTropinha.style,
    emoji: bTropinha.emoji,
  });
  const btnPedido = button({
    customId: 'onboard::meu_pedido',
    label: bPedido.label,
    style: bPedido.style,
    emoji: bPedido.emoji,
  });

  return { embeds: [embed], components: [buttonRow(btnBairrista, btnTropinha, btnPedido)] };
}

module.exports = { buildEntradaPanel };
