'use strict';
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');

const STEPS = [
  { title: '👋 Bem-vindo à Firma!', body: 'Fizeste a escolha certa. Vamos começar o teu percurso.' },
  {
    title: '1️⃣ Canal Pessoal',
    body: 'Tens um canal só teu no Discord. É lá que geres tudo: entregas, vendas, encomendas, saídas.',
  },
  {
    title: '2️⃣ Como Entregar',
    body: 'Clica em **Entregar** no teu canal ou usa `/entrega`. Escolhe item e quantidade.',
  },
  { title: '3️⃣ Como Vender', body: 'Clica em **Vender** ou `/venda`. Define preço se quiseres.' },
  { title: '4️⃣ Disponibilidade', body: 'Vota todos os dias no painel de disponibilidade. Ajuda a chefia a planear.' },
  { title: '5️⃣ Saídas', body: 'Inscreve-te nas saídas anunciadas. Participa, cumpre objectivos, devolve armas.' },
  {
    title: '6️⃣ Progressão',
    body: 'Entrega material e participa em saídas para subir na hierarquia. Usa `/ficha` para ver progresso.',
  },
  { title: '7️⃣ Prémios', body: 'Toda semana o Top 1 ganha um prémio. Dá o teu melhor!' },
];

async function handle(interaction) {
  const step = interaction.options.getInteger('passo') || 1;
  const idx = Math.max(1, Math.min(step, STEPS.length));
  const s = STEPS[idx - 1];
  const embed = brandEmbed({
    title: `${s.title} (${idx}/${STEPS.length})`,
    description: s.body + `\n\nUsa \`/tutorial passo:${idx + 1}\` para o próximo.`,
    messageClass: 'INFO',
  });
  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
