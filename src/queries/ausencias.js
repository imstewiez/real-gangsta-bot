'use strict';
const { absenceRepo } = require('../repositories');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

async function handle(interaction) {
  const sub = interaction.options.getSubcommand();
  const userTag = interaction.user.tag;

  if (sub === 'listar') {
    const status = interaction.options.getString('estado');
    const rows = await absenceRepo.list({ status });
    const lines = rows.map(
      a =>
        `\`#${a.id}\` **${a.display_name}** — ${a.start_date.toISOString().slice(0, 10)} a ${a.end_date.toISOString().slice(0, 10)} | ${a.status}`
    );
    const embed = brandEmbed({
      title: '🏖️ Ausências',
      description: lines.join('\n') || 'Nenhuma.',
      messageClass: 'INFO',
    });
    return safeReply(interaction, { embeds: [embed], flags: 64 });
  }

  if (sub === 'submeter') {
    const { query } = require('../db');
    const r = await query('SELECT id FROM members WHERE discord_id = $1', [interaction.user.id]);
    if (!r.rows.length) return safeReply(interaction, { content: '❌ Não encontrado.', flags: 64 });
    const absence = await absenceRepo.create({
      memberId: r.rows[0].id,
      startDate: interaction.options.getString('inicio'),
      endDate: interaction.options.getString('fim'),
      reason: interaction.options.getString('motivo') || '',
    });
    return safeReply(interaction, {
      content: `✅ Ausência \`#${absence.id}\` submetida (pendente de aprovação).`,
      flags: 64,
    });
  }

  if (sub === 'aprovar') {
    await requirePermission(interaction, { minRole: 'OG' });
    const id = interaction.options.getInteger('id');
    const status = interaction.options.getString('estado');
    await absenceRepo.updateStatus(id, status, userTag);
    return safeReply(interaction, { content: `✅ Ausência \`#${id}\` → ${status}.`, flags: 64 });
  }
}

module.exports = { handle };
