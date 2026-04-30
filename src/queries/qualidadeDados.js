'use strict';
const { dataQualityRepo } = require('../repositories');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });
  const issues = await dataQualityRepo.getAllIssues();

  const sections = [];
  if (issues.membersWithoutRecord.length)
    sections.push(`👤 Membros sem registro: **${issues.membersWithoutRecord.length}**`);
  if (issues.orphanChannels.length) sections.push(`🏠 Canais órfãos: **${issues.orphanChannels.length}**`);
  if (issues.unfinalizedSaidas.length)
    sections.push(`🚗 Saídas não finalizadas (>48h): **${issues.unfinalizedSaidas.length}**`);
  if (issues.ordersWithoutPrice.length)
    sections.push(`📦 Encomendas sem preço: **${issues.ordersWithoutPrice.length}**`);
  if (issues.deliveryRequestsWithoutMember.length)
    sections.push(`📥 Entregas sem membro: **${issues.deliveryRequestsWithoutMember.length}**`);
  if (issues.staleSheetSync.length) sections.push(`📊 Sheets stale: **${issues.staleSheetSync.length}**`);
  if (issues.membersWithRoleButNoFicha.length)
    sections.push(`📝 Sem ficha: **${issues.membersWithRoleButNoFicha.length}**`);
  if (issues.pendingDeliveries.length) sections.push(`⏳ Entregas pendentes: **${issues.pendingDeliveries.length}**`);
  if (issues.pendingOrders.length) sections.push(`⏳ Encomendas pendentes: **${issues.pendingOrders.length}**`);
  if (issues.pendingPrizes.length) sections.push(`🏆 Prémios por definir: **${issues.pendingPrizes.length}**`);

  const total =
    issues.totalIssues + issues.pendingDeliveries.length + issues.pendingOrders.length + issues.pendingPrizes.length;
  const color = total === 0 ? 'SUCCESS' : total < 5 ? 'WARNING' : 'DANGER';

  const embed = brandEmbed({
    title: `🔍 Qualidade dos Dados — ${total === 0 ? '✅ Tudo OK' : `${total} problema(s)`}`,
    description: sections.join('\n') || '✅ Nenhum problema detectado.',
    messageClass: color,
  });
  return safeReply(interaction, { embeds: [embed], flags: 64 });
}

module.exports = { handle };
