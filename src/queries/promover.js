'use strict';
const { MessageFlags } = require('discord.js');
const { query } = require('../db');
const { brandEmbed, progressBar } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');
const { promoteMember, demoteMember } = require('../members/promotionEngine');

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });
  const sub = interaction.options.getSubcommand();
  const userTag = interaction.user.tag;

  if (sub === 'proximos') {
    const r = await query(
      `SELECT m.id, m.discord_id, m.display_name, m.role,
        COALESCE(ms.total_delivered, 0) as delivered,
        COALESCE(ms.total_sold, 0) as sold
       FROM members m
       LEFT JOIN member_stats ms ON ms.member_id = m.id
       WHERE m.status = 'ativo' AND m.role = 'bairrista'
       ORDER BY (COALESCE(ms.total_delivered,0) + COALESCE(ms.total_sold,0)) DESC
       LIMIT 10`
    );
    const lines = r.rows.map((row, i) => {
      const total = Number(row.delivered) + Number(row.sold);
      const bar = progressBar(Math.min(total, 500), 500, { width: 8 });
      return `${i + 1}. **${row.display_name}** ${bar} ${total}`;
    });
    const embed = brandEmbed('TOP').setTitle('⬆️ Próximos a Promoção').setDescription(lines.join('\n'));
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (sub === 'promover') {
    const member = interaction.options.getMember('membro');
    const newRole = interaction.options.getString('cargo');
    const reason = interaction.options.getString('motivo') || '';
    const mr = await query('SELECT id, role FROM members WHERE discord_id = $1', [member.id]);
    if (!mr.rows.length)
      return safeReply(interaction, { content: '❌ Membro não encontrado.', flags: MessageFlags.Ephemeral });
    const memberRecord = mr.rows[0];
    await promoteMember(memberRecord.id, newRole, {
      guildMember: member,
      client: interaction.client,
      reason,
      actorTag: userTag,
      actorId: interaction.user.id,
      changedBy: interaction.user.id,
    });
    return safeReply(interaction, {
      content: `✅ **${member.displayName}** promovido para **${newRole}**${reason ? ` — ${reason}` : ''}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'rebaixar') {
    const member = interaction.options.getMember('membro');
    const newRole = interaction.options.getString('cargo');
    const reason = interaction.options.getString('motivo') || '';
    const mr = await query('SELECT id, role FROM members WHERE discord_id = $1', [member.id]);
    if (!mr.rows.length)
      return safeReply(interaction, { content: '❌ Membro não encontrado.', flags: MessageFlags.Ephemeral });
    const memberRecord = mr.rows[0];
    await demoteMember(memberRecord.id, newRole, {
      guildMember: member,
      client: interaction.client,
      reason,
      actorTag: userTag,
      actorId: interaction.user.id,
      changedBy: interaction.user.id,
    });
    return safeReply(interaction, {
      content: `⬇️ **${member.displayName}** rebaixado para **${newRole}**${reason ? ` — ${reason}` : ''}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { handle };
