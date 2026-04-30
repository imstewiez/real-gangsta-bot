'use strict';
const { weeklyGoalService } = require('../services');
const { brandEmbed, progressBar } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  const userTag = interaction.user.tag;

  if (sub === 'listar') {
    const { weekStart } = weeklyGoalService.getWeekBounds();
    const goals = await weeklyGoalService.getGoalsWithProgress(weekStart);
    if (!goals.length) {
      return safeReply(interaction, { content: 'ℹ️ Nenhuma meta definida para esta semana.', flags: 64 });
    }
    const lines = goals.map(g => {
      const pct = Math.round(g.percent_complete || 0);
      const bar = progressBar({ current: pct, max: 100, size: 10 });
      return `**${g.description || g.metric}** ${bar} ${pct}% (${g.current_value || 0}/${g.target_value})`;
    });
    const embed = brandEmbed({ title: '🎯 Metas da Semana', description: lines.join('\n'), messageClass: 'INFO' });
    return safeReply(interaction, { embeds: [embed], flags: 64 });
  }

  if (sub === 'criar') {
    await requirePermission(interaction, { minRole: 'OG' });
    const goal = await weeklyGoalService.createGoal({
      scope: interaction.options.getString('scope'),
      targetId: interaction.options.getString('target'),
      metric: interaction.options.getString('metric'),
      targetValue: interaction.options.getNumber('valor'),
      description: interaction.options.getString('descricao') || '',
      createdBy: userTag,
    });
    return safeReply(interaction, { content: `✅ Meta \`#${goal.id}\` criada.`, flags: 64 });
  }
}

module.exports = { handle };
