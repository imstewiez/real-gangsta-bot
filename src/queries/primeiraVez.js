'use strict';
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');

const STEPS = [
  '👋 **Bem-vindo!** Este é o teu canal pessoal na firma.',
  '📅 **Disponibilidade** — Vota todos os dias nos horários em que podes aparecer.',
  '📥 **Entregar** — Usa o botão Entregar ou `/entrega` para registar material.',
  '💰 **Vender** — Usa o botão Vender ou `/venda` para registar vendas.',
  '📦 **Encomendar** — Clica em Encomendar no painel para pedir material.',
  '🚗 **Saídas** — Inscreve-te nas saídas anunciadas. Participa e cumpre!',
  '🏆 **Prémios** — Toda semana o Top 1 ganha um prémio. Dá o teu melhor!',
  '📊 **Ficha** — Usa `/ficha` para ver o teu progresso e `/meu-resumo` para resumo semanal.',
];

async function handle(interaction) {
  const lines = STEPS.map((s, i) => `${i + 1}. ${s}`);
  const embed = brandEmbed({
    title: '🎓 Guia de Primeira Utilização',
    description: lines.join('\n\n'),
    messageClass: 'INFO',
  });
  embed.setFooter({ text: 'Usa /tutorial para um tutorial passo-a-passo.' });
  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
