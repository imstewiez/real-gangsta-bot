'use strict';
const { MessageFlags } = require('discord.js');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');

const TOPICS = {
  entregar: {
    title: '📥 Como Entregar Material',
    body: 'Usa o botão **Entregar** no teu canal pessoal ou o comando `/entrega`.\nEscolhe o item, quantidade e confirma.\nA entrega fica pendente até aprovação da chefia.',
  },
  vender: {
    title: '💰 Como Vender',
    body: 'Usa o botão **Vender** no teu canal ou `/venda`.\nDefine item, quantidade e preço (opcional).\nVendas também precisam de aprovação OG+.',
  },
  encomendar: {
    title: '📦 Como Encomendar',
    body: 'No painel Bairrista, clica em **Encomendar**.\nEscolhe categoria → item → quantidade.\nAcompanha estado em `/meu-painel`.',
  },
  saidas: {
    title: '🚗 Como Participar em Saídas',
    body: 'Quando uma saída é anunciada, clica em **Inscrever**.\nApós a saída, o líquida resultados.\nDevolve armas no prazo!',
  },
  premios: {
    title: '🏆 Como Funcionam os Prémios',
    body: 'Toda semana o Top 1 de contribuição ganha um prémio.\nA chefia define o prémio e marca como entregue.\nHistórico em `/ranking`.',
  },
  disponibilidade: {
    title: '📅 Disponibilidade Diária',
    body: 'Vota todos os dias no painel de disponibilidade.\nEscolhe os horários em que podes aparecer.\nIsto ajuda a chefia a planear saídas.',
  },
  cargos: {
    title: '👑 Hierarquia',
    body: '**Manda-Chuva** → **Kingpin** → **OG** → **Patrão di Zona** → **Oficial** → **Bairrista** → **Young Blood**\n\nPromoções automáticas por material entregue/vendido.',
  },
};

async function handle(interaction) {
  const topic = interaction.options.getString('topico');
  if (topic && TOPICS[topic]) {
    const t = TOPICS[topic];
    const embed = brandEmbed('SHORT').setTitle(t.title).setDescription(t.body);
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  const lines = Object.entries(TOPICS).map(([k, v]) => `• **${k}** — ${v.title}`);
  const embed = brandEmbed('SHORT')
    .setTitle('📖 Centro de Ajuda')
    .setDescription(`Escolhe um tópico:\n${lines.join('\n')}\n\nUsa \`/ajuda <tópico>\` para detalhes.`);
  return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
}

module.exports = { handle };
