'use strict';
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

const ROLE_PERMS = {
  young_blood: {
    canDeliver: true,
    canSell: false,
    canOrder: true,
    canJoinSaida: true,
    canSeeStock: false,
    adminPanel: false,
  },
  bairrista: {
    canDeliver: true,
    canSell: true,
    canOrder: true,
    canJoinSaida: true,
    canSeeStock: true,
    adminPanel: false,
  },
  official: {
    canDeliver: true,
    canSell: true,
    canOrder: true,
    canJoinSaida: true,
    canSeeStock: true,
    adminPanel: false,
  },
  patrao_di_zona: {
    canDeliver: true,
    canSell: true,
    canOrder: true,
    canJoinSaida: true,
    canSeeStock: true,
    adminPanel: true,
  },
  og: { canDeliver: true, canSell: true, canOrder: true, canJoinSaida: true, canSeeStock: true, adminPanel: true },
};

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });
  const role = interaction.options.getString('cargo');
  const perms = ROLE_PERMS[role];
  if (!perms) return safeReply(interaction, { content: '❌ Cargo desconhecido.', flags: 64 });

  const lines = [
    `📥 Entregar: ${perms.canDeliver ? '✅' : '❌'}`,
    `💰 Vender: ${perms.canSell ? '✅' : '❌'}`,
    `📦 Encomendar: ${perms.canOrder ? '✅' : '❌'}`,
    `🚗 Saídas: ${perms.canJoinSaida ? '✅' : '❌'}`,
    `📊 Ver Stock: ${perms.canSeeStock ? '✅' : '❌'}`,
    `⚙️ Painel Admin: ${perms.adminPanel ? '✅' : '❌'}`,
  ];

  const embed = brandEmbed({
    title: `🔮 Simulação — ${role}`,
    description: lines.join('\n'),
    messageClass: 'INFO',
  });
  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
