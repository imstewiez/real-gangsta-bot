'use strict';
const { MessageFlags } = require('discord.js');
const { memberLifecycleRepo } = require('../repositories');
const { brandEmbed } = require('../shared/embedBuilders');
const { safeReply } = require('../shared/interactionHelpers');
const { requirePermission } = require('../shared/requirePermission');

const STATES = {
  pending: '⏳ Pendente',
  active: '🟢 Activo',
  away: '🔴 Ausente',
  on_review: '🔍 Em Avaliação',
  promoted: '⬆️ Promovido',
  demoted: '⬇️ Rebaixado',
  removed: '❌ Removido',
  left_discord: '👋 Saiu do Discord',
};

async function handle(interaction) {
  await requirePermission(interaction, { minRole: 'OG' });
  const sub = interaction.options.getSubcommand();
  const userTag = interaction.user.tag;

  if (sub === 'ver') {
    const member = interaction.options.getMember('membro') || interaction.member;
    const discordId = member.id;
    const { query } = require('../db');
    const r = await query(
      'SELECT id, lifecycle_state, lifecycle_changed_at, lifecycle_notes FROM members WHERE discord_id = $1',
      [discordId]
    );
    if (!r.rows.length)
      return safeReply(interaction, { content: '❌ Membro não encontrado na DB.', flags: MessageFlags.Ephemeral });
    const m = r.rows[0];
    const history = await memberLifecycleRepo.getHistory(m.id, { limit: 5 });
    const histLines = history.map(
      h => `• ${STATES[h.old_state] || h.old_state} → ${STATES[h.new_state] || h.new_state} (${h.changed_by})`
    );
    const embed = brandEmbed('SHORT')
      .setTitle(`👤 Lifecycle — ${member.displayName}`)
      .setDescription(
        `**Estado:** ${STATES[m.lifecycle_state] || m.lifecycle_state}\n**Desde:** <t:${Math.floor(new Date(m.lifecycle_changed_at).getTime() / 1000)}:R>\n**Notas:** ${m.lifecycle_notes || '—'}`
      );
    if (histLines.length) embed.addFields({ name: '📜 Histórico recente', value: histLines.join('\n') });
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }

  if (sub === 'mudar') {
    const member = interaction.options.getMember('membro');
    const newState = interaction.options.getString('estado');
    const reason = interaction.options.getString('motivo') || '';
    const { query } = require('../db');
    const r = await query('SELECT id, lifecycle_state FROM members WHERE discord_id = $1', [member.id]);
    if (!r.rows.length)
      return safeReply(interaction, { content: '❌ Membro não encontrado.', flags: MessageFlags.Ephemeral });
    const memberId = r.rows[0].id;
    const result = await memberLifecycleRepo.transition({ memberId, newState, changedBy: userTag, reason });
    return safeReply(interaction, {
      content: `✅ ${member.displayName}: ${STATES[result.oldState]} → ${STATES[result.newState]}${reason ? ` (*${reason}*)` : ''}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === 'listar') {
    const state = interaction.options.getString('estado');
    const rows = await memberLifecycleRepo.listByState(state);
    const lines = rows.map(
      r =>
        `• **${r.display_name}** (${r.role}) — <t:${Math.floor(new Date(r.lifecycle_changed_at).getTime() / 1000)}:R>`
    );
    const embed = brandEmbed('SHORT')
      .setTitle(`${STATES[state] || state} — ${rows.length} membro(s)`)
      .setDescription(lines.join('\n') || 'Nenhum.');
    return safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

module.exports = { handle };
