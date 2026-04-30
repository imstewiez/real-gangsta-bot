'use strict';
const { MessageFlags } = require('discord.js');
const { taskRepo } = require('../repositories');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  const userTag = interaction.user.tag;

  if (sub === 'listar') {
    const memberId = interaction.options.getMember('membro')?.id;
    let dbMemberId = null;
    if (memberId) {
      const { query } = require('../db');
      const r = await query('SELECT id FROM members WHERE discord_id = $1', [memberId]);
      dbMemberId = r.rows[0]?.id;
    }
    const rows = await taskRepo.list({ memberId: dbMemberId, limit: 20 });
    const lines = rows.map(t => `\`#${t.id}\` **${t.title}** — ${t.status} | ${t.display_name}`);
    const embed = brandEmbed('SHORT')
      .setTitle('📋 Tarefas')
      .setDescription(lines.join('\n') || 'Nenhuma.');
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (sub === 'criar') {
    await requirePermission(interaction, { minRole: 'OG' });
    const member = interaction.options.getMember('membro');
    const { query } = require('../db');
    const r = await query('SELECT id FROM members WHERE discord_id = $1', [member.id]);
    const task = await taskRepo.create({
      title: interaction.options.getString('titulo'),
      description: interaction.options.getString('descricao') || '',
      type: interaction.options.getString('tipo') || 'custom',
      targetMemberId: r.rows[0]?.id,
      assignedBy: userTag,
      dueAt: interaction.options.getString('prazo') || null,
    });
    return safeReply(interaction, {
      content: `✅ Tarefa \`#${task.id}\` atribuída a ${member.displayName}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'atualizar') {
    const id = interaction.options.getInteger('id');
    const status = interaction.options.getString('estado');
    const task = await taskRepo.updateStatus(id, status);
    return safeReply(interaction, { content: `✅ Tarefa \`#${task.id}\` → ${status}.`, flags: MessageFlags.Ephemeral });
  }
}

module.exports = { handle };
