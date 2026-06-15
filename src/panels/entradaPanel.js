'use strict';

const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');
const { EMOJI, BUTTONS } = require('../content');
const { button, buttonRow } = require('../shared/ui/buttons');

async function buildEntradaPanel() {
  const logoUrl = CONFIG.BALLAS_GANG_LOGO_URL || CONFIG.BOT_LOGO_URL;

  const embed = new EmbedBuilder()
    .setColor(0x7b2cbf)
    .setTitle(`${EMOJI.TAG} Bem-vindo ao Bairro`)
    .setDescription(
      'Faz aqui o teu pedido de tag para a Ballas Gang.\n\n' +
        'Escolhe a opção certa, preenche o formulário e aguarda a análise da equipa responsável.'
    )
    .setFooter({ text: '— Ballas Gang', iconURL: logoUrl || undefined });

  if (logoUrl) embed.setThumbnail(logoUrl);

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
